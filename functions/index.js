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

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()

const MAX_PIN_INPUT_LENGTH = 128

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts —
// إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً، لمنع tripId
// من أن يتحول لمسار Firestore خبيث أو معرّف غير متوقع.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(salt + pin).digest('hex')
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
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.')
    }

    const tripId = String(request.data?.tripId ?? '').trim()
    const submitted = String(request.data?.pin ?? '').trim()

    if (!tripId || !TRIP_ID_PATTERN.test(tripId)) {
      throw new HttpsError('invalid-argument', 'معرّف الرحلة غير صالح.')
    }

    if (!submitted || submitted.length > MAX_PIN_INPUT_LENGTH) {
      throw new HttpsError('invalid-argument', 'أدخل رمز الرحلة.')
    }

    const secretSnap = await admin.firestore().collection('tripSecrets').doc(tripId).get()

    // ⚠️ نفس رسالة الخطأ سواء كانت الرحلة غير موجودة أصلاً أو كان الرمز خاطئاً
    // فقط — لمنع أي تسريب معلومات لمن يحاول تخمين معرّفات رحلات عشوائية عبر ?trip=
    if (!secretSnap.exists) {
      throw new HttpsError('permission-denied', 'رمز الرحلة غير صحيح.')
    }

    const { salt, pinHash } = secretSnap.data()
    const submittedHash = hashPin(submitted, salt)

    // مقارنة بزمن ثابت (timing-safe) لمنع هجوم قياس التوقيت لتخمين الهاش حرفاً
    // بحرف — timingSafeEqual يرمي استثناءً إن اختلف طول المخزَّنين، لذا نتحقق
    // من تطابق الطول أولاً كخطوة مستقلة قبل استدعائها.
    const match =
      submittedHash.length === pinHash.length &&
      crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(pinHash))

    if (!match) {
      throw new HttpsError('permission-denied', 'رمز الرحلة غير صحيح.')
    }

    // 🆕 ندمج مع أي رحلات سابقة تحقق منها هذا المستخدم بدل استبدال الـ Custom
    // Claims بالكامل (setCustomUserClaims يستبدل القيمة كلها، لا يدمجها تلقائياً)
    // — هذا يسمح لنفس الشخص بالانضمام لأكثر من رحلة على نفس الحساب/الجهاز.
    const userRecord = await admin.auth().getUser(request.auth.uid)
    const existingTrips = (userRecord.customClaims && userRecord.customClaims.trips) || {}

    await admin.auth().setCustomUserClaims(request.auth.uid, {
      ...userRecord.customClaims,
      trips: { ...existingTrips, [tripId]: true },
    })

    return { success: true }
  }
)
