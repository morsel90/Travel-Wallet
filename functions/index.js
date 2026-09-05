/**
 * Cloud Functions لتطبيق "مصاريف السفر".
 *
 * 🆕 نموذج الوصول الحالي (يُلغي رمز الرحلة/PIN والجلسات المجهولة نهائياً —
 * انظر docs/DECISIONS.md لتاريخ القرار وسببه): العضوية في رحلة تُمنح حصراً عبر
 * joinViaInvite (رابط دعوة موقَّع)، ولحساب حقيقي (Google أو بريد/كلمة مرور)
 * لا لجلسة مجهولة — الدالة ترفض أي استدعاء من جلسة sign_in_provider ==
 * 'anonymous' صراحةً. النتيجة Custom Claim باسم `trips` (خريطة
 * { [tripId]: true }) على حساب المستخدم، وهو ما تتحقق منه قواعد Firestore
 * (انظر firestore.rules: isMember(appId)) للسماح بالقراءة والكتابة ضمن مسار
 * هذه الرحلة تحديداً — لا يمنح أي صلاحية على رحلات أخرى.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const Sentry = require('@sentry/google-cloud-serverless');
const { scrubServerEvent } = require('./errorScrubbing');

admin.initializeApp();

const db = admin.firestore();

// 🆕 تتبع الأخطاء (Sentry) — أول استخدام لـ defineSecret في هذا الملف. كل
// دالة onCall/onSchedule مُصدَّرة تحتاج secrets: [SENTRY_DSN] في إعداداتها كي
// تصل النسخة السرّ فعلياً (Cloud Functions v2 لا تتيحه إلا لما أُعلِن صراحة).
// انظر docs/DECISIONS.md لسبب اختيار Sentry موحّداً مع العميل بدل الاكتفاء
// بـ Cloud Error Reporting المجاني (الذي يبقى يعمل تلقائياً بصرف النظر، عبر
// console.error أدناه).
const SENTRY_DSN = defineSecret('SENTRY_DSN');

function initSentryOnce() {
  if (Sentry.getClient()) return; // نسخة دافئة (warm start) — لا تُهيَّأ مرتين
  const dsn = SENTRY_DSN.value();
  if (!dsn) return; // نفس منطق العميل (src/sentry.ts): بلا DSN لا تتبع، بلا كسر
  Sentry.init({
    dsn,
    environment: process.env.GCLOUD_PROJECT === 'travelapp-87206' ? 'production' : 'staging',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubServerEvent,
  });
}

// يغلّف كل دالة مُصدَّرة: يسجّل الاستثناء في Sentry محتفظاً بوسم [اسم_الدالة]
// الحالي في console.error، ثم يعيد رميه كما هو — لا يغيّر HttpsError ولا
// الكود الذي يصل العميل. لا يُضاف لالتقاطات best-effort الداخلية (مثال:
// [recordMembership] تعذّر تسجيل...) — تلك فشل مُحتوى عمداً لا يُفشل الطلب
// كاملاً، Cloud Logging يلتقطها بصرف النظر عن Sentry.
function withSentry(fnName, handler) {
  return async (...args) => {
    initSentryOnce();
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`[${fnName}]`, err);
      Sentry.captureException(err, { tags: { function: fnName } });
      await Sentry.flush(2000);
      throw err;
    }
  };
}

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts —
// إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً، لمنع tripId
// من أن يتحول لمسار Firestore خبيث أو معرّف غير متوقع.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// 🆕 حدّ Firebase لحجم الـ custom claims هو 1000 بايت. عضوية الرحلات تُخزَّن في
// الـ claims (`trips: { [tripId]: true }`) لأن firestore.rules تقرأها من التوكن
// مباشرةً — وهي قراءة **مجانية**، بخلاف تخزينها في Firestore الذي يفرض get()
// مفوتراً في كل قاعدة تقريباً. المقايضة مقصودة، لكن لها سقف.
//
// القياس بمعرّف بطول `travelapp-87206` (16 حرفاً): ~25 بايت لكل رحلة، فالسقف
// ~39 رحلة. معرّفات أطول تُخفّضه.
//
// ⚠️ طريقة الفشل بلا هذا الحارس مضلّلة: المصادقة **لا** تنكسر والتوكنات القائمة
// تبقى صالحة تماماً — الذي يفشل هو *الانضمام*، إذ يرمي setCustomUserClaims
// خطأً يصل للمستخدم كـ `internal` غامض لا علاقة له بالسبب.
const CLAIMS_BYTE_BUDGET = 900;

// 🆕 حدّ زمني للإنشاء الذاتي للرحلات (manageTrip mode: 'create'، غير المسؤول
// فقط — نفس مبدأ استثناء المسؤول من حدّ المصاريف في useExpenseActions.ts).
// لا يمنع إساءة كاملة، فقط سكربتاً يُنشئ عشرات الرحلات في ثوانٍ.
const SELF_SERVE_TRIP_COOLDOWN_MS = 60 * 1000;

function assertClaimsFitTokenLimit(claims) {
  const size = Buffer.byteLength(JSON.stringify(claims));
  if (size > CLAIMS_BYTE_BUDGET) {
    // الميزانية 900 لا 1000 عمداً: تترك مجالاً لـ `admin: true` ولأي claim
    // يُضاف مستقبلاً، فلا يتحول التوسعة الصغيرة إلى عطل عند الحدّ مباشرةً.
    throw new HttpsError(
      'resource-exhausted',
      'بلغت الحد الأقصى لعدد الرحلات على هذا الحساب. تواصل مع المسؤول لإزالة رحلة قديمة.',
    );
  }
}

// ─── 🆕 سجلّ عضوية الرحلة ────────────────────────────────────────────────────
//
// trips/{tripId}/members/{uid}
//
// **لماذا وُجد أصلاً:** العضوية تعيش في custom claims حساب العضو نفسه، وFirebase
// Auth **لا يقبل استعلاماً على الـ claims**. فبلا هذا السجلّ لا أحد — لا التطبيق
// ولا المسؤول — يستطيع معرفة *من* في الرحلة؛ التعداد يوجب المرور على
// listUsers() لكل مستخدمي المشروع. أي أن العضوية كانت غير قابلة للتعداد ومن ثمّ
// غير قابلة للإدارة: الأداة الوحيدة لإخراج عضو كانت تغيير الرمز، وهو طرد الجميع.
//
// ⚠️ **والـ claim يبقى مصدر الحقيقة للوصول، وهذا ليس تفصيلاً.** `isMember()` في
// firestore.rules تقرأ من التوكن — قراءة **مجانية**. لو صار هذا السجلّ مرجع
// الوصول لفرض `get()` مفوتراً في كل قاعدة تقريباً (انظر «ما لا تفعله هذه الخطة»
// في docs/PLAN-member-management.md). فهو **فهرس إداري** يُقرأ نادراً بصلاحية
// المسؤول، لا مصدر صلاحية. صفر كلفة على المسار الساخن.
//
// ⚠️ **الفشل هنا لا يُفشل الانضمام.** الـ claim كُتب قبل هذه الدالة، فالعضو صار
// عضواً فعلاً؛ وإسقاط الانضمام لأن فهرساً لم يُكتب يحرم المستخدم من رحلته لسبب
// لا يخصّه. الخطأ يُسجَّل في Cloud Logging، والسطر الناقص يُستدرك لاحقاً بـ
// scripts/backfill-member-roster.mjs.
async function recordMembership(tripId, userRecord, extra = {}) {
  try {
    const ref = db.collection('trips').doc(tripId)
      .collection('members').doc(userRecord.uid);

    const snap = await ref.get();
    const now = Date.now();

    // ⚠️ joinedAt يُكتب **مرة واحدة فقط**. إعادة إدخال الرمز ليست حدثاً نادراً:
    // كل تغيير لرمز الرحلة يُخرج جميع الأعضاء ويجبرهم على إدخاله من جديد. فلو
    // كُتب في كل تحقّق لضاعت تواريخ الانضمام كلها عند أول إعادة ضبط للرمز —
    // أي لفقد الحقل معناه تماماً في اللحظة التي تحتاجه فيها.
    const payload = { lastVerifiedAt: now, ...extra };
    if (!snap.exists) payload.joinedAt = now;

    // متاحان للحسابات الدائمة وحدها؛ الجلسة المجهولة بلا بريد ولا اسم. وFirestore
    // يرفض قيمة undefined، فيُحذف الحقل بدل كتابته فارغاً.
    if (userRecord.email) payload.email = userRecord.email;
    if (userRecord.displayName) payload.displayName = userRecord.displayName;

    await ref.set(payload, { merge: true });
  } catch (err) {
    console.error(`[recordMembership] تعذّر تسجيل ${userRecord.uid} في ${tripId}:`, err);
  }
}

/**
 * 🆕 manageTrip: إنشاء رحلة جديدة أو حذفها.
 *
 * 🆕 **الحذف يبقى للمسؤول العالمي حصراً.** أما **الإنشاء فمتاح لأي حساب حقيقي
 * مسجّل دخوله** (نموذج واتساب: من ينشئ رحلة يصبح منظّمها تلقائياً) — تغيير
 * معماري مقصود، انظر docs/DECISIONS.md للسياق الكامل.
 *
 * 🆕 **كل من يُنشئ رحلة — مسؤولاً كان أو لا — يصبح منظّمها فوراً** (لا استثناء
 * للمسؤول بعد الآن): claim العضوية (trips[tripId]=true، لغير المسؤول فقط —
 * المسؤول لا يحتاجه)، سطر عضوية بدور 'organizer'، organizerUid على مستند
 * الرحلة نفسها، وملف مسافر تلقائي — بنفس آلية joinViaInvite، فقط دون استهلاك
 * رمز دعوة لأنه هو نفسه مصدر الرحلة. هذا ما يجعل «منظّم واحد معروف لكل رحلة»
 * حقيقة مضمونة من لحظة الإنشاء، لا احتمالاً يعتمد على من أنشأها.
 *
 * 🆕 لم تعد تلمس أي سرّ (لا رمز رحلة بعد الآن — انظر تعليق أعلى الملف)، فالسبب
 * الوحيد المتبقي لبقاء الحذف خادمياً لا قاعدة Firestore هو: يحتاج قراءة عبر
 * مجموعات فرعية متعددة (members/travelers/expenses) والتحقّق من الخلوّ قبل
 * الكتابة الذرّية — تسلسل لا تعبّر عنه قاعدة واحدة بسهولة. الإنشاء يحتاجها
 * أيضاً الآن لسبب مختلف: منح claim وسجلّ عضوية ودور منظّم معاً بذرّية واحدة —
 * Admin SDK وحده يستطيع setCustomUserClaims.
 *
 * تفاصيل الرحلة غير السرّية (الاسم/المسار) بعد الإنشاء لا تمرّ من هنا — تُكتب
 * مباشرة من الواجهة عبر قواعد Firestore (isValidTripConfig)، وهي المسار
 * الأخف والأسرع. 🆕 **لا بيانات بنك على مستند الرحلة إطلاقاً بعد الآن** —
 * بطاقة التحويل تقرأ بيانات بنك المنظّم حيّة من users/{organizerUid}، انظر
 * docs/DECISIONS.md.
 */
