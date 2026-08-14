/**
 * Cloud Functions لتطبيق "مصاريف السفر".
 *
 * verifyTripPin: دالة قابلة للاستدعاء (Callable) تتحقق من رمز رحلة مشترك
 * (Trip PIN) خادميًا، ثم تمنح المستخدم الحالي (حتى لو كان مجهولًا/Anonymous)
 * صلاحية "عضو في هذه الرحلة تحديداً" عبر Custom Claim باسم `trips` (خريطة
 * { [tripId]: true }). هذا الـ Claim هو ما تتحقق منه قواعد Firestore (انظر
 * firestore.rules: isMember(appId)) للسماح بالقراءة والإنشاء ضمن مسار هذه
 * الرحلة تحديداً — لا يمنح أي صلاحية على رحلات أخرى.
 *
 * 🆕 دعم رحلات متعددة: كل رحلة تخزّن هاش رمزها الخاص في مستند
 * tripSecrets/{tripId} (بدل سر Secret Manager عالمي واحد سابقاً TRIP_PIN) —
 * هذا يتيح للمسؤول إضافة رحلة جديدة فوراً (عبر scripts/create-trip.mjs) دون
 * أي حاجة لإعادة نشر هذه الدالة. الرمز نفسه لا يُخزَّن أبداً كنص صريح — فقط
 * هاش SHA-256 مع ملح (salt) عشوائي خاص بكل رحلة.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');

admin.initializeApp();

const db = admin.firestore();
const WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة
const MAX_PIN_INPUT_LENGTH = 128;
// 🆕 حد أدنى لطول الرمز عند إنشائه من الواجهة. لا يُطبَّق على التحقق
// (verifyTripPin) حتى لا تنكسر رحلات قائمة رمزها أقصر من هذا.
const MIN_PIN_LENGTH = 4;

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts —
// إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً، لمنع tripId
// من أن يتحول لمسار Firestore خبيث أو معرّف غير متوقع.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

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

// 🆕 وظيفة حماية من محاولات التخمين المستمرة (Rate Limiting)
//
// ⚠️ المفتاح يشمل tripId عمداً (يجب أن يكون مُتحقَّقاً من صيغته قبل الاستدعاء —
// انظر TRIP_ID_PATTERN في verifyTripPin، فهو يدخل في معرّف مستند):
//
//   • قبلاً كان المفتاح `anon_${ip}` وحده، فتجاوز الحدّ على رحلة واحدة يحظر
//     المستخدم عن **كل** الرحلات — بما فيها رحلات يعرف رموزها تماماً.
//   • الحماية الفعلية المقصودة هي ضد تخمين رمز رحلة بعينها، وهذه يحفظها
//     التضييق كما هي: عدد المحاولات على الرحلة الواحدة لم يتغير مبدؤه.
//
// ⚠️ ولماذا الـ IP لا الـ uid للمجهولين: إنشاء حساب مجهول جديد مجاني وفوري
// (signInAnonymously)، فحدٌّ مبني على uid يُتجاوز بإعادة تحميل الصفحة. الـ IP
// ليس مثالياً لكنه المؤشر الوحيد الذي له كلفة على المهاجم.
//
// وحدّ المجهولين مرفوع من 5 إلى 15 لأن التضييق وحده لا يعالج الحالة التي دفعتنا
// لهذا: مجموعة سفر تنضم **لنفس الرحلة** من شبكة واحدة (واي فاي فندق، أو نقطة
// اتصال من جوال أحدهم) تتشارك المفتاح ذاته. خمسة أشخاص يخطئ اثنان منهم مرة
// واحدة كان يكفي لحظر المجموعة كلها ربع ساعة — وهو سيناريو متوقّع تماماً
// لتطبيق غرضه أن تنضم مجموعة لرحلة في وقت واحد.
async function checkRateLimit(request, tripId) {
  const now = Date.now();
  const ip = request.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const uid = request.auth?.uid;

  // التحقق الدقيق من نوع المصادقة لتفادي حظر مستخدمين مسجلين لا يملكون بريداً إلكترونياً
  const isAnonymous = request.auth?.token?.firebase?.sign_in_provider === 'anonymous';

  const scope = isAnonymous ? `anon_${ip}` : `auth_${uid || ip}`;
  const key = `${scope}_${tripId}`;
  const limit = isAnonymous ? 15 : 20;

  const docRef = db.collection('rateLimits').doc(`verify_${key}`);
  const snap = await docRef.get();
  
  // تعيين وقت الانتهاء في المستقبل (24 ساعة) لسياسة TTL
  const expireAt = Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);

  if (!snap.exists) {
    await docRef.set({
      count: 1,
      windowStart: now,
      expireAt: expireAt
    });
    return { limited: false };
  }
  
  const data = snap.data();
  const windowStart = data.windowStart;
  
  // انتهت النافذة الزمنية
  if (now - windowStart > WINDOW_MS) {
    await docRef.set({
      count: 1,
      windowStart: now,
      expireAt: expireAt
    });
    return { limited: false };
  }
  
  // تجاوز الحد
  if (data.count >= limit) {
    console.warn(`[RATE_LIMIT] Blocked: ${key}, count: ${data.count}`);
    const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - now) / 1000);
    return { limited: true, retryAfter: retryAfterSeconds };
  }
  
  // زيادة العداد بشكل آمن وتفادي مشاكل التزامن
  await docRef.update({ 
    count: FieldValue.increment(1) 
  });
  return { limited: false };
}

exports.verifyTripPin = onCall(
  {
    region: 'us-central1',
    // حد أقصى للنسخ المتزامنة يقلل من الأثر المالي لأي محاولة إساءة استخدام (تخمين متكرر)
    maxInstances: 5,
  },
  async (request) => {
    // يجب أن يكون المستخدم مسجّل دخول (ولو بحساب مجهول) قبل محاولة التحقق من الرمز
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const submitted = String(request.data?.pin ?? '').trim();

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }

    if (!submitted || submitted.length > MAX_PIN_INPUT_LENGTH) {
      throw new HttpsError('invalid-argument', 'أدخل رمز الرحلة.');
    }

    // 🆕 التحقق من تجاوز حد المحاولات قبل قراءة الرمز السري من قاعدة البيانات.
    // tripId مُتحقَّق من صيغته أعلاه — شرط لازم لأنه يدخل في معرّف مستند العدّاد.
    const rateCheck = await checkRateLimit(request, tripId);
    
    if (rateCheck.limited) {
      const minutesLeft = Math.ceil(rateCheck.retryAfter / 60);
      // ⚠️ الوسيط الثالث (details) ليس زينة: العميل يقرأ منه retryAfter ليعرض
      // عدّاً تنازلياً دقيقاً. كان مفقوداً، فكان العميل يسقط على قيمته الاحتياطية
      // (900 ثانية) ويعرض «15 دقيقة» دائماً مهما كان المتبقي الحقيقي — انظر
      // callVerify في hooks/useAuth.ts.
      throw new HttpsError(
        'resource-exhausted',
        `تجاوزت عدد المحاولات المسموحة. يرجى المحاولة بعد ${minutesLeft} دقيقة.`,
        { retryAfter: rateCheck.retryAfter }
      );
    }

    const secretSnap = await db.collection('tripSecrets').doc(tripId).get();

    // ⚠️ نفس رسالة الخطأ سواء كانت الرحلة غير موجودة أصلاً أو كان الرمز خاطئاً
    // فقط — لمنع أي تسريب معلومات لمن يحاول تخمين معرّفات رحلات عشوائية عبر ?trip=
    if (!secretSnap.exists) {
      throw new HttpsError('permission-denied', 'رمز الرحلة غير صحيح.');
    }

    const { salt, pinHash } = secretSnap.data();
    const submittedHash = hashPin(submitted, salt);

    // مقارنة بزمن ثابت (timing-safe) لمنع هجوم قياس التوقيت لتخمين الهاش حرفاً
    // بحرف — timingSafeEqual يرمي استثناءً إن اختلف طول المخزَّنين، لذا نتحقق
    // من تطابق الطول أولاً كخطوة مستقلة قبل استدعائها.
    const match =
      submittedHash.length === pinHash.length &&
      crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(pinHash));

    if (!match) {
      throw new HttpsError('permission-denied', 'رمز الرحلة غير صحيح.');
    }

    // 🆕 ندمج مع أي رحلات سابقة تحقق منها هذا المستخدم بدل استبدال الـ Custom
    // Claims بالكامل (setCustomUserClaims يستبدل القيمة كلها، لا يدمجها تلقائياً)
    // — هذا يسمح لنفس الشخص بالانضمام لأكثر من رحلة على نفس الحساب/الجهاز.
    const userRecord = await admin.auth().getUser(request.auth.uid);
    const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {};

    const nextClaims = {
      ...userRecord.customClaims,
      trips: { ...existingTrips, [tripId]: true },
    };
    assertClaimsFitTokenLimit(nextClaims);

    await admin.auth().setCustomUserClaims(request.auth.uid, nextClaims);

    // 🆕 بعد كتابة الـ claim لا قبلها: الـ claim هو ما يجعل الانضمام حقيقياً،
    // وهذا فهرس له. والدالة تبتلع أخطاءها عمداً — انظر تعليقها.
    await recordMembership(tripId, userRecord);

    return { success: true };

  }
);

/**
 * 🆕 mergeAnonymousTrips: نقل عضويات الرحلات من جلسة مجهولة سابقة إلى الحساب
 * الدائم الذي سجّل الدخول للتوّ.
 *
 * ── متى تُستدعى ───────────────────────────────────────────────────────────────
 * عند ترقية حساب مجهول إلى دائم، `linkWithPopup` يحتفظ بنفس الـ uid فتبقى كل
 * العضويات والمصاريف صحيحة بلا أي نقل — وهذه هي الحالة الشائعة ولا تمرّ من هنا.
 *
 * لكن إن كان لحساب Google المختار جلسة سابقة (أي أن المستخدم ربط حسابه من جهاز
 * آخر قبلاً — وهو بالضبط سيناريو تعدد الأجهزة) يفشل الربط بـ
 * `auth/credential-already-in-use`، فيسجّل العميل الدخول بالحساب القائم — وعندها
 * **يتغيّر الـ uid** وتُيتَّم عضويات الجلسة المجهولة. هذه الدالة تنقذها.
 *
 * ── لماذا ID token وليس آلية إثبات جديدة ────────────────────────────────────
 * السؤال الأمني الوحيد هنا: كيف نتأكد أن المستدعي كان فعلاً يملك تلك الجلسة
 * المجهولة؟ الجواب جاهز: توكن تلك الجلسة **هو بذاته** الإثبات — موقَّع من
 * Firebase، ولا يمكن تزويره، و`verifyIdToken` يتحقق من التوقيع والصلاحية معاً.
 * فلا حاجة لمستند «دمج معلّق» ولا رمز لمرة واحدة ولا أي حالة إضافية.
 *
 * ⚠️ العميل يلتقط التوكن **قبل** تسجيل الدخول بالحساب الجديد، ويحتفظ به في
 * متغيّر بالذاكرة لثوانٍ فقط. لا يُخزَّن في localStorage ولا في Firestore: تخزينه
 * يحوّله إلى سرٍّ قابل للسرقة بلا أي مقابل.
 *
 * ── ما لا تفعله عمداً ────────────────────────────────────────────────────────
 * ١. لا تنقل `createdByUid` على المصاريف. النتيجة أن المستخدم لا يستطيع تعديل
 *    مصاريفه المسجَّلة بالجلسة القديمة (المسؤول يستطيع). البديل إعادة كتابة
 *    مستندات مالية حيّة بلا نسخة احتياطية — كلفة ومخاطرة لا تستحقهما راحة تعديل.
 * ٢. لا تحذف الحساب المجهول القديم. الحذف يفقد إمكانية التشخيص إن ساء الدمج،
 *    والحسابات المجهولة بلا تكلفة تُذكر.
 */
