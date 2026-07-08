// ─── تحديد الرحلة النشطة (دعم رحلات متعددة) ──────────────────────────────────
// 🆕 كل رحلة لها معرّف (tripId) مستقل يُحدَّد عبر معامل ?trip=xyz في رابط
// التطبيق — أُختير هذا الأسلوب (بدل subdomain أو مسار في الرابط) لأنه لا يتطلب
// أي تغيير DNS أو إعدادات استضافة، ويكفي مشاركة رابط مختلف لكل رحلة فوراً.
// هذا المعرّف يُستخدم حرفياً كجزء من مسار مستندات Firestore (انظر firestore.ts)
// وكمعرّف مستند في مجموعتي trips/ وtripSecrets/ — لذلك يُتحقق من صيغته بصرامة
// قبل استخدامه (نفس الفحص بالضبط مكرّر خادميًا في functions/index.js).

// 🆕 الرحلة الافتراضية عند عدم تمرير ?trip= — هي نفس معرّف مشروع Firebase
// الحالي (travelapp-87206)، حتى يستمر عمل الرابط الحالي (بدون أي معامل) دون
// أي انقطاع لمن يستخدم التطبيق فعلياً اليوم.
const DEFAULT_TRIP_ID = 'travelapp-87206'

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في functions/index.js —
// إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً. هذا يمنع
// tripId من التحول لمسار Firestore خبيث (تضمين / أو .. للهروب من المسار
// المقصود) أو حقن مسافات/رموز خاصة عبر الرابط.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function readTripIdFromLocation(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('trip')?.trim()
    if (fromQuery && TRIP_ID_PATTERN.test(fromQuery)) return fromQuery
  } catch {
    // بيئة بدون window (مثل اختبارات Vitest) — تجاهل والرجوع للرحلة الافتراضية
  }
  return DEFAULT_TRIP_ID
}

// 🆕 يُحسب مرة واحدة عند تحميل التطبيق (وقت تحميل الوحدة/module) — تبديل
// الرحلة يتطلب فتح رابط جديد بمعامل ?trip= مختلف وإعادة تحميل كاملة للصفحة؛
// لا يوجد تبديل حي بين الرحلات داخل نفس الجلسة دون إعادة تحميل.
export const TRIP_ID: string = readTripIdFromLocation()