exports.manageTrip = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    secrets: [SENTRY_DSN],
  },
  withSentry('manageTrip', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    // ⚠️ نفس الـ Custom Claim الذي تفحصه isAdmin() في firestore.rules — لا نثق
    // بأي علم يرسله العميل.
    const isAdminCaller = request.auth.token.admin === true;

    const mode = String(request.data?.mode ?? '').trim(); // 'create' | 'delete'

    // 🆕 الحذف يبقى للمسؤول العالمي حصراً — لم يُطلب تغييره، وهو الأخطر
    // (يُتلف بيانات مالية إن أُسيء استخدامه)، بخلاف الإنشاء الذاتي الجديد.
    if (mode === 'delete' && !isAdminCaller) {
      throw new HttpsError('permission-denied', 'حذف رحلة متاح للمسؤول فقط.');
    }

    // 🆕 لا رحلة بجلسة مجهولة — نفس المنطق ونفس الرسالة اللذين ترفض بهما
    // joinViaInvite أدناه، ونفس المبرر: منح uid مجهول claim حقيقياً ثم اكتشاف
    // أنه عديم الفائدة عند أول قراءة تجربة أسوأ من رفض واضح فوراً.
    if (!isAdminCaller && request.auth.token.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError(
        'failed-precondition',
        'إنشاء رحلة يتطلب حساباً حقيقياً (Google أو بريد إلكتروني) — سجّل الدخول أولاً.',
      );
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const name = String(request.data?.name ?? '').trim();

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError(
        'invalid-argument',
        'معرّف الرحلة غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.'
      );
    }
    if (mode !== 'create' && mode !== 'delete') {
      throw new HttpsError('invalid-argument', 'نوع العملية غير معروف.');
    }
    if (mode === 'create' && name.length > 100) {
      throw new HttpsError('invalid-argument', 'اسم الرحلة طويل جداً (100 حرف كحد أقصى).');
    }

    // 🆕 حدّ زمني للإنشاء الذاتي (غير المسؤول فقط — نفس استثناء المسؤول من حدّ
    // المصاريف). يُقرأ من بروفايل المُنشئ users/{uid}، ويُحدَّث بعد نجاح الإنشاء
    // أدناه. المسؤول معفى بالكامل، تماماً كما كان سلوكه دائماً قبل هذا التغيير.
    if (mode === 'create' && !isAdminCaller) {
      const profileRef = db.collection('users').doc(request.auth.uid);
      const profileSnap = await profileRef.get();
      const lastTripCreatedAt = profileSnap.exists ? profileSnap.data().lastTripCreatedAt : undefined;
      if (typeof lastTripCreatedAt === 'number' && Date.now() - lastTripCreatedAt < SELF_SERVE_TRIP_COOLDOWN_MS) {
        throw new HttpsError(
          'resource-exhausted',
          'أنشأتَ رحلة قبل قليل — انتظر دقيقة قبل إنشاء رحلة أخرى.',
        );
      }
    }

    // 🆕 يُجلَب للمسؤول أيضاً الآن (لا لغير المسؤول فقط) — كل من يُنشئ رحلة
    // يصبح منظّمها، والمسؤول ليس استثناءً بعد اليوم. نجلبه هنا (لا بعد
    // الكتابة) ليفشل الطلب مبكراً إن تعذّر جلب الحساب، بدل إنشاء رحلة يتعذّر
    // بعدها منح صاحبها دور منظّمها.
    const userRecord = mode === 'create' ? await admin.auth().getUser(request.auth.uid) : null;

    const tripRef = db.collection('trips').doc(tripId);
    const existing = await tripRef.get();

    // ── الحذف: للرحلات الفارغة، أو المؤرشفة منذ مدة كافية ───────────────────
    //
    // ⚠️ لماذا خادميًا ولماذا بشرط الخلو:
    //   • firestore.rules تُبقي `allow delete: if false` على trips/{tripId}
    //     للعميل مهما كان — فلا مسار حذف من المتصفح إطلاقاً.
    //   • شرط الخلو هو ما يجعل تدمير رحلة حقيقية مستحيلاً بغلطة أو بنيّة. وهو
    //     أيضاً ما يُبقي المبرر الأصلي للمنع قائماً: لا بيانات في
    //     artifacts/{tripId} لتصبح يتيمة بعد حذف مستند الرحلة.
    //   • الشرط الفعلي في checkTripHasProtectedData أدناه (مشتركة مع
    //     restoreTrip) — انظر تعليقها لماذا "أي مسافر موجود" وحده لم يعد كافياً.
    //
    // 🆕 **المرحلة ٢ من دورة حياة الرحلة التلقائية (docs/DECISIONS.md):**
    // رحلة مؤرشفة منذ أكثر من TRIP_PURGE_ELIGIBLE_MS تتجاوز checkTripHasProtectedData
    // بالكامل — حتى لو كانت تحوي بيانات مالية حقيقية (مسافرين، مصاريف، سجلات
    // إيداع). الحذف نفسه يبقى بفعل بشري دائماً — لا فرق هنا عن المسار العادي
    // سوى تجاوز الفحص، ثم — عند الأهلية بالعمر تحديداً — حذف artifacts/{tripId}
    // فعلياً لا مجرّد تركه يتيماً (انظر أدناه)، لأن الغاية من هذا المسار هي
    // التخلّص الحقيقي من بيانات قديمة، لا مجرّد إخفاء الرحلة.
    //
    // الحاجة المخدومة: رحلة أُنشئت بالخطأ (معرّف مكتوب خطأً غالباً)، أو رحلة
    // حقيقية قديمة لم يعد أحد بحاجة للاحتفاظ ببياناتها. الحذف يحرّر المعرّف
    // لإعادة استخدامه، وهو ما لا تحققه الأرشفة.
    if (mode === 'delete') {
      if (!existing.exists) {
        throw new HttpsError('not-found', `الرحلة "${tripId}" غير موجودة.`);
      }

      const eligibleForAgePurge = isEligibleForAgePurgeJs(existing.data());
      if (!eligibleForAgePurge) {
        const { hasProtectedData, reason } = await checkTripHasProtectedData(tripId);
        if (hasProtectedData) {
          throw new HttpsError('failed-precondition', reason === 'depositLogs'
            ? `لا يمكن حذف "${tripId}" — لبعض مسافريها (حتى المحذوفين منهم) سجلّ إيداع فعلي، وسجلّات الإيداع لا تُحذف أبداً حمايةً للسجلّات المالية.`
            : `لا يمكن حذف "${tripId}" لأنها تحوي مسافرين أو مصاريف. الحذف متاح للرحلات الفارغة فقط حمايةً للسجلّات المالية.`);
        }
      }

      // ⚠️ 🆕 **Firestore لا يحذف المجموعات الفرعية مع مستندها.** حذف
      // trips/{tripId} وحده يترك trips/{tripId}/members/… يتيمة: مستندات حيّة
      // تحت مسار مستند غير موجود، لا تظهر في أي واجهة ولا تُحذف أبداً.
      //
      // وهذه الحالة قابلة للوصول فعلاً لا نظرية: شرط الحذف هو خلوّ الرحلة من
      // **مسافرين ومصاريف**، والانضمام عبر رابط دعوة لا يستلزم إضافة مسافر. فرحلة
      // انضمّ إليها عشرة ولم يسجّل أحدهم مصروفاً تُعدّ فارغة وتُحذف.
      const members = await tripRef.collection('members').get();

      // المستندات معاً في كتابة ذرّية
      const deleteBatch = db.batch();
      members.docs.forEach(doc => deleteBatch.delete(doc.ref));
      deleteBatch.delete(tripRef);
      await deleteBatch.commit();

      // 🆕 المسار العادي (رحلة فارغة فعلاً) لا يحتاج هذا — artifacts/{tripId}
      // إما غير موجود أصلاً أو يحوي مستندات محذوفة ليّناً لا وزن مالي حقيقي
      // لها (checkTripHasProtectedData ضمنت ذلك للتوّ). أما المسار المؤهَّل
      // بالعمر فبياناته حقيقية عمداً — تركها يتيمة يناقض معنى "حذف نهائي".
      if (eligibleForAgePurge) {
        await db.recursiveDelete(db.collection('artifacts').doc(tripId));
        console.log(`[manageTrip] PURGE (age-eligible, had real data) on ${tripId} by ${request.auth.uid}`);
      } else {
        console.log(`[manageTrip] delete on ${tripId} by ${request.auth.uid}`);
      }

      return { success: true, tripId };
    }

    // ⚠️ الإنشاء لا يكتب فوق رحلة قائمة أبداً — نفس المبرر الذي كان قائماً حين
    // كانت الكتابة فوق رحلة تستبدل رمزها: اليوم بلا رمز، لكن استبدال بنك/مسار
    // رحلة قائمة بغلطة معرّف لا يزال أثراً غير مرغوب لا يستحق ترك بابه مفتوحاً.
    if (existing.exists) {
      throw new HttpsError('already-exists', `الرحلة "${tripId}" موجودة مسبقاً — اختر معرّفاً آخر.`);
    }

    await tripRef.set({
      name: name || tripId,
      itinerary: [],
      // 🆕 status يُكتب صراحةً رغم أن غيابه يعني 'active' في القواعد وفي
      // utils/tripStatus.ts. السبب ليس تغيير سلوك — لا شيء يتغيّر اليوم — بل
      // إغلاق المجموعة: بدونه *كل* رحلة جديدة تفتقد الحقل، فيصير السقوط إلى
      // 'active' سلوكاً دائماً لكل البيانات لا تسامحاً مع بيانات ما قبل
      // الميزة، ولا يمكن أبداً معرفة متى تصبح الحالة القديمة فارغة.
      // بكتابته هنا يصير عدد المستندات بلا `status` ثابتاً لا يزيد — تماماً
      // كما فعلت قاعدة isOwnCreation مع createdByUid. انظر
      // scripts/audit-legacy-docs.mjs: هو ما يخبرك متى يصبح حذف الحارس آمناً.
      status: 'active',
      // 🆕 مفيد الآن أن الإنشاء لم يعد حصراً بالمسؤول — تتبّع/تدقيق من أنشأ كل
      // رحلة، بنفس نمط createdByUid الموجود أصلاً على المصاريف.
      createdByUid: request.auth.uid,
      // 🆕 منظّم الرحلة — نفس من أنشأها دائماً، مسؤولاً كان أو لا. هذا هو
      // الحقل الذي تقرأ منه BankDetailsCard (عبر users/{organizerUid}) بدل
      // نسخة bankDetails محلية على الرحلة — انظر docs/DECISIONS.md.
      organizerUid: request.auth.uid,
    });

    console.log(`[manageTrip] create on ${tripId} by ${request.auth.uid}`);

    // 🆕 من يُنشئ رحلة يصبح منظّمها فوراً — مسؤولاً كان أو لا (لا استثناء
    // للمسؤول بعد الآن). نفس ما تفعله joinViaInvite (سجلّ عضوية + ملف مسافر)،
    // فقط بدور 'organizer' بدل 'member'، وبلا استهلاك رمز دعوة. الـ claim
    // وحده يبقى خاصاً بغير المسؤول (isAdmin() يتجاوز isMember() أصلاً).
    if (!isAdminCaller) {
      const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {};
      const nextClaims = {
        ...userRecord.customClaims,
        trips: { ...existingTrips, [tripId]: true },
      };
      assertClaimsFitTokenLimit(nextClaims);
      await admin.auth().setCustomUserClaims(request.auth.uid, nextClaims);
    }

    await recordMembership(tripId, userRecord, { role: 'organizer' });

    // 🆕 أفضل جهد — لا يُفشل الإنشاء إن أخفق، تماماً كما في joinViaInvite.
    // بروفايل المُنشئ يُفضَّل على اسم Auth — انظر تعليق getProfileDisplayName.
    try {
      const profileDisplayName = await getProfileDisplayName(request.auth.uid);
      await provisionTravelerForUid(
        tripId, request.auth.uid,
        profileDisplayName || request.auth.token.name || userRecord.displayName,
      );
    } catch (err) {
      console.error(`[manageTrip] تعذّر تزويد مسافر تلقائي لـ ${request.auth.uid} على ${tripId}:`, err);
    }

    // 🆕 organizesTripIds دائماً (حتى للمسؤول — تقرؤه firestore.rules
    // لتقرير من يستطيع قراءة بروفايله)، وlastTripCreatedAt لغير المسؤول فقط
    // (حدّ الإنشاء الذاتي أعلاه لا يخصّ المسؤول أصلاً).
    await db.collection('users').doc(request.auth.uid).set(
      {
        organizesTripIds: FieldValue.arrayUnion(tripId),
        ...(isAdminCaller ? {} : { lastTripCreatedAt: Date.now() }),
      },
      { merge: true },
    );

    return { success: true, tripId };
  })
);
/**
 * 🆕 manageMember: إزالة عضو من رحلة واحدة، أو تعيين/إلغاء دور «منظّم الرحلة».
 *
 * **لماذا دالة خادمية ولا يمكن أن تكون قاعدة؟** العضوية تعيش في custom claims
 * حساب العضو المستهدَف، وتعديل claims حساب آخر يوجب Admin SDK. لا سبيل لفعله
 * من العميل تحت أي قاعدة. ونفس المنطق ينطبق على `role` في سجلّ العضوية —
 * `firestore.rules` تمنع أي كتابة عليه من أي عميل (`allow write: if false`)
 * بالضبط لأن isOrganizer() تثق بهذا الحقل لمنح صلاحية كتابة حقيقية على الرحلة.
 *
 * وقبل هذه الدالة كانت الأداة الوحيدة لإخراج شخص هي تغيير رمز الرحلة — أي إخراج
 * **الجميع** وإجبار كل عضو على إدخال الرمز الجديد.
 *
 * ⚠️ **الإزالة ليست فورية: حتى ساعة.** توكن Firebase صالح ٦٠ دقيقة، و
 * firestore.rules تقرأ العضوية منه لا من قاعدة البيانات. فالمُزال يحتفظ بوصوله
 * حتى تنتهي صلاحية توكنه الحالي. وهذا ليس خللاً بل الوجه الآخر لكون isMember()
 * قراءةً مجانية — والواجهة تقول ذلك للمسؤول صراحةً بدل إخفائه.
 *
 * ورُفض revokeRefreshTokens رغم أنه يجعلها فورية: أثره على **الحساب كله**، فيُخرج
 * العضو من كل رحلاته لا من هذه وحدها — عقوبة جانبية على رحلات لا علاقة لها
 * بالقرار. انظر docs/PLAN-member-management.md.
 *
 * 🆕 المرحلة ٣ — دور «منظّم الرحلة»:
 *   • `mode: 'setRole'` (تعيين/إلغاء) — **المسؤول العالمي حصراً**. تفويض هذا
 *     الدور صلاحية إدارية حقيقية (تعديل اسم/بنك/مسار/حالة الرحلة، وإزالة أعضاء
 *     عاديين)، فمنحه ليس فعلاً يجوز أن يُفوَّض لمنظّم آخر — تماماً كما لا يمنح
 *     منظّم صلاحية admin لأحد. انظر "دون: ... منح صلاحية المسؤول" في الخطة.
 *   • `mode: 'remove'` صار متاحاً للمنظّم أيضاً، **لا لإزالة مسؤول أو منظّم
 *     آخر** — تلك حماية من تصعيد أفقي: لولاها لاستطاع منظّمان إخراج بعضهما
 *     بلا أي تدخّل من المسؤول العالمي.
 */
