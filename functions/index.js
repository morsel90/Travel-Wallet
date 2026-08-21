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
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

const db = admin.firestore();

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

// 🆕 مطابقة JS لـ isValidBankDetails في firestore.rules — manageTrip دالة
// Admin SDK فتتجاوز القواعد، فالتحقق من شكل bankDetails يجب أن يتكرر هنا.
function isValidBankDetailsInput(b) {
  if (b === undefined) return true;
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return false;
  const allowedKeys = ['bankName', 'beneficiary', 'iban'];
  if (Object.keys(b).some(k => !allowedKeys.includes(k))) return false;
  const maxLen = { bankName: 100, beneficiary: 100, iban: 40 };
  return allowedKeys.every(k => b[k] === undefined || (typeof b[k] === 'string' && b[k].length <= maxLen[k]));
}

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
 * معماري مقصود، انظر ~/.claude/plans/cozy-discovering-ocean.md للسياق الكامل.
 * غير المسؤول الذي ينشئ رحلة يُمنح عندها: claim العضوية (trips[tripId]=true)،
 * سطر عضوية بدور 'organizer'، وملف مسافر تلقائي — بنفس آلية joinViaInvite
 * تماماً، فقط دون استهلاك رمز دعوة لأنه هو نفسه مصدر الرحلة.
 *
 * 🆕 لم تعد تلمس أي سرّ (لا رمز رحلة بعد الآن — انظر تعليق أعلى الملف)، فالسبب
 * الوحيد المتبقي لبقاء الحذف خادمياً لا قاعدة Firestore هو: يحتاج قراءة عبر
 * مجموعات فرعية متعددة (members/travelers/expenses) والتحقّق من الخلوّ قبل
 * الكتابة الذرّية — تسلسل لا تعبّر عنه قاعدة واحدة بسهولة. الإنشاء الذاتي
 * يحتاجها أيضاً الآن لسبب مختلف: منح claim وسجلّ عضوية ودور منظّم معاً بذرّية
 * واحدة — Admin SDK وحده يستطيع setCustomUserClaims.
 *
 * تفاصيل الرحلة غير السرّية (الاسم/البنك/المسار) بعد الإنشاء لا تمرّ من هنا —
 * تُكتب مباشرة من الواجهة عبر قواعد Firestore (isValidTripConfig)، وهي المسار
 * الأخف والأسرع. bankDetails هنا اختيارية فقط لتعبئة أول قيمة عند الإنشاء
 * (من بروفايل المُنشئ users/{uid}) — التعديل اللاحق يمر من ذلك المسار المباشر.
 */
exports.manageTrip = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
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
    const bankDetailsInput = mode === 'create' ? request.data?.bankDetails : undefined;
    if (mode === 'create' && !isValidBankDetailsInput(bankDetailsInput)) {
      throw new HttpsError('invalid-argument', 'بيانات البنك المُرسلة غير صالحة.');
    }

    // 🆕 حدّ زمني للإنشاء الذاتي (غير المسؤول فقط — نفس استثناء المسؤول من حدّ
    // المصاريف). يُقرأ من بروفايل المُنشئ users/{uid}، ويُحدَّث بعد نجاح الإنشاء
    // أدناه. المسؤول معفى بالكامل، تماماً كما كان سلوكه دائماً قبل هذا التغيير.
    let userRecord = null;
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
      // 🆕 نجلبه هنا (لا بعد الكتابة) ليفشل الطلب مبكراً إن تعذّر جلب الحساب،
      // بدل إنشاء رحلة يتعذّر بعدها منح صاحبها عضويتها فيها.
      userRecord = await admin.auth().getUser(request.auth.uid);
    }

    const tripRef = db.collection('trips').doc(tripId);
    const existing = await tripRef.get();

    // ── الحذف: للرحلات الفارغة حصراً ────────────────────────────────────────
    //
    // ⚠️ لماذا خادميًا ولماذا بشرط الخلو:
    //   • firestore.rules تُبقي `allow delete: if false` على trips/{tripId}
    //     للعميل مهما كان — فلا مسار حذف من المتصفح إطلاقاً.
    //   • شرط الخلو هو ما يجعل تدمير رحلة حقيقية مستحيلاً بغلطة أو بنيّة. وهو
    //     أيضاً ما يُبقي المبرر الأصلي للمنع قائماً: لا بيانات في
    //     artifacts/{tripId} لتصبح يتيمة بعد حذف مستند الرحلة.
    //   • سجلات الإيداع (depositLogs) غير قابلة للحذف بالتصميم لتكون مرجعاً في
    //     أي نزاع مالي. وجود مسافر واحد يعني احتمال وجود سجل، فنرفض قبل الوصول
    //     إلى ذلك أصلاً.
    //
    // الحاجة المخدومة: رحلة أُنشئت بالخطأ (معرّف مكتوب خطأً غالباً). وحذفها
    // يحرّر المعرّف لإعادة استخدامه، وهو ما لا تحققه الأرشفة.
    if (mode === 'delete') {
      if (!existing.exists) {
        throw new HttpsError('not-found', `الرحلة "${tripId}" غير موجودة.`);
      }

      // limit(1) يكفي: نسأل «هل توجد بيانات؟» لا «كم عددها»
      const [travelers, expenses] = await Promise.all([
        db.collection('artifacts').doc(tripId).collection('public').doc('data')
          .collection('travelers').limit(1).get(),
        db.collection('artifacts').doc(tripId).collection('public').doc('data')
          .collection('expenses').limit(1).get(),
      ]);

      if (!travelers.empty || !expenses.empty) {
        throw new HttpsError(
          'failed-precondition',
          `لا يمكن حذف "${tripId}" لأنها تحوي مسافرين أو مصاريف. الحذف متاح للرحلات الفارغة فقط حمايةً للسجلات المالية.`
        );
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

      console.log(`[manageTrip] delete on ${tripId} by ${request.auth.uid}`);
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
      bankDetails: {
        bankName:    bankDetailsInput?.bankName    ?? '',
        beneficiary: bankDetailsInput?.beneficiary ?? '',
        iban:        bankDetailsInput?.iban        ?? '',
      },
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
    });

    console.log(`[manageTrip] create on ${tripId} by ${request.auth.uid}`);

    // 🆕 الإنشاء الذاتي (غير المسؤول): يصبح المُنشئ منظّم رحلته فوراً — نفس ما
    // تفعله joinViaInvite بالضبط (claim + سجلّ عضوية + ملف مسافر)، فقط بدور
    // 'organizer' بدل 'member' الافتراضي، وبلا استهلاك رمز دعوة.
    if (!isAdminCaller && userRecord) {
      const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {};
      const nextClaims = {
        ...userRecord.customClaims,
        trips: { ...existingTrips, [tripId]: true },
      };
      assertClaimsFitTokenLimit(nextClaims);
      await admin.auth().setCustomUserClaims(request.auth.uid, nextClaims);

      await recordMembership(tripId, userRecord, { role: 'organizer' });

      // 🆕 أفضل جهد — لا يُفشل الإنشاء إن أخفق، تماماً كما في joinViaInvite.
      try {
        await provisionTravelerForUid(
          tripId, request.auth.uid, request.auth.token.name || userRecord.displayName,
        );
      } catch (err) {
        console.error(`[manageTrip] تعذّر تزويد مسافر تلقائي لـ ${request.auth.uid} على ${tripId}:`, err);
      }

      await db.collection('users').doc(request.auth.uid)
        .set({ lastTripCreatedAt: Date.now() }, { merge: true });
    }

    return { success: true, tripId };
  }
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
  },
  async (request) => {
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

      await memberDocRef.set({ role }, { merge: true });
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
  }
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