exports.mergeAnonymousTrips = onCall(
  { region: 'us-central1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    const previousIdToken = request.data && request.data.previousIdToken;
    if (typeof previousIdToken !== 'string' || !previousIdToken) {
      throw new HttpsError('invalid-argument', 'التوكن السابق مفقود.');
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(previousIdToken);
    } catch (err) {
      // توكن منتهٍ أو مزوَّر أو من مشروع آخر — الرفض هو الصواب، ولا نُفصح عن السبب.
      console.warn(`[mergeAnonymousTrips] rejected token for ${request.auth.uid}: ${err.code || err.message}`);
      throw new HttpsError('permission-denied', 'تعذّر التحقق من الجلسة السابقة.');
    }

    // نفس الحساب = الربط نجح دون تغيّر uid، فلا شيء يُنقل. ليست حالة خطأ.
    if (decoded.uid === request.auth.uid) {
      return { merged: 0 };
    }

    const previousTrips = (decoded.trips && typeof decoded.trips === 'object' && !Array.isArray(decoded.trips))
      ? decoded.trips
      : {};

    const userRecord = await admin.auth().getUser(request.auth.uid);
    const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {};

    // ⚠️ العضويات القائمة أولاً في ترتيب الدمج: الحساب الدائم هو المرجع، والجلسة
    // المجهولة تُضيف ولا تُلغي. القيم كلها `true` فالفرق نظري اليوم، لكن الترتيب
    // يبقى صحيحاً إن حملت القيمة يوماً معنى أدق من مجرد العضوية.
    const mergedTrips = { ...previousTrips, ...existingTrips };
    const nextClaims = { ...userRecord.customClaims, trips: mergedTrips };

    // الدمج يجمع مجموعتين، فهو أكثر موضع مرشَّح لتجاوز حدّ حجم الـ claims.
    assertClaimsFitTokenLimit(nextClaims);

    const addedCount = Object.keys(mergedTrips).length - Object.keys(existingTrips).length;
    if (addedCount > 0) {
      await admin.auth().setCustomUserClaims(request.auth.uid, nextClaims);

      // 🆕 الرحلات المنقولة تحتاج سطرها في السجلّ أيضاً، وإلا صار للحساب الدائم
      // وصولٌ لا يظهر في أي قائمة — وهو بالضبط العمى الذي وُجد السجلّ لإنهائه.
      const newlyAdded = Object.keys(mergedTrips).filter(id => !(id in existingTrips));
      await Promise.all(
        newlyAdded.map(id => recordMembership(id, userRecord, { mergedFrom: decoded.uid })),
      );
    }

    // ⚠️ **سطر الجلسة المجهولة يبقى، ولا يُحذف.** الدمج لا يمسح claims الحساب
    // القديم (انظر «ما لا يفعله الدمج» في docs/PLAN-account-linking.md)، فذلك
    // الـ uid ما زال يملك وصولاً فعلياً. حذف سطره يجعل السجلّ يكذب: شخصٌ يدخل
    // ولا يظهر في القائمة. `mergedFrom` على السطر الجديد هو ما يربط الاثنين،
    // فتعرف لوحة الإدارة أنهما شخص واحد بدل أن تعرضهما كعضوين.
    console.log(`[mergeAnonymousTrips] ${decoded.uid} → ${request.auth.uid}: +${addedCount}`);
    return { merged: addedCount };
  }
);