exports.manageMember = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    secrets: [SENTRY_DSN],
  },
  withSentry('manageMember', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const uid = String(request.data?.uid ?? '').trim();
    const mode = String(request.data?.mode ?? '').trim(); // 'remove' | 'setRole'

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!uid || uid.length > 128) {
      throw new HttpsError('invalid-argument', 'معرّف المستخدم غير صالح.');
    }
    if (mode !== 'remove' && mode !== 'setRole') {
      throw new HttpsError('invalid-argument', 'نوع العملية غير معروف.');
    }

    const callerIsAdmin = request.auth.token.admin === true;
    const memberDocRef = db.collection('trips').doc(tripId).collection('members').doc(uid);

    // ─── تعيين/إلغاء دور المنظّم — المسؤول العالمي حصراً ────────────────────
    if (mode === 'setRole') {
      if (!callerIsAdmin) {
        throw new HttpsError('permission-denied', 'تعيين دور منظّم الرحلة متاح للمسؤول فقط.');
      }
      const role = String(request.data?.role ?? '').trim();
      if (role !== 'organizer' && role !== 'member') {
        throw new HttpsError('invalid-argument', 'الدور غير معروف.');
      }

      // لا يجوز تعيين من لم ينضم للرحلة أصلاً — لا سطر عضوية له ليُكتب عليه،
      // وكتابة سطر جديد هنا كانت ستزوّر «متى انضم» (لا نعرفه أصلاً).
      const targetSnap = await memberDocRef.get();
      if (!targetSnap.exists) {
        throw new HttpsError('failed-precondition', 'هذا الحساب لم ينضم لهذه الرحلة بعد.');
      }

      const tripRef = db.collection('trips').doc(tripId);
      const tripSnap = await tripRef.get();
      const currentOrganizerUid = tripSnap.exists ? tripSnap.data().organizerUid : undefined;

      const batch = db.batch();
      batch.set(memberDocRef, { role }, { merge: true });

      // 🆕 منظّم واحد لكل رحلة — trips/{tripId}.organizerUid هو ما تقرأه
      // BankDetailsCard (عبر users/{organizerUid}) لتحديد بيانات البنك
      // المعروضة، فيجب أن يبقى قيمة واحدة لا تحتمل الغموض. انظر docs/DECISIONS.md.
      if (role === 'organizer') {
        // منظّم سابق مختلف؟ يُخفَض تلقائياً — لا منظّمان معاً على نفس الرحلة.
        if (currentOrganizerUid && currentOrganizerUid !== uid) {
          const prevMemberRef = db.collection('trips').doc(tripId).collection('members').doc(currentOrganizerUid);
          batch.set(prevMemberRef, { role: 'member' }, { merge: true });
          batch.set(
            db.collection('users').doc(currentOrganizerUid),
            { organizesTripIds: FieldValue.arrayRemove(tripId) },
            { merge: true },
          );
        }
        batch.set(tripRef, { organizerUid: uid }, { merge: true });
        batch.set(
          db.collection('users').doc(uid),
          { organizesTripIds: FieldValue.arrayUnion(tripId) },
          { merge: true },
        );
      } else if (currentOrganizerUid === uid) {
        // خفض المنظّم الحالي نفسه — لا يعوّضه أحد تلقائياً، الرحلة تبقى بلا
        // منظّم معروف حتى يُعيَّن آخر صراحة.
        batch.set(tripRef, { organizerUid: FieldValue.delete() }, { merge: true });
        batch.set(
          db.collection('users').doc(uid),
          { organizesTripIds: FieldValue.arrayRemove(tripId) },
          { merge: true },
        );
      }

      await batch.commit();
      console.log(`[manageMember] setRole ${role} for ${uid} on ${tripId} by ${request.auth.uid}`);
      return { success: true, uid, tripId, mode: 'setRole', role };
    }

    // ─── إزالة عضو — المسؤول، أو منظّم هذه الرحلة تحديداً ───────────────────
    if (!callerIsAdmin) {
      const callerSnap = await db.collection('trips').doc(tripId).collection('members').doc(request.auth.uid).get();
      const callerRole = callerSnap.exists ? (callerSnap.data().role || 'member') : 'member';
      if (callerRole !== 'organizer') {
        throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.');
      }
    }

    let userRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch {
      // الحساب محذوف من Auth لكن سطره باقٍ في السجلّ — ننظّف السطر ولا نفشل.
      await memberDocRef.delete();
      return { success: true, uid, tripId, claimRemoved: false, stillHasAccess: false };
    }

    const existingClaims = userRecord.customClaims || {};
    const existingTrips = existingClaims.trips || {};

    // 🆕 منظّم لا يزيل مسؤولاً ولا منظّماً آخر لنفس الرحلة — حماية التصعيد
    // الأفقي أعلاه. المسؤول العالمي معفى من هذا الشرط بالكامل.
    if (!callerIsAdmin) {
      if (existingClaims.admin === true) {
        throw new HttpsError('permission-denied', 'لا يستطيع منظّم الرحلة إزالة المسؤول.');
      }
      const targetSnap = await memberDocRef.get();
      const targetRole = targetSnap.exists ? (targetSnap.data().role || 'member') : 'member';
      if (targetRole === 'organizer') {
        throw new HttpsError('permission-denied', 'لا يستطيع منظّم الرحلة إزالة منظّم آخر — هذا للمسؤول وحده.');
      }
    }

    // ⚠️ **الحالة السالبة الحاكمة (القاعدة ١٨): لا تُمسّ بقية رحلاته.** خطأ هنا
    // يمسح عضويات لا علاقة لها بالقرار، وهو فشل صامت تماماً — لا رسالة ولا خطأ،
    // ولا يظهر إلا حين يفتح المستخدم رحلة أخرى بعد أيام فيجدها تطلب الرمز.
    // ولهذا نبني الخريطة بالحذف من نسخة، لا بإعادة تركيبها من مصدر آخر.
    const nextTrips = { ...existingTrips };
    const wasMember = nextTrips[tripId] === true;
    delete nextTrips[tripId];

    if (wasMember) {
      await admin.auth().setCustomUserClaims(uid, { ...existingClaims, trips: nextTrips });
    }

    // يُحذف دائماً ولو لم يكن عضواً في الـ claims — سطر بلا عضوية سجلٌّ يكذب،
    // وتنظيفه هو الغرض في تلك الحالة بالذات.
    await memberDocRef.delete();

    // ⚠️ المسؤول لا يستمد وصوله من عضوية الرحلة بل من claim عالمي (admin: true)،
    // فإزالته من الرحلة لا تحجب عنه شيئاً. نُبلغ العميل بذلك بدل إيهام المسؤول
    // بأن الإجراء فعل ما لم يفعله.
    const stillHasAccess = existingClaims.admin === true;

    console.log(`[manageMember] remove ${uid} from ${tripId} by ${request.auth.uid} (wasMember=${wasMember})`);
    return { success: true, uid, tripId, claimRemoved: wasMember, stillHasAccess };
  })
);

// ─── 🆕 restoreTrip: استعادة رحلة من نسخة JSON احتياطية ─────────────────────
//
// docs/PLAN-backup-recovery.md المرحلة ٢. النسخة تُنزَّل من لوحة الإدارة
// (المرحلة ١، src/utils/backup.ts) وتُرفَع هنا لإعادة بناء رحلة كاملة.
//
// ⚠️ **لماذا دالة خادمية بصلاحيات Admin SDK لا كتابة عميل مباشرة:** الاستعادة
// تكتب حقولاً تفرض القواعد ثباتها أو تمنعها من العميل أصلاً — createdByUid
// الأصلي (لا uid المسؤول المُستعيد)، deletedAt التاريخي، سجلّات depositLogs
// كسجلّ تاريخي بحت. وAdmin SDK يتجاوز القواعد بالكامل، لذا **كل تحقّق تفرضه
// القواعد عادة على الكتابات الحيّة يُعاد كتابته هنا يدوياً بدقة** — لا حارس
// آخر يوقف نسخة JSON مُعدَّلة يدوياً (بالخطأ أو بنيّة) عن كتابة بيانات فاسدة.
//
// ⚠️ **مبسَّطة عمداً عن حاجز الاستبدال المقترح أصلاً في الخطة: لا استبدال
// لرحلة حيّة تحت أي ظرف.** الاستعادة تُقبل فقط على رحلة غير موجودة أو فارغة
// تماماً (بلا مسافر ولا مصروف) — نفس شرط manageTrip mode=delete بالضبط.
// الكتابة فوق رحلة بها بيانات هي أخطر عملية ممكنة في هذا المستودع، ولا حاجة
// فعلية لها اليوم: من يريد استعادة نسخة قديمة على رحلة تحوي بيانات حالية
// يحذفها أولاً، وإن لم تكن فارغة فالمسار الآمن الوحيد المتبقّي معرّف جديد.
//
// ⚠️ **لا ذرّية كاملة عبر كل الكتابات.** حدّ Firestore ٥٠٠ عملية لكل دفعة —
// رحلة كبيرة قد تحتاج أكثر من دفعة، والدفعات المتتالية ليست ذرّية فيما بينها.
// فشل دفعة لاحقة يترك الرحلة في حالة استعادة جزئية **مرئية لا صامتة**: الدالة
// ترمي خطأً صريحاً يذكر العدد الفعلي المكتوب قبل الفشل، بدل الإبلاغ بنجاح كاذب.
//
// 🆕 لا رمز رحلة بعد الآن (انظر تعليق أعلى الملف) — الاستعادة لا تُنشئ شيئاً
// يعادل الوصول، ولا حاجة لذلك: من كان عضواً بالفعل (uid محفوظ في مسافري
// النسخة) يحتفظ بوصوله عبر claim حسابه القائم أصلاً إن لم يتغيّر. عضو جديد
// يحتاج رابط دعوة كأي انضمام آخر.
//
// ⚠️ **changedByUid في سجلّات الإيداع يبقى كما في النسخة، لا uid المسؤول
// الحالي.** القاعدة الحيّة تفرض تطابقهما لمنع انتحال هوية في كتابة مباشرة من
// عضو حقيقي — لكن الاستعادة تعيد كتابة سجلّ تاريخي حقيقي؛ تغيير من كتبه فعلياً
// إلى المسؤول المُستعيد يكذب على السجلّ الذي وُجد أصلاً ليكون مرجعاً موثوقاً
// عند خلاف مالي. تحقَّق هنا من الشكل والنوع فقط، لا من هوية الكاتب.

const BACKUP_SCHEMA_VERSION = 1;
// ⚠️ يجب أن يطابق MAX_SEGMENTS في src/utils/itinerary.ts — نفس القيد الذي
// تفرضه firestore.rules على itinerary في الكتابات الحيّة.
const MAX_ITINERARY_SEGMENTS = 50;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasOnlyKeys(obj, allowed) {
  return Object.keys(obj).every((k) => allowed.includes(k));
}

// نفس شرط isValidShares في firestore.rules بالضبط — لا تحقّق من نوع/مدى كل
// قيمة وزن فردياً (splitByShares في utils/calculations.ts تتعامل دفاعياً مع
// أي وزن غير صالح بمعاملته كوزن 1، فلا قيمة تالفة تُنتج حساباً خاطئاً فعلياً).
function isValidSharesJs(shares, participants) {
  if (!isPlainObject(shares)) return false;
  const size = Object.keys(shares).length;
  return size > 0 && size <= participants.length;
}

function isValidTravelerJs(d) {
  if (!isPlainObject(d)) return false;
  if (!hasOnlyKeys(d, ['id', 'name', 'shortName', 'deposited', 'deletedAt', 'uid', 'joinedAt'])) return false;
  if (!Number.isInteger(d.id)) return false;
  if (typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 100) return false;
  if (typeof d.shortName !== 'string' || d.shortName.length < 1 || d.shortName.length > 50) return false;
  if (typeof d.deposited !== 'number' || !Number.isFinite(d.deposited) || d.deposited < 0) return false;
  if ('deletedAt' in d && d.deletedAt !== null && typeof d.deletedAt !== 'number') return false;
  // 🆕 موازٍ لـ isValidTraveler في firestore.rules — انظر تعليقها هناك.
  if ('uid' in d && d.uid !== null && typeof d.uid !== 'string') return false;
  if ('joinedAt' in d && typeof d.joinedAt !== 'number') return false;
  return true;
}

// ⚠️ 'id' في قائمة المفاتيح المسموحة هنا عمداً — وهذا يخالف isValidExpense في
// firestore.rules التي لا تسمح به (معرّف المستند لا حقلاً داخله). السبب: هذه
// الدالة تتحقق من شكل Expense في *النسخة الاحتياطية* (يطابق واجهة TS في
// src/types.ts، وفيها id)، لا شكل مستند Firestore مباشرة — id يُنزَع قبل
// الكتابة الفعلية (انظر استخدامها أدناه).
function isValidExpenseJs(d) {
  if (!isPlainObject(d)) return false;
  if (!hasOnlyKeys(d, [
    'id', 'date', 'description', 'amount', 'originalAmount', 'currency', 'exchangeRate',
    'participants', 'createdAt', 'deletedAt', 'createdByUid', 'category', 'shares', 'paidBy',
  ])) return false;
  if (typeof d.id !== 'string' || !d.id) return false;
  if (typeof d.date !== 'string' || d.date.length > 10) return false;
  if (typeof d.description !== 'string' || d.description.length < 1 || d.description.length > 200) return false;
  if (typeof d.amount !== 'number' || !Number.isFinite(d.amount) || d.amount < 0) return false;
  if (typeof d.originalAmount !== 'number' || !Number.isFinite(d.originalAmount) || d.originalAmount < 0) return false;
  if (typeof d.currency !== 'string' || d.currency.length > 5) return false;
  if (typeof d.exchangeRate !== 'number' || !Number.isFinite(d.exchangeRate) || d.exchangeRate <= 0) return false;
  if (!Array.isArray(d.participants) || d.participants.length < 1 || d.participants.length > 50) return false;
  if (!d.participants.every((p) => typeof p === 'number' || typeof p === 'string')) return false;
  if (typeof d.createdAt !== 'number') return false;
  if ('deletedAt' in d && d.deletedAt !== null && typeof d.deletedAt !== 'number') return false;
  if ('createdByUid' in d && typeof d.createdByUid !== 'string') return false;
  if ('category' in d && (typeof d.category !== 'string' || d.category.length > 50)) return false;
  if ('shares' in d && !isValidSharesJs(d.shares, d.participants)) return false;
  // 🆕 موازٍ لـ isValidExpense في firestore.rules — انظر تعليقها هناك.
  if ('paidBy' in d && d.paidBy !== 'fund' && typeof d.paidBy !== 'number') return false;
  return true;
}

// ⚠️ نفس ملاحظة isValidExpenseJs أعلاه: 'id' مسموح هنا لأن هذا شكل
// DepositLogEntry في النسخة الاحتياطية (به id)، لا شكل مستند Firestore
// (بلا id) — يُنزَع قبل الكتابة الفعلية.
function isValidDepositLogJs(d) {
  if (!isPlainObject(d)) return false;
  if (!hasOnlyKeys(d, [
    'id', 'travelerId', 'previousDeposited', 'newDeposited', 'delta', 'mode', 'reason',
    'changedByEmail', 'changedByUid', 'createdAt',
  ])) return false;
  if (typeof d.id !== 'string' || !d.id) return false;
  if (!Number.isInteger(d.travelerId)) return false;
  if (typeof d.previousDeposited !== 'number' || !Number.isFinite(d.previousDeposited)) return false;
  if (typeof d.newDeposited !== 'number' || !Number.isFinite(d.newDeposited)) return false;
  if (typeof d.delta !== 'number' || !Number.isFinite(d.delta)) return false;
  if (!['add', 'subtract', 'set'].includes(d.mode)) return false;
  if (d.reason !== null && (typeof d.reason !== 'string' || d.reason.length > 300)) return false;
  if (typeof d.changedByEmail !== 'string' || !d.changedByEmail) return false;
  if (typeof d.changedByUid !== 'string' || !d.changedByUid) return false;
  if (typeof d.createdAt !== 'number') return false;
  return true;
}