function isValidBankDetailsJs(b) {
  if (!isPlainObject(b)) return false;
  if (!hasOnlyKeys(b, ['bankName', 'beneficiary', 'iban'])) return false;
  const limits = { bankName: 100, beneficiary: 100, iban: 40 };
  return Object.keys(limits).every(
    (k) => !(k in b) || (typeof b[k] === 'string' && b[k].length <= limits[k])
  );
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

function randomTravelerId() {
  return (crypto.randomInt(0, 2147483646)) + 1;
}

// 🆕 حدّ محاولات معقول: كل محاولة فاشلة تعني تعارضاً حقيقياً على شكل الاسم
// المختصر (المعرّف العشوائي شبه مستحيل التصادم فعلياً) — مجموعة سفر بهذا العدد
// من الأشخاص بنفس الاسم الأول حرفياً حالة نادرة جداً، وما بعدها عطل حقيقي.
const MAX_PROVISION_ATTEMPTS = 20;

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
  { region: 'us-central1', maxInstances: 5 },
  async (request) => {
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
  }
);

exports.joinViaInvite = onCall(
  { region: 'us-central1', maxInstances: 5 },
  async (request) => {
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
    let needsName = false;
    try {
      const result = await provisionTravelerForUid(
        tripId, request.auth.uid, request.auth.token.name || userRecord.displayName,
      );
      needsName = result.created && result.usedDefaultName;
    } catch (err) {
      console.error(`[joinViaInvite] تعذّر تزويد مسافر تلقائي لـ ${request.auth.uid} على ${tripId}:`, err);
    }

    console.log(`[joinViaInvite] ${request.auth.uid} joined ${tripId} via invite`);
    return { success: true, tripId, needsName };
  }
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
  { region: 'us-central1', maxInstances: 10 },
  async (request) => {
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
  }
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
  { region: 'us-central1', maxInstances: 5 },
  async (request) => {
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
  }
);

exports.restoreTrip = onCall(
  { region: 'us-central1', maxInstances: 2, timeoutSeconds: 120 },
  async (request) => {
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
    if (!isValidBankDetailsJs(trip.bankDetails)) {
      throw new HttpsError('invalid-argument', 'تفاصيل الحساب البنكي داخل النسخة غير صالحة.');
    }
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
    // نفس شرط manageTrip mode=delete بالضبط — انظر التعليق أعلى الدالة.
    const tripRef = db.collection('trips').doc(tripId);
    const dataRoot = db.collection('artifacts').doc(tripId).collection('public').doc('data');
    const existing = await tripRef.get();
    if (existing.exists) {
      const [existingTravelers, existingExpenses] = await Promise.all([
        dataRoot.collection('travelers').limit(1).get(),
        dataRoot.collection('expenses').limit(1).get(),
      ]);
      if (!existingTravelers.empty || !existingExpenses.empty) {
        throw new HttpsError(
          'failed-precondition',
          `لا يمكن الاستعادة إلى "${tripId}" لأنها تحوي مسافرين أو مصاريف بالفعل. الاستعادة متاحة للرحلات الفارغة أو غير الموجودة فقط.`
        );
      }
    }

    // ── الكتابة على دفعات لا تتجاوز ٥٠٠ عملية لكل دفعة (حدّ Firestore) ──────
    const ops = [];
    ops.push({
      ref: tripRef,
      data: { name: trip.name || tripId, bankDetails: trip.bankDetails, itinerary: trip.itinerary, status: trip.status },
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

    console.log(
      `[restoreTrip] restored ${tripId} by ${request.auth.uid}: ` +
      `${travelers.length} travelers, ${expenses.length} expenses, ${depositLogs.length} depositLogs`
    );
    return {
      success: true,
      tripId,
      restored: { travelers: travelers.length, expenses: expenses.length, depositLogs: depositLogs.length },
    };
  }
);
