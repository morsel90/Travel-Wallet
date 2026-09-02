// 🆕 حساب الشهر المحاسبي — دوال نقية بلا React ولا Firestore ولا Intl.
//
// الشهر هنا **نص `YYYY-MM` لا كائن `Date`**، وهذا قرار لا تفصيلاً:
//
//   • `Expense.date` مخزَّن أصلاً كـ `YYYY-MM-DD` (نص، لا Timestamp) منذ أول
//     يوم في هذا التطبيق. مقارنة الشهر تصير مطابقة بادئة نصية — بلا أي تحويل
//     منطقة زمنية، وبلا أي احتمال أن يقع مصروف سُجّل في ٣١ يوليو ٢٣:٠٠ بتوقيت
//     الرياض في شهر يونيو لأن الخادم بـ UTC.
//   • الترتيب المعجمي للنص `YYYY-MM` هو نفسه الترتيب الزمني — فلا حاجة لأي
//     دالة مقارنة خاصة، لا هنا ولا في استعلامات Firestore.
//
// ⚠️ ولهذا السبب بالذات **لا تُستخدم `Date` في المقارنات أدناه إطلاقاً**، فقط
// في اشتقاق شهر «الآن» وفي عدد أيام الشهر. أي إعادة كتابة تُدخل `new Date(key)`
// في مسار المقارنة تُعيد فخّ المنطقة الزمنية الذي وُجد هذا الملف لتفاديه:
// `new Date('2026-08')` تُفسَّر UTC، فتصير في الرياض ٢٠٢٦-٠٧-٣١ ٠٣:٠٠.
import type { Expense, PeriodKey } from '../types'

/** `YYYY-MM` بشهر ضمن 01..12 — أي شيء آخر ليس مفتاح شهر. */
const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

// أسماء ثابتة لا `Intl.DateTimeFormat` عمداً: مخرجات Intl تتغيّر بتغيّر إصدار
// ICU في المتصفح/Node، فيصير اختبار وحدة يقارن نصاً هشّاً بلا سبب. وبقية
// التطبيق تستخدم Intl لعرض التواريخ الكاملة — هذه مجرد تسمية شهر.
const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

export function isValidPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === 'string' && PERIOD_KEY_PATTERN.test(value)
}

/**
 * يحوّل قيمة `currentPeriod` القادمة من Firestore إلى مفتاح شهر صالح.
 *
 * ⚠️ الغياب يُعامَل كالشهر الميلادي الحالي — نفس مبدأ normalizeTripStatus/
 * normalizeTripType: رحلة حُوِّلت للتو إلى long_term لا تملك الحقل بعد، ويجب
 * أن تبدأ من الشهر الجاري لا أن تتعطّل واجهتها.
 */
export function normalizePeriodKey(value: unknown, now: Date = new Date()): PeriodKey {
  return isValidPeriodKey(value) ? value : currentPeriodKey(now)
}

/**
 * شهر «الآن» **بالتوقيت المحلي للجهاز** لا UTC.
 *
 * ⚠️ مقصود: المنظّم يغلق «شهر أغسطس» بالمعنى الذي يراه في تقويمه هو. استخدام
 * UTC هنا كان سيجعل أول ساعات الشهر في الرياض (UTC+3) تُحسب على الشهر السابق.
 */
export function currentPeriodKey(now: Date = new Date()): PeriodKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * يزيح مفتاح الشهر بعدد أشهر (موجب أو سالب) بحساب صحيح خالص — بلا `Date`.
 * مفتاح غير صالح يُعاد كما هو: لا نخترع شهراً من قيمة لا نفهمها.
 */