/**
 * 🆕 manageInvite / joinViaInvite: رابط دعوة بنقرة واحدة — طريقة الانضمام
 * الوحيدة المتبقية لرحلة (انظر تعليق أعلى الملف؛ رمز الرحلة اليدوي أُلغي تماماً).
 *
 * ── نموذج البيانات ───────────────────────────────────────────────────────────
 * tripInvites/{token} — معرّف المستند هو التوكن نفسه (32 حرف base64url، 192 بت
 * انتروبيا من crypto.randomBytes(24)). المحتوى: { tripId, createdAt, createdByUid }.
 *
 * ── رابط نشط واحد فقط لكل رحلة ─────────────────────────────────────────────
 * 'create' يحذف أي رابط سابق لنفس الرحلة قبل إنشاء الجديد — فالإبطال ضمنيّ عند
 * التجديد، ولا حاجة لتتبّع أيّ التوكنات لا يزال صالحاً. 'revoke' هو بالضبط نفس
 * خطوة الحذف بلا الإنشاء الذي يليها.
 *
 * ── لماذا لا حدّ معدّل (Rate Limit) على joinViaInvite ────────────────────────
 * توكن بـ192 بت غير قابل للتخمين بأي هجوم واقعي — على عكس رمز الرحلة القصير
 * الملغى، الذي كان يستحق حدّ معدّل مخصّصاً. حدّ معدّل هنا كان سيحمي من لا شيء
 * بكلفة تعقيد إضافي.
 *
 * ── الكتمان الأمني ────────────────────────────────────────────────────────
 * توكن غير موجود أو مُبطَل كلاهما `permission-denied` بنص واحد لمنع اكتشاف ما
 * إذا كان توكن ما صالحاً يوماً.
 */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// نفس شرط manageMember لإزالة عضو بالضبط: المسؤول العالمي، أو منظّم *هذه*
// الرحلة تحديداً. غير مُشترَكة مع manageMember عمداً — لا نلمس كوداً مُختبَراً
// قائماً لمجرد تفادي تكرار خمسة أسطر.
async function callerManagesTrip(tripId, auth) {
  if (auth.token.admin === true) return true;
  const callerSnap = await db.collection('trips').doc(tripId).collection('members').doc(auth.uid).get();
  const callerRole = callerSnap.exists ? (callerSnap.data().role || 'member') : 'member';
  return callerRole === 'organizer';
}

// استعلام لا get() بمعرّف واحد — معرّف مستند الدعوة هو التوكن العشوائي نفسه لا
// tripId، فلا سبيل لمعرفة أي دعوة تخصّ رحلة بعينها إلا بالبحث.
async function deleteExistingInvites(tripId) {
  const snap = await db.collection('tripInvites').where('tripId', '==', tripId).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * 🆕 نموذج الهوية الهجين — التزويد التلقائي عند الانضمام (docs/PLAN…).
 *
 * موازيان تماماً لـ utils/travelerName.ts على العميل (لا يمكن استيرادها هنا —
 * سياق تشغيل مختلف تماماً بلا حزمة بناء مشتركة)، لنفس الأسباب الموثّقة هناك:
 *   - deriveShortNameJs: أول كلمة من الاسم — نفس القاعدة، نفس السبب.
 *   - isValidNameKeyJs: قيود معرّف مستند Firestore (لا '/'، لا '.'/'..'، لا
 *     نمط __محجوز__، حدّ 1500 بايت).
 *   - نطاق المعرّف العشوائي (1 .. 2^31-2) نفسه — عشوائي لا "أكبر+1"، لنفس سبب
 *     سباق التصادم الموثّق في newTravelerId على العميل؛ هنا الخطر أعلى فعلياً
 *     لأن التزويد يقع بلا أي تدخّل بشري يلاحظ الخطأ.
 */
function deriveShortNameJs(fullName) {
  return String(fullName).trim().split(/\s+/)[0] || '';
}

function isValidNameKeyJs(shortName) {
  if (!shortName) return false;
  if (shortName.includes('/')) return false;
  if (shortName === '.' || shortName === '..') return false;
  if (/^__.*__$/.test(shortName)) return false;
  return Buffer.byteLength(shortName, 'utf8') <= 1500;
}

/**
 * 🆕 نسخة خادمية من tripEndTime (src/utils/itinerary.ts) — انظر تعليقها هناك
 * لماذا لا حزمة مشتركة بين هذا الملف وواجهة العميل. تُصفّي المقاطع التالفة
 * وترتّب الباقي تصاعدياً حسب وقت الانطلاق، ثم تُعيد وقت وصول آخرها كـ epoch
 * ms — أو null لمسار فارغ أو بلا مقاطع صالحة إطلاقاً.
 *
 * 🆕 وقت الوصول اختياري الآن (النموذج المبسّط في SegmentForm.tsx لا يجمعه) —
 * مقطع بلا arrival.time لا يُستبعَد، بل يسقط لوقت الانطلاق كأفضل تقدير معروف،
 * تماماً كما يفعل tripEndTime في itinerary.ts.
 */
function tripEndTimeJs(itinerary) {
  if (!Array.isArray(itinerary)) return null;
  const valid = itinerary.filter(s =>
    isPlainObject(s)
    && isPlainObject(s.departure) && typeof s.departure.time === 'string'
    && isPlainObject(s.arrival) && (s.arrival.time === undefined || typeof s.arrival.time === 'string')
  );
  if (valid.length === 0) return null;
  valid.sort((a, b) => new Date(a.departure.time).getTime() - new Date(b.departure.time).getTime());
  const last = valid[valid.length - 1];
  return new Date(last.arrival.time || last.departure.time).getTime();
}

// 🆕 المرحلة ٢ من دورة حياة الرحلة التلقائية (docs/DECISIONS.md) — نسخة خادمية
// من isEligibleForAgePurge (src/utils/tripStatus.ts)، هي المصدر الفعلي للحكم
// (النسخة العميلة للعرض فقط). رحلة مؤرشفة منذ أكثر من هذه المدة يتجاوز حذفها
// checkTripHasProtectedData بالكامل — حتى لو كانت تحوي بيانات مالية حقيقية.
// الحذف يبقى بفعل بشري دائماً (manageTrip mode:'delete')، لا تلقائياً ضمن
// advanceTripLifecycle — تلك الدالة تُقدِّم الرحلة إلى archived فقط، لا تحذفها.
const TRIP_PURGE_ELIGIBLE_MS = 90 * 24 * 60 * 60 * 1000; // 90 يوماً مؤرشفة

function isEligibleForAgePurgeJs(tripData, now = Date.now()) {
  return tripData.status === 'archived'
    && typeof tripData.statusChangedAt === 'number'
    && now - tripData.statusChangedAt > TRIP_PURGE_ELIGIBLE_MS;
}

function randomTravelerId() {
  return (crypto.randomInt(0, 2147483646)) + 1;
}

// 🆕 حدّ محاولات معقول: كل محاولة فاشلة تعني تعارضاً حقيقياً على شكل الاسم
// المختصر (المعرّف العشوائي شبه مستحيل التصادم فعلياً) — مجموعة سفر بهذا العدد
// من الأشخاص بنفس الاسم الأول حرفياً حالة نادرة جداً، وما بعدها عطل حقيقي.
const MAX_PROVISION_ATTEMPTS = 20;

/**
 * 🆕 اسم العرض من بروفايل المستخدم (users/{uid}.displayName) إن وُجد — يُفضَّل
 * على اسم Auth (token.name / userRecord.displayName) عند تزويد مسافر تلقائي،
 * لأنه الحقل الذي يعدّله المستخدم صراحةً عبر «بروفايلي» (UserProfileModal)،
 * وقد يكون موجوداً حتى حين لا يملك حساب Auth نفسه اسماً (شائع لحساب
 * بريد/كلمة مرور بلا اسم عرض مضبوط على Auth إطلاقاً).
 */
async function getProfileDisplayName(uid) {
  const snap = await db.collection('users').doc(uid).get();
  const value = snap.exists ? snap.data().displayName : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

// 🆕 حدّ معقول لهذا الاستخدام (تنظيف رحلة تجريبية/بالخطأ، أو استعادة نسخة إلى
// معرّف قائم) — رحلة بهذا العدد من المسافرين ليست كذلك أصلاً، ويبقى الرفض
// قائماً في تلك الحالة (نجد على الأرجح مسافراً نشِطاً ضمن أول 300 فعلياً).
const MAX_PROTECTED_DATA_CHECK_DOCS = 300;

/**
 * 🆕 هل تحوي رحلة بيانات مالية تستحق الحماية من التدمير — شرط مشترك بين
 * manageTrip (mode:'delete') وrestoreTrip (الكتابة فوق رحلة موجودة). كلاهما
 * يرفض العملية على رحلة بهذه الحالة، كل بصياغة رسالة مناسبة لسياقه.
 *
 * ⚠️ **"أي مسافر/مصروف موجود" لم يعد كافياً وحده منذ التزويد التلقائي.** كل
 * إنشاء رحلة — ذاتياً أو من لوحة الإدارة — يُنشئ مسافراً للمنظّم فوراً
 * (provisionTravelerForUid في manageTrip)، فصار كل مسافر واحد على الأقل
 * موجوداً منذ لحظة الإنشاء دائماً. معاملة وجوده وحده كرفض كانت تُبطل كلا
 * هذين المسارين على أي رحلة جديدة — حتى تجريبية لم تُلمَس إطلاقاً (رُصد
 * فعلياً: منظّم حذف نفسه من قائمة المسافرين — حذفاً ليّناً، الوحيد المتاح
 * له — ثم فوجئ برفض حذف رحلته رغم أنها "فارغة" ظاهرياً).
 *
 * الفحص الآن أدقّ: مصروف **أو** مسافر **نشِط** يرفض فوراً (بيانات حيّة قد
 * يعتمد عليها أحد). عنصر في سلة المهملات وحده لا يرفض — بصرف النظر عن نوعه:
 * لا فرق بنيوي بين مصروف ومسافر بسلة المهملات، كلاهما مستند عادي قابل
 * للاستعادة، لا "سجلّ" خاص. الاستثناء الوحيد الحقيقي هو سجلّات إيداع
 * المسافرين (depositLogs) — غير قابلة للحذف بالتصميم لتكون مرجعاً في أي نزاع
 * مالي — فتُفحَص لكل مسافر (نشط أو بالسلة) بصرف النظر عن حالته.
 *
 * (🆕 رُصد فعلياً هذا التمييز الناقص أثناء الإصلاح الأول: مصروف واحد سُجِّل
 * ثم حُذف — حذفاً ليّناً كالمعتاد — كان يكفي وحده لإبقاء الحذف مرفوضاً رغم
 * تفريغ قائمة المسافرين تماماً، لأن الفحص الأول عامل المصروفات معاملة مختلفة
 * عن المسافرين بلا مبرر بنيوي حقيقي.)
 *
 * @returns {Promise<{ hasProtectedData: boolean, reason: 'expenses' | 'travelers' | 'depositLogs' | null }>}
 */
async function checkTripHasProtectedData(tripId) {
  const dataRoot = db.collection('artifacts').doc(tripId).collection('public').doc('data');

  const expensesSnap = await dataRoot.collection('expenses').limit(MAX_PROTECTED_DATA_CHECK_DOCS).get();
  if (expensesSnap.docs.some(doc => !doc.data().deletedAt)) {
    return { hasProtectedData: true, reason: 'expenses' };
  }

  const travelersSnap = await dataRoot.collection('travelers').limit(MAX_PROTECTED_DATA_CHECK_DOCS).get();
  if (travelersSnap.docs.some(doc => !doc.data().deletedAt)) {
    return { hasProtectedData: true, reason: 'travelers' };
  }

  const depositLogChecks = await Promise.all(
    travelersSnap.docs.map(doc => doc.ref.collection('depositLogs').limit(1).get())
  );
  if (depositLogChecks.some(snap => !snap.empty)) {
    return { hasProtectedData: true, reason: 'depositLogs' };
  }

  return { hasProtectedData: false, reason: null };
}

/**
 * يبحث عن ملف مسافر بهذا uid في هذه الرحلة، وإن لم يوجد يُنشئ واحداً تلقائياً
 * ويربطه به فوراً — بدل انتظار ربط يدوي من المنظّم لاحقاً.
 *
 * ⚠️ **لا تفشل الانضمام إن فشل التزويد.** العضوية (claim + recordMembership)
 * تكون قد مُنحت بالفعل قبل استدعاء هذه الدالة؛ إسقاط الانضمام بأكمله بسبب فشل
 * هنا يحرم المستخدم من رحلته لسبب لا يخصّه — نفس مبدأ recordMembership تماماً
 * (انظر تعليقها أعلاه). الفشل يُسجَّل فقط، ويبقى الحل اليدوي (linkTravelerAccount)
 * متاحاً للمنظّم كشبكة أمان.
 *
 * ⚠️ **batch.create لا set**: يفشل الالتزام كاملاً إن وُجد أي من المستندين
 * (سباق بين انضمامين متزامنين بنفس الاسم الأول) — فنعيد المحاولة باسم مختصر
 * مختلف (لاحقة رقمية) بدل الكتابة فوق حجز اسم شخص آخر أو مسافر آخر بالمصادفة.
 */
// 🆕 قيمة الاسم الافتراضي حين لا يملك المنضمّ اسم عرض (شائع لجلسة مجهولة بلا
// حساب Google/بريد) — نظيرة تماماً لثابت لا يمكن استيراده هنا (سياق تشغيل
// مختلف، انظر تعليق الدالة أعلاه). 🆕 مُصدَّرة عبر `usedDefaultName` أدناه بدل
// مقارنة المستدعي بها مباشرة، فلا يعتمد سلوكان على تطابق نص حرفي في ملفين.
const DEFAULT_TRAVELER_NAME = 'مسافر جديد';

/**
 * @returns {{ created: boolean, usedDefaultName: boolean }} — `created` كاذبة
 * حين كان مربوطاً بالفعل *أو* حين استُنفدت محاولات التزويد (الفشل يُسجَّل
 * كما كان، فلا حاجة للمستدعي لتمييز الحالتين). `usedDefaultName` صحيحة فقط
 * حين أُنشئ ملف فعلاً بلا اسم عرض حقيقي — هذا ما يقرأه joinViaInvite ليقرّر
 * إن كان يستحق سؤال المنضمّ عن اسمه (needsName في الاستجابة).
 */
async function provisionTravelerForUid(tripId, uid, displayName) {
  const dataRoot = db.collection('artifacts').doc(tripId).collection('public').doc('data');
  const travelersCol = dataRoot.collection('travelers');

  const existing = await travelersCol.where('uid', '==', uid).limit(1).get();
  if (!existing.empty) return { created: false, usedDefaultName: false }; // مربوط بالفعل — لا شيء يُفعل

  const trimmedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  const usedDefaultName = !trimmedDisplayName;
  const baseName = trimmedDisplayName || DEFAULT_TRAVELER_NAME;
  const baseShortName = deriveShortNameJs(baseName);

  for (let attempt = 0; attempt < MAX_PROVISION_ATTEMPTS; attempt++) {
    const shortName = attempt === 0 ? baseShortName : `${baseShortName}${attempt + 1}`;
    if (!isValidNameKeyJs(shortName)) continue; // نادر جداً — تخطٍّ لا فشل كامل

    const id = randomTravelerId();
    const traveler = {
      id,
      name: baseName,
      shortName,
      deposited: 0,
      deletedAt: null,
      uid,
      joinedAt: Date.now(),
    };

    try {
      const batch = db.batch();
      batch.create(travelersCol.doc(String(id)), traveler);
      batch.create(dataRoot.collection('travelerNames').doc(shortName), { travelerId: id });
      await batch.commit();
      return { created: true, usedDefaultName };
    } catch {
      // الاسم المختصر (أو المعرّف، شبه مستحيل) مأخوذ — نجرّب لاحقة أخرى.
    }
  }

  console.error(`[provisionTravelerForUid] فشل تزويد مسافر تلقائي لـ ${uid} على ${tripId} بعد ${MAX_PROVISION_ATTEMPTS} محاولة.`);
  return { created: false, usedDefaultName: false };
}

exports.manageInvite = onCall(
  { region: 'us-central1', maxInstances: 5, secrets: [SENTRY_DSN] },
  withSentry('manageInvite', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const mode = String(request.data?.mode ?? '').trim(); // 'create' | 'revoke'

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (mode !== 'create' && mode !== 'revoke') {
      throw new HttpsError('invalid-argument', 'نوع العملية غير معروف.');
    }
    if (!(await callerManagesTrip(tripId, request.auth))) {
      throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.');
    }

    // الحذف مشترك بين الوضعين: 'revoke' يتوقف هنا، و'create' يكمل لإنشاء توكن جديد.
    await deleteExistingInvites(tripId);

    if (mode === 'revoke') {
      console.log(`[manageInvite] revoke on ${tripId} by ${request.auth.uid}`);
      return { success: true };
    }

    const token = crypto.randomBytes(24).toString('base64url');
    await db.collection('tripInvites').doc(token).set({
      tripId,
      createdAt: Date.now(),
      createdByUid: request.auth.uid,
    });

    console.log(`[manageInvite] create on ${tripId} by ${request.auth.uid}`);
    return { success: true, token };
  })
);

exports.joinViaInvite = onCall(
  { region: 'us-central1', maxInstances: 5, secrets: [SENTRY_DSN] },
  withSentry('joinViaInvite', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    // 🆕 لا عضوية بجلسة مجهولة — انظر تعليق أعلى الملف وdocs/DECISIONS.md.
    // الرفض هنا صريح رغم أن firestore.rules ترفض isMember() لجلسة مجهولة
    // أصلاً (دفاع في العمق): بدون هذا، يُمنح uid مجهول claim حقيقياً ثم
    // يُكتشف أنه عديم الفائدة عند أول قراءة — تجربة أسوأ من رفض واضح فوراً.
    if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError(
        'failed-precondition',
        'الانضمام يتطلب حساباً حقيقياً (Google أو بريد إلكتروني) — سجّل الدخول أولاً.',
      );
    }

    const inviteToken = String(request.data?.inviteToken ?? '').trim();
    if (!inviteToken || !INVITE_TOKEN_PATTERN.test(inviteToken)) {
      throw new HttpsError('invalid-argument', 'رابط الدعوة غير صالح.');
    }

    const inviteSnap = await db.collection('tripInvites').doc(inviteToken).get();
    if (!inviteSnap.exists) {
      throw new HttpsError('permission-denied', 'رابط الدعوة غير صالح أو منتهي الصلاحية.');
    }

    const { tripId } = inviteSnap.data();

    // 🆕 ندمج مع أي رحلات سابقة تحقق منها هذا المستخدم بدل استبدال الـ Custom
    // Claims بالكامل (setCustomUserClaims يستبدل القيمة كلها، لا يدمجها تلقائياً).
    const userRecord = await admin.auth().getUser(request.auth.uid);
    const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {};

    const nextClaims = {
      ...userRecord.customClaims,
      trips: { ...existingTrips, [tripId]: true },
    };
    assertClaimsFitTokenLimit(nextClaims);

    await admin.auth().setCustomUserClaims(request.auth.uid, nextClaims);
    await recordMembership(tripId, userRecord);

    // 🆕 نموذج الهوية الهجين: تزويد ملف مسافر تلقائياً إن لم يوجد له واحد بعد
    // في هذه الرحلة تحديداً. لا يُفشل الانضمام إن فشل — انظر تعليق الدالة.
    // 🆕 needsName في الاستجابة: صحيحة فقط حين أُنشئ ملف جديد فعلاً بلا اسم
    // عرض حقيقي (حساب بريد/كلمة مرور بلا اسم مُدخَل، أو حساب Google بلا اسم
    // عرض) — الواجهة تعرض عندها نموذج اسم من خطوة واحدة قبل التوجيه للرحلة
    // (انظر useInviteJoin.ts). فشل التزويد أو ربط
    // مسبق لا يستحقان سؤالاً — الأول لأن لا ملف وُلد أصلاً، والثاني لأن
    // الملف مُسمّى بالفعل (ربما من هذا الحوار نفسه في زيارة سابقة).
    // 🆕 بروفايل المنضمّ يُفضَّل على اسم Auth — انظر تعليق getProfileDisplayName.
    let needsName = false;
    try {
      const profileDisplayName = await getProfileDisplayName(request.auth.uid);
      const result = await provisionTravelerForUid(
        tripId, request.auth.uid,
        profileDisplayName || request.auth.token.name || userRecord.displayName,
      );
      needsName = result.created && result.usedDefaultName;
    } catch (err) {
      console.error(`[joinViaInvite] تعذّر تزويد مسافر تلقائي لـ ${request.auth.uid} على ${tripId}:`, err);
    }

    console.log(`[joinViaInvite] ${request.auth.uid} joined ${tripId} via invite`);
    return { success: true, tripId, needsName };
  })
);

