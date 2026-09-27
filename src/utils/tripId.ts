// ─── تحديد الرحلة النشطة (?trip=xyz) ─────────────────────────────────────────
// المعرّف يدخل حرفياً في مسارات Firestore، فيُتحقق من صيغته بصرامة.

// ⚠️ معرّف رحلة لا مشروع (يصادف أنه يطابق معرّف المشروع). تغييره يكسر الروابط القائمة.
const DEFAULT_TRIP_ID = 'travelapp-87206'

// ⚠️ يطابق TRIP_ID_PATTERN في functions/index.js حرفياً. يمنع / و.. من الهروب من المسار.
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

/** رسالة فورية في نموذج «رحلة جديدة» — راحة واجهة لا حماية؛ الخادم يعيد الفحص. */
export function isValidTripId(candidate: string): boolean {
  return TRIP_ID_PATTERN.test(candidate.trim())
}

// معرّف مقترح من اسم الرحلة بأي لغة (حرفنة تقريبية للقراءة فقط). اللاحقة
// العشوائية تمنع اصطدامه برحلة شخص آخر لا يراها في «رحلاتي».
const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
  'ة': 'a', 'ؤ': 'o', 'ئ': 'e', 'ء': '',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

/** لاحقة عشوائية من 4 أحرف [a-z0-9] — تُولَّد مرة واحدة لكل نموذج. */
export function randomTripSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * يحوّل اسم رحلة (عربي/إنجليزي/مختلط) إلى معرّف صالح لـ isValidTripId دائماً:
 * «رحلة الرياض ٢٠٢٧» + «k3f9» ← «rhla-alryad-2027-k3f9». اسم بلا أي حرف قابل
 * للتحويل (فارغ، رموز فقط) ← «trip-k3f9».
 */
export function suggestTripId(name: string, suffix: string): string {
  // التشكيل والتطويل (ـ) يُحذفان قبل الحرفنة، وإلا صار كل منها شرطة: «r-h-l-a».
  const slug = Array.from(name.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, ''))
    .map(ch => ARABIC_TO_LATIN[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `${slug || 'trip'}-${suffix}`
}

/** رابط فتح رحلة بمعرّفها — التبديل يتطلب إعادة تحميل كاملة (انظر أدناه). */
export function tripUrl(tripId: string): string {
  return `${window.location.origin}${window.location.pathname}?trip=${encodeURIComponent(tripId)}`
}

/** رابط التطبيق بلا `?trip=` — يهبط على «رحلاتي» بعد حذف الرحلة المفتوحة. */
export function appHomeUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function readTripIdFromLocation(): string {
  const fromQuery = readExplicitTripId()
  return fromQuery ?? DEFAULT_TRIP_ID
}

/** معرّف الرحلة المذكور صراحةً في الرابط، أو null — بلا رحلة مقصودة تُعرض «رحلاتي». */
function readExplicitTripId(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('trip')?.trim()
    if (fromQuery && TRIP_ID_PATTERN.test(fromQuery)) return fromQuery
  } catch {
    // بيئة بدون window (مثل اختبارات Vitest) — تجاهل والرجوع للرحلة الافتراضية
  }
  return null
}

// ⚠️ يُحسب مرة واحدة عند تحميل الوحدة — تبديل الرحلة يتطلب إعادة تحميل كاملة.
export const TRIP_ID: string = readTripIdFromLocation()

/** false = TRIP_ID هو الافتراضي لا اختيار المستخدم، فتُعرض «رحلاتي». من المصدر نفسه لـ TRIP_ID. */
export const HAS_EXPLICIT_TRIP_ID: boolean = readExplicitTripId() !== null

// ─── رابط دعوة (?invite=TOKEN) — طريقة الانضمام الوحيدة، عبر joinViaInvite ──

// ⚠️ يطابق INVITE_TOKEN_PATTERN في functions/index.js. التوكن الفعلي 32 حرفاً؛ 64 هامش.
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
