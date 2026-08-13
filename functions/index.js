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

    await admin.auth().setCustomUserClaims(request.auth.uid, {
      ...userRecord.customClaims,
      trips: { ...existingTrips, [tripId]: true },
    });

    return { success: true };
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

      // المستندان معاً في كتابة ذرّية: لا يبقى رمز بلا رحلة ولا العكس
      const deleteBatch = db.batch();
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