/**
 * 🆕 updateMyTravelerName: يسمح لعضو انضمّ فعلاً بتسمية ملف مسافره الخاص —
 * الاستخدام الوحيد اليوم هو نموذج الاسم من خطوة واحدة الذي يعقب الانضمام عبر
 * رابط دعوة بلا اسم عرض حقيقي (انظر needsName في joinViaInvite أعلاه).
 *
 * ⚠️ **لماذا دالة سحابية لا كتابة مباشرة من العميل**: firestore.rules تمنح
 * `update` على travelers/{travelerId} للمسؤول العالمي حصراً (isAdmin())، ولا
 * تمييز فيها بين "عضو يعدّل ملفه هو" و"عضو يعدّل ملف غيره" — إضافة استثناء
 * كهذا للقواعد تفتح باباً أوسع مما يحتاجه هذا الاستخدام الضيق (تسمية النفس
 * مرة واحدة عند الانضمام). الدالة تفرض الحدّ الدقيق: هذا المستخدم يُسمّي
 * الملف الذي uid فيه يطابقه هو حصراً، لا أي ملف آخر.
 *
 * ⚠️ **لا تُغيَّر shortName هنا** — هي مفتاح الربط مع Expense.participants ولا
 * تتغيّر بعد الإنشاء (انظر تعليق Traveler.shortName في types.ts)، وتغييرها
 * يتطلب نقل حجز الاسم (travelerNames/{shortName}) في دفعة ذرّية كما تفعل بقية
 * مسارات كتابة المسافر (القاعدة ٦) — خارج نطاق هذه الدالة عمداً.
 */
exports.updateMyTravelerName = onCall(
  { region: 'us-central1', maxInstances: 10, secrets: [SENTRY_DSN] },
  withSentry('updateMyTravelerName', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const name = String(request.data?.name ?? '').trim();

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!name || name.length > 100) {
      throw new HttpsError('invalid-argument', 'الاسم مطلوب، بحد أقصى 100 حرف.');
    }

    const travelersCol = db.collection('artifacts').doc(tripId).collection('public').doc('data').collection('travelers');
    const snap = await travelersCol.where('uid', '==', request.auth.uid).limit(1).get();
    if (snap.empty) {
      throw new HttpsError('not-found', 'لا يوجد ملف مسافر مرتبط بحسابك في هذه الرحلة.');
    }

    await snap.docs[0].ref.update({ name });

    console.log(`[updateMyTravelerName] ${request.auth.uid} renamed own traveler on ${tripId}`);
    return { success: true };
  })
);

/**
 * 🆕 linkTravelerAccount: ربط يدوي — منظّم أو مسؤول يربط ملف مسافر "شبح"
 * (uid == null، أنشأه هو يدوياً لشخص لم ينضمّ بعد) بحساب عضو انضمّ فعلاً.
 *
 * بديل يدوي للتزويد التلقائي في joinViaInvite: يغطي الحالة التي انضمّ فيها
 * الشخص برمز الرحلة مباشرة (لا رابط دعوة، فلا تزويد تلقائي يقع أصلاً) أو
 * انضمّ *بعد* أن أنشأ المنظّم ملفه يدوياً بالفعل قبل وصوله.
 *
 * ⚠️ **لا يعيد ربط ملف مربوط بالفعل.** لو سُمح بذلك لصار بإمكان منظّم "سرقة"
 * ملف شخص آخر لحساب مختلف — والحماية الوحيدة من ذلك هنا أن traveler.uid فارغ
 * أصلاً شرط مسبق. من يريد تصحيح ربط خاطئ يُلغيه يدوياً في Firestore (لا مسار
 * عميل لذلك اليوم — نطاق مقصود، ليس نسياناً).
 */
exports.linkTravelerAccount = onCall(
  { region: 'us-central1', maxInstances: 5, secrets: [SENTRY_DSN] },
  withSentry('linkTravelerAccount', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const travelerId = request.data?.travelerId;
    const targetUid = String(request.data?.targetUid ?? '').trim();

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!Number.isInteger(travelerId)) {
      throw new HttpsError('invalid-argument', 'معرّف المسافر غير صالح.');
    }
    if (!targetUid || targetUid.length > 128) {
      throw new HttpsError('invalid-argument', 'معرّف الحساب المستهدَف غير صالح.');
    }
    if (!(await callerManagesTrip(tripId, request.auth))) {
      throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.');
    }

    const travelersCol = db.collection('artifacts').doc(tripId).collection('public').doc('data').collection('travelers');
    const travelerRef = travelersCol.doc(String(travelerId));
    const travelerSnap = await travelerRef.get();
    if (!travelerSnap.exists) {
      throw new HttpsError('not-found', 'هذا المسافر غير موجود في هذه الرحلة.');
    }
    if (travelerSnap.data().uid != null) {
      throw new HttpsError('failed-precondition', 'هذا المسافر مربوط بحساب بالفعل.');
    }

    // 🆕 منع الربط المزدوج: لا يجوز أن يملك حساب واحد أكثر من ملف مسافر واحد
    // في نفس الرحلة — والا صار الشخص نفسه يظهر مرتين في الدفتر بمعرّفين
    // مختلفين، فتتضاعف حصته حسابياً دون أن يفعل شيئاً.
    const boundElsewhere = await travelersCol.where('uid', '==', targetUid).limit(1).get();
    if (!boundElsewhere.empty) {
      throw new HttpsError('failed-precondition', 'هذا الحساب مربوط بالفعل بمسافر آخر في هذه الرحلة.');
    }

    await travelerRef.update({ uid: targetUid });

    console.log(`[linkTravelerAccount] ${request.auth.uid} linked traveler ${travelerId} to ${targetUid} on ${tripId}`);
    return { success: true, tripId, travelerId, targetUid };
  })
);