/**
 * 🆕 manageTrip: إنشاء رحلة جديدة أو تغيير رمز رحلة قائمة — للمسؤول حصراً.
 *
 * لماذا دالة خادمية وليست قاعدة Firestore كبقية إعدادات الرحلة؟ لأن هذه العملية
 * تلمس tripSecrets/{tripId} (الملح + هاش الرمز)، وهو المستند الوحيد المحظور
 * قراءةً وكتابةً على العميل تحت أي ظرف — بما في ذلك المسؤول. توليد الملح وحساب
 * الهاش يبقيان خادميين، فلا يصل الرمز الصريح ولا هاشه إلى أي كود يعمل في المتصفح.
 *
 * تفاصيل الرحلة غير السرّية (الاسم/البنك/المسار) لا تمرّ من هنا — تُكتب مباشرة
 * من الواجهة عبر قواعد Firestore (isValidTripConfig)، وهي المسار الأخف والأسرع.
 */
exports.manageTrip = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
  },
  async (request) => {
    // ⚠️ التحقق من صلاحية المسؤول خادميًا من التوكن نفسه — لا نثق بأي علم
    // يرسله العميل. نفس الـ Custom Claim الذي تفحصه isAdmin() في firestore.rules.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول فقط.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const pin = String(request.data?.pin ?? '').trim();
    const name = String(request.data?.name ?? '').trim();
    const mode = String(request.data?.mode ?? '').trim(); // 'create' | 'resetPin' | 'delete'

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError(
        'invalid-argument',
        'معرّف الرحلة غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.'
      );
    }
    if (mode !== 'create' && mode !== 'resetPin' && mode !== 'delete') {
      throw new HttpsError('invalid-argument', 'نوع العملية غير معروف.');
    }

    // الحذف لا يحتاج رمزاً ولا اسماً — نتفادى فرض شروطهما عليه
    if (mode !== 'delete') {
      if (!pin || pin.length > MAX_PIN_INPUT_LENGTH) {
        throw new HttpsError('invalid-argument', 'أدخل رمز الرحلة.');
      }
      if (pin.length < MIN_PIN_LENGTH) {
        throw new HttpsError('invalid-argument', `رمز الرحلة قصير جداً — ${MIN_PIN_LENGTH} خانات على الأقل.`);
      }
      if (name.length > 100) {
        throw new HttpsError('invalid-argument', 'اسم الرحلة طويل جداً (100 حرف كحد أقصى).');
      }
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
      // **مسافرين ومصاريف**، والانضمام بالرمز لا يستلزم إضافة مسافر. فرحلة
      // انضمّ إليها عشرة ولم يسجّل أحدهم مصروفاً تُعدّ فارغة وتُحذف.
      const members = await tripRef.collection('members').get();

      // المستندات معاً في كتابة ذرّية: لا يبقى رمز بلا رحلة ولا العكس
      const deleteBatch = db.batch();
      members.docs.forEach(doc => deleteBatch.delete(doc.ref));
      deleteBatch.delete(tripRef);
      deleteBatch.delete(db.collection('tripSecrets').doc(tripId));
      await deleteBatch.commit();

      console.log(`[manageTrip] delete on ${tripId} by ${request.auth.uid}`);
      return { success: true, tripId };
    }

    // ⚠️ الإنشاء لا يكتب فوق رحلة قائمة أبداً: الكتابة فوقها تستبدل رمزها الحالي
    // فيفقد كل أعضائها الوصول فجأة. هذا بالضبط ما يفعله create-trip.mjs بعد سؤال
    // تأكيد نصي — وهو خطر أكبر من أن يُترك خلف زر في واجهة رسومية.
    if (mode === 'create' && existing.exists) {
      throw new HttpsError('already-exists', `الرحلة "${tripId}" موجودة مسبقاً — اختر معرّفاً آخر.`);
    }
    if (mode === 'resetPin' && !existing.exists) {
      throw new HttpsError('not-found', `الرحلة "${tripId}" غير موجودة.`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = hashPin(pin, salt);

    // مستندان في كتابة ذرّية واحدة: لا رحلة بلا رمز، ولا رمز بلا رحلة.
    const batch = db.batch();
    if (mode === 'create') {
      batch.set(tripRef, {
        name: name || tripId,
        bankDetails: { bankName: '', beneficiary: '', iban: '' },
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
      });
    }
    batch.set(db.collection('tripSecrets').doc(tripId), { salt, pinHash });
    await batch.commit();

    console.log(`[manageTrip] ${mode} on ${tripId} by ${request.auth.uid}`);

    return { success: true, tripId };
  }
);
/**
 * 🆕 manageMember: إزالة عضو من رحلة واحدة.
 *
 * **لماذا دالة خادمية ولا يمكن أن تكون قاعدة؟** العضوية تعيش في custom claims
 * حساب العضو المستهدَف، وتعديل claims حساب آخر يوجب Admin SDK. لا سبيل لفعله
 * من العميل تحت أي قاعدة.
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
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'هذا الإجراء متاح للمسؤول فقط.');
    }

    const tripId = String(request.data?.tripId ?? '').trim();
    const uid = String(request.data?.uid ?? '').trim();
    const mode = String(request.data?.mode ?? '').trim(); // 'remove'

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.');
    }
    if (!uid || uid.length > 128) {
      throw new HttpsError('invalid-argument', 'معرّف المستخدم غير صالح.');
    }
    if (mode !== 'remove') {
      throw new HttpsError('invalid-argument', 'نوع العملية غير معروف.');
    }

    let userRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch {
      // الحساب محذوف من Auth لكن سطره باقٍ في السجلّ — ننظّف السطر ولا نفشل.
      await db.collection('trips').doc(tripId).collection('members').doc(uid).delete();
      return { success: true, uid, tripId, claimRemoved: false, stillHasAccess: false };
    }

    const existingClaims = userRecord.customClaims || {};
    const existingTrips = existingClaims.trips || {};

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
    await db.collection('trips').doc(tripId).collection('members').doc(uid).delete();

    // ⚠️ المسؤول لا يستمد وصوله من عضوية الرحلة بل من claim عالمي (admin: true)،
    // فإزالته من الرحلة لا تحجب عنه شيئاً. نُبلغ العميل بذلك بدل إيهام المسؤول
    // بأن الإجراء فعل ما لم يفعله.
    const stillHasAccess = existingClaims.admin === true;

    console.log(`[manageMember] remove ${uid} from ${tripId} by ${request.auth.uid} (wasMember=${wasMember})`);
    return { success: true, uid, tripId, claimRemoved: wasMember, stillHasAccess };
  }
);
