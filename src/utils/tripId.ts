// ─── تحديد الرحلة النشطة (دعم رحلات متعددة) ──────────────────────────────────
// 🆕 كل رحلة لها معرّف (tripId) مستقل يُحدَّد عبر معامل ?trip=xyz في رابط
// التطبيق — أُختير هذا الأسلوب (بدل subdomain أو مسار في الرابط) لأنه لا يتطلب
// أي تغيير DNS أو إعدادات استضافة، ويكفي مشاركة رابط مختلف لكل رحلة فوراً.
// هذا المعرّف يُستخدم حرفياً كجزء من مسار مستندات Firestore (انظر firestore.ts)
// وكمعرّف مستند في مجموعة trips/ — لذلك يُتحقق من صيغته بصرامة قبل استخدامه
// (نفس الفحص بالضبط مكرّر خادميًا في functions/index.js).

// 🆕 الرحلة الافتراضية عند عدم تمرير ?trip= — هي نفس معرّف مشروع Firebase
// الحالي (travelapp-87206)، حتى يستمر عمل الرابط الحالي (بدون أي معامل) دون
// أي انقطاع لمن يستخدم التطبيق فعلياً اليوم.
const DEFAULT_TRIP_ID = 'travelapp-87206'

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في functions/index.js —
// إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً. هذا يمنع
// tripId من التحول لمسار Firestore خبيث (تضمين / أو .. للهروب من المسار
// المقصود) أو حقن مسافات/رموز خاصة عبر الرابط.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

/**
 * 🆕 يتحقق من صيغة معرّف رحلة قبل إرساله لدالة manageTrip — لعرض رسالة فورية
 * في نموذج «رحلة جديدة» بدل انتظار رفض الخادم. الخادم يعيد نفس الفحص بنفسه
 * (functions/index.js) ولا يعتمد على هذا إطلاقاً؛ هذه راحة واجهة لا حماية.
 */
export function isValidTripId(candidate: string): boolean {
  return TRIP_ID_PATTERN.test(candidate.trim())
}

/** رابط فتح رحلة بمعرّفها — التبديل يتطلب إعادة تحميل كاملة (انظر أدناه). */
export function tripUrl(tripId: string): string {
  return `${window.location.origin}${window.location.pathname}?trip=${encodeURIComponent(tripId)}`
}

function readTripIdFromLocation(): string {
  const fromQuery = readExplicitTripId()
  return fromQuery ?? DEFAULT_TRIP_ID
}

/**
 * 🆕 معرّف الرحلة المذكور *صراحةً* في الرابط، أو null إن فُتح التطبيق بلا `?trip=`.
 *
 * التمييز مهم لشاشة «رحلاتي» (TripPicker): من يفتح رابط رحلة بعينه يقصدها هو
 * تحديداً، فيُعرض له طلب رمزها مباشرةً؛ أما من يفتح التطبيق مجرّداً فلا رحلة
 * مقصودة لديه، والأنسب عرض رحلاته المنضم لها بدل مطالبته برمز الرحلة
 * الافتراضية التي قد لا تعنيه إطلاقاً.
 */
function readExplicitTripId(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('trip')?.trim()
    if (fromQuery && TRIP_ID_PATTERN.test(fromQuery)) return fromQuery
  } catch {
    // بيئة بدون window (مثل اختبارات Vitest) — تجاهل والرجوع للرحلة الافتراضية
  }
  return null
}

// 🆕 يُحسب مرة واحدة عند تحميل التطبيق (وقت تحميل الوحدة/module) — تبديل
// الرحلة يتطلب فتح رابط جديد بمعامل ?trip= مختلف وإعادة تحميل كاملة للصفحة؛
// لا يوجد تبديل حي بين الرحلات داخل نفس الجلسة دون إعادة تحميل.
export const TRIP_ID: string = readTripIdFromLocation()

/**
 * 🆕 هل ذُكرت الرحلة صراحةً في الرابط؟ يُحسب مرة واحدة عند تحميل الوحدة تماماً
 * كـ TRIP_ID أعلاه (ومن نفس المصدر) حتى لا يختلفا أبداً.
 *
 * false تعني أن TRIP_ID أعلاه هو الرحلة الافتراضية لا اختيار المستخدم — وهذه
 * الحالة بالضبط هي التي تعرض شاشة «رحلاتي» بدل بوابة الرمز (انظر App.tsx).
 */
export const HAS_EXPLICIT_TRIP_ID: boolean = readExplicitTripId() !== null

// ─── 🆕 رابط دعوة بنقرة واحدة (?invite=TOKEN) ────────────────────────────────
// طريقة الانضمام الوحيدة لرحلة بعد إلغاء رمز الرحلة اليدوي (docs/DECISIONS.md):
// رابط يحمل توكناً عشوائياً بدل tripId صريح، يُستبدَل بعضوية فعلية عبر
// joinViaInvite (functions/index.js) بعد تسجيل دخول حقيقي (AuthGate). يُقرأ
// مرة واحدة عند تحميل الوحدة كـ TRIP_ID أعلاه بالضبط.

// ⚠️ يجب أن يطابق INVITE_TOKEN_PATTERN في functions/index.js تماماً — التوكن
// الفعلي المولَّد 32 حرفاً (base64url لـ24 بايت)، والحدّ الأعلى هنا أوسع قليلاً
// (64) كهامش تحقّق لا كطول متوقَّع، على غرار TRIP_ID_PATTERN أعلاه.
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

function readInviteToken(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get('invite')?.trim()
    if (token && INVITE_TOKEN_PATTERN.test(token)) return token
  } catch {
    // بيئة بدون window (مثل اختبارات Vitest) — تجاهل، لا رابط دعوة
  }
  return null
}

/** توكن الدعوة المذكور صراحةً في الرابط، أو null إن لم يُفتح التطبيق برابط دعوة. */
export const INVITE_TOKEN: string | null = readInviteToken()