exports.restoreTrip = onCall(
  { region: 'us-central1', maxInstances: 2, timeoutSeconds: 120, secrets: [SENTRY_DSN] },
  withSentry('restoreTrip', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول فقط.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const backup = request.data?.backup;

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError(
        'invalid-argument',
        'معرّف الرحلة غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.'
      );
    }

    // ── التحقّق من بنية ملف النسخة الاحتياطية بالكامل قبل أي كتابة ──────────
    if (!isPlainObject(backup)) {
      throw new HttpsError('invalid-argument', 'ملف النسخة الاحتياطية غير صالح.');
    }
    if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new HttpsError(
        'invalid-argument',
        `إصدار غير مدعوم لملف النسخة الاحتياطية (${JSON.stringify(backup.schemaVersion)}).`
      );
    }

    const trip = backup.trip;
    if (!isPlainObject(trip) || typeof trip.name !== 'string' || trip.name.length > 100) {
      throw new HttpsError('invalid-argument', 'بيانات الرحلة داخل النسخة غير صالحة.');
    }
    // 🆕 trip.bankDetails (إن وُجد في نسخة قديمة) يُتجاهَل عمداً — لا بيانات
    // بنك على مستند الرحلة بعد اليوم، انظر docs/DECISIONS.md.
    if (!Array.isArray(trip.itinerary) || trip.itinerary.length > MAX_ITINERARY_SEGMENTS) {
      throw new HttpsError('invalid-argument', 'مسار الرحلة داخل النسخة غير صالح.');
    }
    if (!['active', 'completed', 'archived'].includes(trip.status)) {
      throw new HttpsError('invalid-argument', 'حالة الرحلة داخل النسخة غير صالحة.');
    }

    const travelers = Array.isArray(backup.travelers) ? backup.travelers : [];
    const expenses = Array.isArray(backup.expenses) ? backup.expenses : [];
    const depositLogs = Array.isArray(backup.depositLogs) ? backup.depositLogs : [];
    const travelerNames = Array.isArray(backup.travelerNames) ? backup.travelerNames : [];

    if (!travelers.every(isValidTravelerJs)) {
      throw new HttpsError('invalid-argument', 'أحد المسافرين داخل النسخة غير صالح.');
    }
    if (!expenses.every(isValidExpenseJs)) {
      throw new HttpsError('invalid-argument', 'أحد المصاريف داخل النسخة غير صالح.');
    }
    if (!depositLogs.every(isValidDepositLogJs)) {
      throw new HttpsError('invalid-argument', 'أحد سجلّات الإيداع داخل النسخة غير صالح.');
    }

    // ⚠️ سلامة مرجعية داخل النسخة نفسها — أبعد ممّا تتحقق منه firestore.rules
    // للكتابات الحيّة (travelerNames وtravelers تُكتبان معاً من عميل موثوق في
    // نفس اللحظة؛ هنا نعيد بناء الاثنتين من ملف واحد فيجب التحقق من تطابقهما).
    const travelerIds = new Set(travelers.map((t) => t.id));
    if (!travelerNames.every((n) =>
      isPlainObject(n) && typeof n.shortName === 'string' && n.shortName
        && Number.isInteger(n.travelerId) && travelerIds.has(n.travelerId)
    )) {
      throw new HttpsError('invalid-argument', 'أحد حجوزات الأسماء داخل النسخة غير صالح أو يشير لمسافر غير موجود.');
    }
    if (!depositLogs.every((l) => travelerIds.has(l.travelerId))) {
      throw new HttpsError('invalid-argument', 'سجلّ إيداع يشير لمسافر غير موجود في النسخة.');
    }

    // ── الرحلة الهدف: غير موجودة، أو موجودة وفارغة تماماً ──────────────────
    // نفس شرط manageTrip mode=delete بالضبط — checkTripHasProtectedData
    // مشتركة بين الاثنين، انظر تعليقها.
    const tripRef = db.collection('trips').doc(tripId);
    const dataRoot = db.collection('artifacts').doc(tripId).collection('public').doc('data');
    const existing = await tripRef.get();
    if (existing.exists) {
      const { hasProtectedData, reason } = await checkTripHasProtectedData(tripId);
      if (hasProtectedData) {
        throw new HttpsError('failed-precondition', reason === 'depositLogs'
          ? `لا يمكن الاستعادة إلى "${tripId}" — لبعض مسافريها (حتى المحذوفين منهم) سجلّ إيداع فعلي، وسجلّات الإيداع لا تُحذف أبداً حمايةً للسجلّات المالية.`
          : `لا يمكن الاستعادة إلى "${tripId}" لأنها تحوي مسافرين أو مصاريف بالفعل. الاستعادة متاحة للرحلات الفارغة أو غير الموجودة فقط.`);
      }
    }

    // ── الكتابة على دفعات لا تتجاوز ٥٠٠ عملية لكل دفعة (حدّ Firestore) ──────
    const ops = [];
    ops.push({
      ref: tripRef,
      // 🆕 المسؤول المستعيد يصبح منظّم الرحلة — نفس منطق الإنشاء بالضبط (لا
      // استعادة organizerUid القديم من النسخة: قد يشير لحساب لم يعد موجوداً).
      data: { name: trip.name || tripId, itinerary: trip.itinerary, status: trip.status, organizerUid: request.auth.uid },
    });
    for (const t of travelers) {
      ops.push({ ref: dataRoot.collection('travelers').doc(String(t.id)), data: t });
    }
    for (const n of travelerNames) {
      ops.push({ ref: dataRoot.collection('travelerNames').doc(n.shortName), data: { travelerId: n.travelerId } });
    }
    for (const e of expenses) {
      const { id, ...rest } = e;
      ops.push({ ref: dataRoot.collection('expenses').doc(id), data: rest });
    }
    for (const l of depositLogs) {
      const { id, ...rest } = l;
      ops.push({
        ref: dataRoot.collection('travelers').doc(String(l.travelerId)).collection('depositLogs').doc(id),
        data: rest,
      });
    }

    const BATCH_LIMIT = 500;
    let written = 0;
    try {
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const chunk = ops.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        chunk.forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
        written += chunk.length;
      }
    } catch (err) {
      console.error(`[restoreTrip] failed on ${tripId} after ${written}/${ops.length} writes:`, err);
      throw new HttpsError(
        'internal',
        `تعذّرت الاستعادة بعد كتابة ${written} من ${ops.length} عنصراً — الرحلة "${tripId}" في حالة جزئية. راجع سجلّات الخادم قبل إعادة المحاولة.`
      );
    }

    // 🆕 المسؤول المستعيد يصبح منظّم الرحلة — سطر عضوية + organizesTripIds،
    // نفس تزويد manageTrip عند الإنشاء (أفضل جهد، لا يُفشل الاستعادة إن أخفق).
    try {
      const userRecord = await admin.auth().getUser(request.auth.uid);
      await recordMembership(tripId, userRecord, { role: 'organizer' });
      await db.collection('users').doc(request.auth.uid).set(
        { organizesTripIds: FieldValue.arrayUnion(tripId) },
        { merge: true },
      );
    } catch (err) {
      console.error(`[restoreTrip] تعذّر تعيين ${request.auth.uid} منظّماً لـ ${tripId}:`, err);
    }

    console.log(
      `[restoreTrip] restored ${tripId} by ${request.auth.uid}: ` +
      `${travelers.length} travelers, ${expenses.length} expenses, ${depositLogs.length} depositLogs`
    );
    return {
      success: true,
      tripId,
      restored: { travelers: travelers.length, expenses: expenses.length, depositLogs: depositLogs.length },
    };
  })
);

/**
 * ─── دورة حياة الرحلة التلقائية (المرحلة ١ فقط) ────────────────────────────
 *
 * 🆕 أول دالة onSchedule في هذا المستودع. تنقل الرحلة تلقائياً عبر
 * active → completed → archived اعتماداً على تاريخ آخر مقطع في مسارها —
 * انتقال عكوس بالكامل (الأزرار اليدوية في TripDetailPanel.tsx تعمل دائماً
 * بصرف النظر عنه)، بلا أي حذف أو أثر على البيانات المالية. انظر
 * docs/DECISIONS.md ونقاش المرحلة ٢ (إتاحة الحذف النهائي لاحقاً) هناك —
 * غير مُنفَّذة هنا عمداً، تحتاج قراراً منفصلاً.
 *
 * ⚠️ **رحلة بلا مسار (itinerary فارغ) لا تدخل هذا المسار إطلاقاً** —
 * tripEndTimeJs تُعيد null لها، فلا إشارة صادقة لـ"متى انتهت". تبقى `active`
 * حتى يبدّل أحد حالتها يدوياً — قرار نطاق واضح، لا نقص.
 *
 * ⚠️ **رحلة بلا statusChangedAt (كل الرحلات الحالية اليوم) لا تُؤرشَف تلقائياً
 * حتى تكتسب الحقل مرة واحدة** (يدوياً، أو بانتقالها التلقائي من active إلى
 * completed هنا). لا افتراض رجعي لمتى "أُنجزت" رحلة قديمة فعلياً — نفس فلسفة
 * organizerUid/createdByUid الموثَّقة في firestore.rules.
 */
const TRIP_COMPLETION_GRACE_MS = 7  * 24 * 60 * 60 * 1000; // 7 أيام بعد آخر مقطع في المسار
const TRIP_ARCHIVE_GRACE_MS    = 30 * 24 * 60 * 60 * 1000; // 30 يوماً بحالة completed

// حدّ معقول لكل استعلام — عدد الرحلات الواقعي اليوم أبعد ما يكون عن هذا الحجم.
// رحلة تتجاوز هذا الحدّ ضمن دفعة واحدة تُعالَج في التشغيلة اليومية التالية،
// لا فقدان — الدالة تعمل كل يوم لا مرة واحدة.
const LIFECYCLE_BATCH_SIZE = 300;

/**
 * المنطق الفعلي، مُصدَّر كدالة مستقلة قابلة للاستدعاء المباشر من الاختبارات
 * (بلا انتظار جدولة حقيقية أو محاكاة Cloud Scheduler) — exports.advanceTripLifecycle
 * أدناه غلاف onSchedule رفيع حولها فقط.
 *
 * @returns {Promise<{ completed: number, archived: number }>} عدد الرحلات
 * التي انتقلت في كل اتجاه، لتسهيل التحقّق في الاختبارات والسجلّ.
 */
async function advanceTripLifecycleLogic(now = Date.now()) {
  // ── active → completed ────────────────────────────────────────────────
  // ⚠️ where('status','==','active') لا يجد رحلة ناقصة الحقل إطلاقاً — مساواة
  // Firestore الصريحة لا تطابق مستنداً غائب الحقل. تُترَك خارج هذا الاستعلام
  // عمداً (تعامَل active بكل مكان آخر) حتى تُلمَس مرة فتكتسب الحقل صراحة.
  const activeSnap = await db.collection('trips')
    .where('status', '==', 'active')
    .limit(LIFECYCLE_BATCH_SIZE)
    .get();

  const completeBatch = db.batch();
  let completed = 0;
  for (const doc of activeSnap.docs) {
    const endTime = tripEndTimeJs(doc.data().itinerary);
    if (endTime !== null && now - endTime > TRIP_COMPLETION_GRACE_MS) {
      completeBatch.update(doc.ref, { status: 'completed', statusChangedAt: now });
      completed++;
    }
  }
  if (completed > 0) await completeBatch.commit();

  // ── completed → archived ──────────────────────────────────────────────
  const completedSnap = await db.collection('trips')
    .where('status', '==', 'completed')
    .limit(LIFECYCLE_BATCH_SIZE)
    .get();

  const archiveBatch = db.batch();
  let archived = 0;
  for (const doc of completedSnap.docs) {
    const statusChangedAt = doc.data().statusChangedAt;
    if (typeof statusChangedAt === 'number' && now - statusChangedAt > TRIP_ARCHIVE_GRACE_MS) {
      archiveBatch.update(doc.ref, { status: 'archived', statusChangedAt: now });
      archived++;
    }
  }
  if (archived > 0) await archiveBatch.commit();

  console.log(`[advanceTripLifecycle] completed=${completed} archived=${archived}`);
  return { completed, archived };
}

// 🆕 يومياً منتصف الليل — تكرار كافٍ لمدد سماح بالأيام، بلا تكلفة حقيقية
// (استعلامان محدودان بحجم دفعة معقول، بصرف النظر عن عدد الرحلات الكلي).
exports.advanceTripLifecycle = onSchedule(
  { schedule: 'every day 00:00', secrets: [SENTRY_DSN] },
  withSentry('advanceTripLifecycle', async () => {
    await advanceTripLifecycleLogic();
  }),
);

// 🆕 مُصدَّرة للاستدعاء المباشر من الاختبارات فقط — انظر تعليق الدالة أعلاه.
// ليست Cloud Function (لا onCall ولا onSchedule يغلّفها)، فأدوات نشر Firebase
// تتجاهلها؛ متاحة فقط عبر require('./index.js') المباشر لهذا الملف.
exports.advanceTripLifecycleLogic = advanceTripLifecycleLogic;

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 الرحلات طويلة المدى — إغلاق الشهر وترحيل الرصيد، وخروج المنتدَبين
// ═══════════════════════════════════════════════════════════════════════════
//
// ── لماذا هنا لا في المتصفح؟ ────────────────────────────────────────────────
// السؤال طُرح صراحةً، وجوابه ليس تفضيلاً معمارياً بل **أن الترحيل من العميل
// مستحيل التنفيذ أصلاً** بقواعد هذا المشروع القائمة:
//
//   ١. `travelers` تقبل `update` بشرط `isAdmin()` وحده (firestore.rules).
//      منظّم الرحلة — وهو بالضبط من يُغلق الشهر — **لا يستطيع كتابة
//      `deposited` إطلاقاً**. فالدفعة المجمّعة من متصفحه تُرفض كاملةً.
//   ٢. `depositLogs` كذلك: `create` بشرط `isAdmin()`. والاتساق المحاسبي
//      المفروض في utils/deposits.ts يقول إن أي تغيّر في `deposited` يجب أن
//      يُخلّف سطراً — فلا مسار عميل يرضي القاعدتين معاً.
//   ٣. إنشاء المصاريف محكوم بـ `withinExpenseRateLimit`: مصروف واحد كل ثانية
//      لغير المسؤول. ترحيل عشرين عضواً = عشرون مصروفاً في دفعة واحدة، تُرفض.
//   ٤. وحتى لو سقطت الثلاثة، تبقى الذرّية: «تصفير الشهر» و«افتتاح الشهر
//      التالي» يجب أن ينجحا معاً أو يفشلا معاً. تبويب متصفح يُغلق في المنتصف
//      يترك أعضاءً صُفِّروا بلا رصيد افتتاحي — أي **مال اختفى من الدفتر**.
//
// Admin SDK يتجاوز القواعد، فتذوب الثلاثة الأولى؛ والمعاملة (transaction)
// تحسم الرابعة. ولا تُضعَّف أي قاعدة من قواعد العميل لأجل هذه الميزة.
//
// ── ما الذي يعنيه «ترحيل الرصيد» في دفتر هذا التطبيق تحديداً؟ ───────────────
// `remaining = deposited + ما دفعه من جيبه − نصيبه من المصاريف` — دفتر
// **تراكمي بلا شهور**. فالإغلاق لا يغيّر الرصيد الصافي لأحد، ولا يجوز أن
// يغيّره: مجموع حركتَي الإغلاق والافتتاح صفر بالضبط على الدفتر الكلّي.
// ما يفعله فعلاً هو **رسم الخط**: عند تصفية المصاريف بتاريخ الشهر المنتهي
// يظهر ذلك الشهر مصفَّراً تماماً لكل عضو، ويبدأ الشهر الجديد برصيد مُرحَّل
// صريح ومؤرَّخ. الحركتان بكلا الاتجاهين تستخدمان الآليتين القائمتين وحدهما
// (مصروف / حركة إيداع موثّقة) — لا حقل جديد في مخطط المصروف، ولا نوع مستند
// جديد، ولا تعديل واحد على firestore.rules للمصاريف أو الإيداعات.
//
//   له رصيد (credit) → إغلاق: مصروف بقيمة الرصيد بتاريخ آخر يوم في الشهر.
//                      افتتاح: إيداع بنفس القيمة بتاريخ أول يوم في التالي.
//   عليه عجز (debt)  → إغلاق: إيداع بقيمة العجز (يُصفّره).
//                      افتتاح: مصروف بنفس القيمة يُعيد تحميله عليه.
//
// ⚠️ المصروف في القواعد `amount >= 0` — لا مبلغ سالب. ولهذا يُقلب الاتجاهان
// كما أعلاه بدل «مصروف بمبلغ سالب» الذي كان سيُرفض، أو حقل جديد كان سيوسّع
// مخطط المصروف بلا حاجة.