export function shiftPeriod(key: PeriodKey, months: number): PeriodKey {
  if (!isValidPeriodKey(key) || !Number.isFinite(months)) return key
  const year  = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  // فهرس شهري مطلق (0-based) — الحساب عليه يجعل تجاوز حدود السنة تلقائياً،
  // بلا أي فرع خاص لديسمبر/يناير (وهو مصدر أخطاء «الشهر ١٣» الكلاسيكي).
  const absolute = year * 12 + (month - 1) + Math.trunc(months)
  const newYear  = Math.floor(absolute / 12)
  const newMonth = absolute - newYear * 12 + 1
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`
}

export const nextPeriod     = (key: PeriodKey): PeriodKey => shiftPeriod(key, 1)
export const previousPeriod = (key: PeriodKey): PeriodKey => shiftPeriod(key, -1)

/** أول يوم في الشهر بصيغة `Expense.date` — تاريخ حركات *افتتاح* الشهر الجديد. */
export function periodStartDate(key: PeriodKey): string {
  return `${key}-01`
}

/**
 * آخر يوم في الشهر بصيغة `Expense.date` — تاريخ حركات *إغلاق* الشهر المنتهي.
 * `new Date(y, m, 0)` تعني «اليوم صفر من الشهر التالي» أي آخر يوم في هذا الشهر،
 * وتتكفّل بالسنة الكبيسة وحدها. استخدام Date هنا حسابيّ بحت (عدد الأيام) ولا
 * يمسّ أي مقارنة، فلا يقع في فخّ المنطقة الزمنية الموصوف أعلى الملف.
 */
export function periodEndDate(key: PeriodKey): string {
  const year  = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const days  = new Date(year, month, 0).getDate()
  return `${key}-${String(days).padStart(2, '0')}`
}

/**
 * هل يقع تاريخ مصروف داخل هذا الشهر؟ — مطابقة بادئة نصية، لا تحويل تاريخ.
 * تاريخ تالف أو مفقود (مصاريف قديمة/مستندات فاسدة) يُعتبر خارج أي شهر بدل أن
 * يُرمى استثناء في مسار قراءة يعمل على كل مصروف في كل عرض (نفس مبدأ splitEven).
 */
export function isInPeriod(expenseDate: unknown, key: PeriodKey): boolean {
  return typeof expenseDate === 'string' && expenseDate.slice(0, 7) === key
}

/** «أغسطس 2026» — للعرض فقط. مفتاح غير صالح يُعاد كما هو بلا تجميل. */
export function formatPeriodLabel(key: PeriodKey): string {
  if (!isValidPeriodKey(key)) return String(key)
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/**
 * كل الشهور من أول مصروف حتى الشهر المفتوح حالياً، تصاعدياً — لمُصفّي الفترة
 * في التقارير/كشوف الحساب.
 *
 * ⚠️ **متسلسلة بلا فجوات عمداً**: لا تُبنى من التواريخ الفعلية للمصاريف وحدها
 * (شهر بلا أي مصروف كان سيختفي من القائمة، فيظنّ من يراها أن الرحلة توقّفت
 * فيه لا أنه ببساطة شهر هادئ). تُبنى بالمشي من أول شهر ظهر فيه نشاط حتى
 * currentPeriod عبر nextPeriod، فيظهر كل شهر بينهما ولو بلا مصروف واحد.
 *
 * لا مصاريف بعد → [currentPeriod] وحده (لا قائمة فارغة: الشهر المفتوح موجود
 * دوماً بمجرد أن تصير الرحلة طويلة المدى، حتى بلا أي نشاط فيه).
 */
export function listPeriods(expenses: Pick<Expense, 'date'>[], currentPeriod: PeriodKey): PeriodKey[] {
  if (!isValidPeriodKey(currentPeriod)) return []

  let earliest = currentPeriod
  for (const e of expenses) {
    const key = typeof e.date === 'string' ? e.date.slice(0, 7) : ''
    if (isValidPeriodKey(key) && key < earliest) earliest = key
  }

  // سقف احترازي — رحلة حقيقية لا تمتد آلاف الأشهر؛ يمنع حلقة لا تنتهي عملياً
  // لو حمل مصروف فاسد تاريخاً بسنة بعيدة جداً (القاعدة ١٩: بيانات تالفة لا
  // تُسقط مساراً يعمل على كل عرض).
  const MAX_PERIODS = 600
  const periods: PeriodKey[] = []
  let cursor = earliest
  while (cursor <= currentPeriod && periods.length < MAX_PERIODS) {
    periods.push(cursor)
    if (cursor === currentPeriod) break
    cursor = nextPeriod(cursor)
  }
  return periods
}