const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** نظير src/utils/longTerm.ts: ROLLOVER_EPSILON — نفس الهللة، لنفس السبب. */
const ROLLOVER_EPSILON = 0.01;

/** نظير src/utils/longTerm.ts: ROLLOVER_CATEGORY — يجب أن يتطابق النصّان حرفياً. */
const ROLLOVER_CATEGORY = 'تسوية شهرية';

/**
 * حدّ أقصى لعدد المسافرين في ترحيل واحد.
 *
 * ⚠️ ليس رقماً اعتباطياً: معاملة Firestore تقبل 500 كتابة كحدّ أقصى، والترحيل
 * يكتب حتى 3 مستندات لكل مسافر (مصروف + مستند المسافر + سطر تدقيق) زائد مستند
 * الرحلة. 150 × 3 + 1 = 451، فيبقى هامش. رحلة تتجاوز هذا العدد تُرفض برسالة
 * صريحة بدل معاملة تفشل بخطأ Firestore خام في منتصف عملية مالية.
 */
const MAX_ROLLOVER_TRAVELERS = 150;

function isValidPeriodKeyJs(value) {
  return typeof value === 'string' && PERIOD_KEY_PATTERN.test(value);
}

/** نظير currentPeriodKey في src/utils/period.ts — انظر تعليقه عن التوقيت المحلي. */
function currentPeriodKeyJs(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** نظير shiftPeriod/nextPeriod — حساب صحيح على فهرس شهري مطلق، بلا كائن Date. */
function nextPeriodJs(key) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const absolute = year * 12 + (month - 1) + 1;
  const newYear = Math.floor(absolute / 12);
  const newMonth = absolute - newYear * 12 + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

function periodStartDateJs(key) {
  return `${key}-01`;
}

function periodEndDateJs(key) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES_JS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function formatPeriodLabelJs(key) {
  if (!isValidPeriodKeyJs(key)) return String(key);
  return `${MONTH_NAMES_JS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

// ─── نظير حساب الأرصدة (src/utils/calculations.ts) ──────────────────────────
//
// ⚠️ **تكرار مقصود وموثّق، على نمط deriveShortNameJs/isValidExpenseJs/
// tripEndTimeJs أعلاه**: هذا الملف يُنشر كحزمة npm مستقلة إلى Cloud Functions،
// ولا حزمة بناء مشتركة بينه وبين مصدر العميل المبنيّ بـ Vite. ما يمنع
// الانحراف هنا هو أن الاختبارات على الجانبين تقيس نفس السلوك على نفس
// الأمثلة: src/utils/calculations.test.ts + calculations.invariants.test.ts
// على العميل، وe2e/long-term-rollover.spec.ts على هذا المسار كاملاً.
//
// ⚠️ وكل تحصينات القاعدة ١٩ منسوخة كما هي لا مبسَّطة: مبلغ غير منتهٍ يُعامَل
// صفراً، والوزن غير المنتهي يُعامَل 1. حذفها هنا يعني أن مستند مصروف تالف
// واحد يُنتج رصيداً `NaN` ثم **حركة مالية بمبلغ NaN** — أخطر بما لا يُقاس من
// أثره على العميل (عرض مشوّه يُصلحه تحديث الصفحة).

function splitEvenJs(total, n) {
  if (n <= 0) return [];
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0);
  const totalHalalas = Math.round(total * 100);
  const base = Math.floor(totalHalalas / n);
  const remainder = totalHalalas - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

function splitBySharesJs(total, participantIds, shares) {
  const n = participantIds.length;
  if (n <= 0) return [];
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0);
  if (!shares || Object.keys(shares).length === 0) return splitEvenJs(total, n);

  const weights = participantIds.map((id) => {
    const w = shares[String(id)];
    return Number.isFinite(w) && w > 0 ? w : 1;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return splitEvenJs(total, n);

  const totalHalalas = Math.round(total * 100);
  const rawShares = weights.map((w) => (totalHalalas * w) / totalWeight);
  const floorShares = rawShares.map(Math.floor);
  const distributed = floorShares.reduce((s, v) => s + v, 0);
  const remainder = totalHalalas - distributed;

  const order = rawShares
    .map((v, i) => ({ i, frac: v - floorShares[i] }))
    .sort((a, b) => b.frac - a.frac);

  const halalas = [...floorShares];
  for (let k = 0; k < remainder && order.length > 0; k++) {
    halalas[order[k % order.length].i] += 1;
  }
  return halalas.map((h) => h / 100);
}

/**
 * نظير calculateBalances — يُرجع خريطة { [travelerId]: remaining }.
 *
 * ⚠️ يُبسَّط عن نظيره في شيء واحد فقط: مطابقة المشارك بمعرّفه الرقمي مباشرةً
 * بدل matchesTraveler (التي تقبل الاسم المختصر أيضاً لمصاريف قديمة جداً).
 * وهذا مقصود ومحدود الأثر: مصروف قديم يشارك فيه مسافر بالاسم لا بالمعرّف
 * يُهمَل نصيبه هنا فيظهر رصيد ذلك المسافر **أعلى** مما هو — ونحن نُرحّل رصيداً
 * أعلى، لا أقل. أي أن أسوأ أثر ممكن هو ترحيل زائد مرئي ومراجَع، لا نقص صامت.
 */
function calculateRemainingByTravelerJs(travelers, expenses) {
  const remaining = new Map();
  travelers.forEach((t) => {
    remaining.set(t.id, Number.isFinite(t.deposited) ? t.deposited : 0);
  });

  expenses.forEach((exp) => {
    if (typeof exp.paidBy === 'number' && remaining.has(exp.paidBy)) {
      remaining.set(exp.paidBy, remaining.get(exp.paidBy) + (Number.isFinite(exp.amount) ? exp.amount : 0));
    }

    const participants = Array.isArray(exp.participants) ? exp.participants : [];
    if (participants.length === 0) return;
    const shares = splitBySharesJs(exp.amount, participants, exp.shares);
    participants.forEach((p, i) => {
      if (remaining.has(p)) remaining.set(p, remaining.get(p) - shares[i]);
    });
  });

  return remaining;
}

/** نظير settlementDirection في src/utils/longTerm.ts. */
function settlementDirectionJs(value) {
  if (!Number.isFinite(value) || Math.abs(value) <= ROLLOVER_EPSILON) return 'settled';
  return value > 0 ? 'credit' : 'debt';
}

/**
 * الحارس المشترك بين closeMonth وexitTraveler: يقرأ الرحلة ويتحقّق أنها رحلة
 * طويلة المدى نشطة يديرها المتصل. يُعيد بيانات الرحلة ومرجعها.
 */
async function requireManagedLongTermTrip(tripId, auth) {
  if (!(await callerManagesTrip(tripId, auth))) {
    throw new HttpsError('permission-denied', 'هذه العملية متاحة لمنظّم الرحلة أو المسؤول فقط.');
  }

  const tripRef = db.collection('trips').doc(tripId);
  const tripSnap = await tripRef.get();
  if (!tripSnap.exists) {
    throw new HttpsError('not-found', `الرحلة "${tripId}" غير موجودة.`);
  }

  const trip = tripSnap.data();
  if ((trip.tripType || 'standard') !== 'long_term') {
    throw new HttpsError(
      'failed-precondition',
      'هذه العملية متاحة للرحلات طويلة المدى (الانتدابات) فقط — الرحلة القياسية تُسوّى مرة واحدة عند انتهائها.',
    );
  }

  // نفس شرط tripAcceptsExpenses في firestore.rules بالضبط: الترحيل يكتب
  // مصاريف، ورحلة منتهية أو مؤرشفة لا تقبلها. لا استثناء للمسؤول هناك ولا هنا.
  if ((trip.status || 'active') !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      'الرحلة ليست نشطة — لا يمكن تسجيل حركات مالية جديدة فيها.',
    );
  }

  return { tripRef, trip };
}

/** مسار بيانات الرحلة — نفس ما تبنيه src/firestore.ts على العميل. */
function tripDataRoot(tripId) {
  return db.collection('artifacts').doc(tripId).collection('public').doc('data');
}

/**
 * يقرأ المسافرين النشطين ومصاريف الرحلة النشطة، ويُرجع رصيد كل مسافر.
 * (المحذوفون ليّناً خارج الحساب تماماً — تماماً كما تفعل الواجهة.)
 */
async function readLedger(tripId) {
  const dataRoot = tripDataRoot(tripId);
  const [travelersSnap, expensesSnap] = await Promise.all([
    dataRoot.collection('travelers').get(),
    dataRoot.collection('expenses').get(),
  ]);

  const travelers = travelersSnap.docs.map((d) => d.data()).filter((t) => !t.deletedAt);
  const expenses = expensesSnap.docs.map((d) => d.data()).filter((e) => !e.deletedAt);

  return { travelers, expenses, remaining: calculateRemainingByTravelerJs(travelers, expenses) };
}

/**
 * يبني حركة «مصروف تسوية» — يُنقص رصيد مسافر واحد بالمبلغ المذكور.
 *
 * ⚠️ الحمولة تطابق isValidExpense في firestore.rules حقلاً بحقل رغم أن Admin
 * SDK يتجاوزها: مستند لا يمرّ بالقواعد اليوم هو مستند لا يستطيع صاحبه تعديله
 * غداً من الواجهة (`allow update` تُقيّم الشكل الكامل)، فيصير سطراً مالياً
 * عالقاً لا يُصلَح إلا بسكربت.
 */
function buildAdjustmentExpense(traveler, amount, date, description, actorUid) {
  return {
    date,
    description,
    amount,
    originalAmount: amount,
    currency: 'SAR',
    exchangeRate: 1,
    participants: [traveler.id],
    category: ROLLOVER_CATEGORY,
    paidBy: 'fund',
    createdAt: Date.now(),
    // من ضغط الزرّ فعلاً — لا هوية خدمية مخترعة. نفس مبدأ isOwnCreation:
    // حقل يوثّق «من سجّل هذا» ولا يصدق لا يوثّق شيئاً.
    createdByUid: actorUid,
    deletedAt: null,
  };
}

/** يبني سطر تدقيق إيداع مطابقاً لـ isValidDepositLog في القواعد. */
function buildDepositLog(travelerId, previousDeposited, newDeposited, reason, actor) {
  return {
    travelerId,
    previousDeposited,
    newDeposited,
    delta: newDeposited - previousDeposited,
    mode: 'add',
    reason,
    changedByEmail: actor.email || '',
    changedByUid: actor.uid,
    createdAt: Date.now(),
  };
}

/**
 * 🆕 closeMonth — إغلاق الشهر المحاسبي وترحيل أرصدة كل الأعضاء إلى الشهر التالي.
 *
 * متاحة لمنظّم الرحلة أو المسؤول العالمي (نفس شرط manageInvite/exitTraveler).
 *
 * ── الحماية من الترحيل المزدوج ─────────────────────────────────────────────
 * حارسان مستقلان، لأن ترحيلاً يُنفَّذ مرتين يضاعف رصيد كل عضو — وهو أسوأ عطل
 * ممكن في هذه الميزة:
 *   ١. `period > lastClosedPeriod` (مقارنة نصية = مقارنة زمنية، انظر
 *      utils/period.ts) — يمنع إعادة إغلاق شهر مضى مهما كانت قيمة currentPeriod.
 *   ٢. المعاملة (transaction) تُعيد قراءة مستند الرحلة داخلها وتتحقّق ثانيةً
 *      قبل الكتابة — يمنع نقرتين متزامنتين من تبويبين مختلفين.
 * وثالث في firestore.rules: العميل لا يستطيع تعديل lastClosedPeriod إطلاقاً.
 */
exports.closeMonth = onCall(
  { region: 'us-central1', maxInstances: 5, secrets: [SENTRY_DSN] },
  withSentry('closeMonth', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }
    if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('failed-precondition', 'هذه العملية تتطلب حساباً حقيقياً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const period = String(request.data?.period ?? '').trim();

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!isValidPeriodKeyJs(period)) {
      throw new HttpsError('invalid-argument', 'الشهر المطلوب إغلاقه غير صالح — الصيغة YYYY-MM.');
    }

    const { tripRef, trip } = await requireManagedLongTermTrip(tripId, request.auth);

    const lastClosedPeriod = isValidPeriodKeyJs(trip.lastClosedPeriod) ? trip.lastClosedPeriod : null;
    const currentPeriod = isValidPeriodKeyJs(trip.currentPeriod) ? trip.currentPeriod : currentPeriodKeyJs();

    if (lastClosedPeriod && period <= lastClosedPeriod) {
      throw new HttpsError(
        'failed-precondition',
        `${formatPeriodLabelJs(period)} مُغلق بالفعل — آخر شهر أُغلق هو ${formatPeriodLabelJs(lastClosedPeriod)}.`,
      );
    }
    if (period !== currentPeriod) {
      throw new HttpsError(
        'failed-precondition',
        `الشهر المفتوح حالياً هو ${formatPeriodLabelJs(currentPeriod)} — لا يمكن إغلاق شهر غيره.`,
      );
    }

    const { travelers, remaining } = await readLedger(tripId);
    if (travelers.length === 0) {
      throw new HttpsError('failed-precondition', 'لا يوجد أعضاء نشطون في هذه الرحلة لترحيل أرصدتهم.');
    }
    if (travelers.length > MAX_ROLLOVER_TRAVELERS) {
      throw new HttpsError(
        'failed-precondition',
        `عدد الأعضاء (${travelers.length}) يتجاوز الحدّ الذي يمكن ترحيله في عملية واحدة (${MAX_ROLLOVER_TRAVELERS}).`,
      );
    }

    const openedPeriod = nextPeriodJs(period);
    const closingDate = periodEndDateJs(period);
    const openingDate = periodStartDateJs(openedPeriod);
    const closingLabel = formatPeriodLabelJs(period);
    const openingLabel = formatPeriodLabelJs(openedPeriod);
    const actor = { uid: request.auth.uid, email: request.auth.token.email || '' };

    const dataRoot = tripDataRoot(tripId);
    let movements = [];
    let expensesWritten = 0;
    let depositsWritten = 0;

    await db.runTransaction(async (tx) => {
      // ⚠️ **التصفير في أول المعاملة لا خارجها.** Firestore تُعيد تشغيل دالة
      // المعاملة كاملةً عند تعارض، وحصيلة التشغيل السابق تبقى في هذه
      // المتغيّرات — فيُبلَّغ المنظّم بضعف عدد الحركات التي كُتبت فعلاً، وتظهر
      // كل حركة مرتين في ملخّص الإغلاق. الكتابات نفسها سليمة (المعاملة تُلغي
      // محاولتها الفاشلة)؛ التقرير وحده هو ما كان سيكذب.
      movements = [];
      expensesWritten = 0;
      depositsWritten = 0;

      // ⚠️ الحارس الثاني — داخل المعاملة لا قبلها: القراءة أعلاه قد تكون سبقت
      // ترحيلاً نفّذه تبويب آخر قبل ثوانٍ. المعاملة تُعيد المحاولة تلقائياً إن
      // تغيّر المستند بينهما، فتقع هذه القراءة بعد ذلك الترحيل وترى أثره.
      const fresh = await tx.get(tripRef);
      const freshLastClosed = fresh.exists && isValidPeriodKeyJs(fresh.data().lastClosedPeriod)
        ? fresh.data().lastClosedPeriod
        : null;
      if (freshLastClosed && period <= freshLastClosed) {
        throw new HttpsError('failed-precondition', `${closingLabel} أُغلق للتو من جهاز آخر.`);
      }

      travelers.forEach((traveler) => {
        const balance = remaining.get(traveler.id) ?? 0;
        // هللة — تقريب قبل أي قرار، فلا تُكتب حركة بـ 0.004 ريال ولا تُخزَّن
        // قيمة بكسور لا تُمثَّل في نظام لا يعرف أدقّ من الهللة.
        const rounded = Math.round(balance * 100) / 100;
        const direction = settlementDirectionJs(rounded);
        movements.push({
          travelerId: traveler.id,
          travelerName: traveler.name,
          remaining: rounded,
          direction,
        });
        if (direction === 'settled') return;

        const amount = Math.abs(rounded);
        const travelerRef = dataRoot.collection('travelers').doc(String(traveler.id));
        const previousDeposited = Number.isFinite(traveler.deposited) ? traveler.deposited : 0;
        const newDeposited = Math.round((previousDeposited + amount) * 100) / 100;

        if (direction === 'credit') {
          // إغلاق: مصروف يستهلك رصيده المتبقّي فيصير صفراً في الشهر المنتهي.
          tx.set(
            dataRoot.collection('expenses').doc(),
            buildAdjustmentExpense(traveler, amount, closingDate,
              `ترحيل رصيد ${traveler.name} — إغلاق ${closingLabel}`, actor.uid),
          );
          // افتتاح: إيداع بنفس القيمة يفتح به الشهر الجديد، بسطر تدقيق ملازم.
          tx.update(travelerRef, { deposited: newDeposited });
          tx.set(
            travelerRef.collection('depositLogs').doc(),
            buildDepositLog(traveler.id, previousDeposited, newDeposited,
              `رصيد افتتاحي مُرحَّل من ${closingLabel} إلى ${openingLabel}`, actor),
          );
          expensesWritten += 1;
          depositsWritten += 1;
          return;
        }

        // debt — الاتجاه المعاكس بنفس الآليتين: إيداع يُصفّر العجز في الشهر
        // المنتهي، ومصروف يُعيد تحميله عليه في الشهر الجديد.
        tx.update(travelerRef, { deposited: newDeposited });
        tx.set(
          travelerRef.collection('depositLogs').doc(),
          buildDepositLog(traveler.id, previousDeposited, newDeposited,
            `تسوية إغلاق ${closingLabel} — تصفير عجز مُرحَّل إلى ${openingLabel}`, actor),
        );
        tx.set(
          dataRoot.collection('expenses').doc(),
          buildAdjustmentExpense(traveler, amount, openingDate,
            `عجز مُرحَّل من ${closingLabel} — افتتاح ${openingLabel}`, actor.uid),
        );
        expensesWritten += 1;
        depositsWritten += 1;
      });

      tx.set(tripRef, {
        currentPeriod: openedPeriod,
        lastClosedPeriod: period,
        lastClosedAt: Date.now(),
      }, { merge: true });
    });

    console.log(`[closeMonth] ${tripId}: ${period} → ${openedPeriod} (${expensesWritten} مصروف، ${depositsWritten} إيداع)`);

    return {
      success: true,
      tripId,
      closedPeriod: period,
      openedPeriod,
      movements,
      written: { expenses: expensesWritten, deposits: depositsWritten },
    };
  }),
);

/**
 * 🆕 exitTraveler — خروج منتدَب من رحلة طويلة المدى، بحساب مسوّى إلزاماً.
 *
 * ── لماذا لا يكفي فحص في الواجهة؟ ──────────────────────────────────────────
 * لأن الواجهة **لا تستطيع تنفيذ الخروج أصلاً**: نقل المسافر للسلة يتطلب
 * `update` على `travelers`، وشرطها `isAdmin()` وحده — فمنظّم الرحلة (وهو من
 * يدير الانتدابات فعلاً) لا يملك هذا المسار من متصفحه. ولأن التسوية نفسها
 * تكتب `deposited` وسطر تدقيق، وكلاهما `isAdmin()` كذلك.
 *
 * ── العقد ─────────────────────────────────────────────────────────────────
 *   settle: false → يرفض الخروج إن كان الرصيد غير مسوّى، ويسمّي المبلغ
 *                   والاتجاه في نص الخطأ. هذا هو «الإرشاد» المطلوب.
 *   settle: true  → يُنشئ معاملة التسوية التي تُصفّر الرصيد **ثم** يُخرجه، في
 *                   معاملة واحدة. لا نافذة زمنية يبقى فيها مسافر مُسوّى وغير
 *                   مُخرَج (أو العكس، وهو الأسوأ: خرج بلا أثر لتسويته).
 *
 * ⚠️ الخروج حذف ليّن دائماً (`deletedAt`) — القاعدة ٥. وحجز الاسم يُحرَّر معه
 * في نفس المعاملة، تماماً كما يفعل confirmDeleteTraveler على العميل (القاعدة ٦).
 */
exports.exitTraveler = onCall(
  { region: 'us-central1', maxInstances: 5, secrets: [SENTRY_DSN] },
  withSentry('exitTraveler', async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const travelerId = Number(request.data?.travelerId);
    const settle = request.data?.settle === true;

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!Number.isInteger(travelerId)) {
      throw new HttpsError('invalid-argument', 'معرّف المسافر غير صالح.');
    }

    const { trip } = await requireManagedLongTermTrip(tripId, request.auth);

    const { travelers, remaining } = await readLedger(tripId);
    const traveler = travelers.find((t) => t.id === travelerId);
    if (!traveler) {
      throw new HttpsError('not-found', 'هذا العضو غير موجود في الرحلة (أو أُخرج منها بالفعل).');
    }

    // ⚠️ منفصل عن فحص الرصيد أدناه عمداً: تسوية الرصيد لا تحلّ هذا — البنك
    // الذي تصل له كل التحويلات (organizerUid، انظر BankDetailsCard) يبقى بنكه
    // حتى بعد خروجه من دفتر المسافرين. نفس الصياغة بالضبط في
    // describeOrganizerExitBlock (src/utils/longTerm.ts) — المنظّم يجب أن
    // يقرأ الجملة نفسها سواء منعته الواجهة قبل الطلب أو منعه الخادم بعده.
    //
    // ⚠️ والنصّ يذكر تسميات واجهة (تبويب «المسافرون»، زرّ «تعيين منظّماً»)،
    // فأي إعادة تسمية لها في TripDetailPanel.tsx تُبطل **هذه النسخة أيضاً** لا
    // نسخة العميل وحدها. حدث ذلك فعلاً: دمج «الأعضاء» في «المسافرون» وحذف
    // «إدارة الرحلات» تركا الجملتين تُرشدان إلى مكان محذوف. اختبار
    // longTerm.test.ts يحرس نسخة العميل؛ لا يمكنه رؤية هذا الملف، فالمزامنة
    // هنا يدوية — عدّلهما معاً دائماً.
    if (traveler.uid && trip.organizerUid && traveler.uid === trip.organizerUid) {
      throw new HttpsError(
        'failed-precondition',
        `لا يمكن إخراج ${traveler.name} — هو منظّم الرحلة، والتحويلات البنكية تصل لحسابه حالياً. عيّن منظّماً آخر أولاً: «تعديل الرحلة» من اسم الرحلة في الأعلى ← تبويب «المسافرون» ← «تعيين منظّماً». الزرّ يظهر لمن ربط حسابه فقط.`,
      );
    }

    const balance = Math.round((remaining.get(travelerId) ?? 0) * 100) / 100;
    const direction = settlementDirectionJs(balance);

    if (direction !== 'settled' && !settle) {
      // ⚠️ نفس صياغة describeExitBlock في src/utils/longTerm.ts — المنظّم يجب
      // أن يقرأ الجملة نفسها سواء منعته الواجهة قبل الطلب أو منعه الخادم بعده.
      const amount = Math.abs(balance).toFixed(2);
      throw new HttpsError(
        'failed-precondition',
        direction === 'credit'
          ? `لا يمكن إخراج ${traveler.name} قبل تسوية حسابه — له رصيد متبقٍّ ${amount} ريال.`
          : `لا يمكن إخراج ${traveler.name} قبل تسوية حسابه — عليه ${amount} ريال.`,
      );
    }

    const actor = { uid: request.auth.uid, email: request.auth.token.email || '' };
    const dataRoot = tripDataRoot(tripId);
    const travelerRef = dataRoot.collection('travelers').doc(String(travelerId));
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    await db.runTransaction(async (tx) => {
      // ⚠️ يجب قراءة المستند داخل المعاملة قبل الكتابة عليه — والقراءة هنا
      // تخدم غرضاً حقيقياً لا شكلياً: تكشف خروجاً نفّذه منظّم آخر قبل ثوانٍ،
      // فلا تُكتب تسوية لعضو خرج بالفعل.
      const fresh = await tx.get(travelerRef);
      if (!fresh.exists || fresh.data().deletedAt) {
        throw new HttpsError('failed-precondition', 'أُخرج هذا العضو للتو من جهاز آخر.');
      }

      // ⚠️ **تحديث واحد لمستند المسافر لا اثنان.** الرصيد والخروج يُكتبان معاً
      // في عملية واحدة: كتابتان منفصلتان على نفس المستند داخل معاملة واحدة
      // سلوكهما دقيق ويسهل كسره بإعادة ترتيب بريئة لاحقاً، ولا شيء يُكسب منهما.
      const travelerUpdate = { deletedAt: Date.now() };

      if (direction === 'credit') {
        // له رصيد: مصروف تسوية يستهلكه (يقابله في الواقع إعادة المبلغ له نقداً).
        tx.set(
          dataRoot.collection('expenses').doc(),
          buildAdjustmentExpense(traveler, Math.abs(balance), todayDate,
            `تسوية خروج ${traveler.name} — إعادة الرصيد المتبقّي`, actor.uid),
        );
      } else if (direction === 'debt') {
        // عليه عجز: حركة إيداع تُصفّره (يقابلها في الواقع استلام المبلغ منه).
        const previousDeposited = Number.isFinite(fresh.data().deposited) ? fresh.data().deposited : 0;
        const newDeposited = Math.round((previousDeposited + Math.abs(balance)) * 100) / 100;
        travelerUpdate.deposited = newDeposited;
        tx.set(
          travelerRef.collection('depositLogs').doc(),
          buildDepositLog(travelerId, previousDeposited, newDeposited,
            `تسوية خروج ${traveler.name} — سداد العجز المتبقّي`, actor),
        );
      }

      tx.update(travelerRef, travelerUpdate);
      // تحرير حجز الاسم — نفس سلوك confirmDeleteTraveler بالضبط، وإلا بقي اسم
      // شخص خرج حاجزاً للاسم إلى الأبد (القاعدة ٦).
      if (typeof traveler.shortName === 'string' && traveler.shortName) {
        tx.delete(dataRoot.collection('travelerNames').doc(traveler.shortName));
      }
    });

    console.log(`[exitTraveler] ${tripId}: خرج ${travelerId} (رصيد ${balance}، تسوية: ${settle})`);

    return { success: true, tripId, travelerId, settledAmount: direction === 'settled' ? 0 : Math.abs(balance), direction };
  }),
);
