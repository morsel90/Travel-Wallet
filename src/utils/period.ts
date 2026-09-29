// حساب الشهر المحاسبي — دوال نقية. الشهر نص `YYYY-MM` لا `Date`: يطابق بادئة
// `Expense.date` النصية، وترتيبه المعجمي هو الزمني.
//
// ⚠️ لا `Date` في أي مقارنة: `new Date('2026-08')` تُفسَّر UTC فتصير في الرياض
// ٣١ يوليو. تُستعمل فقط لشهر «الآن» ولعدد أيام الشهر.
//
// 🆕 **يوم بداية الشهر (`startDay`) لكل رحلة.** الافتراضي 1 = الشهر التقويمي،
// وكل دالة هنا تعطي به نفس نتيجتها السابقة حرفياً. بغيره يبدأ الشهر من ذلك
// اليوم في الشهر السابق: بيوم 27 يمتد «أكتوبر» من 27 سبتمبر إلى 26 أكتوبر —
// من الراتب إلى الراتب. **الشهر يُسمّى باسم الشهر الذي ينتهي فيه.**
// السقف 28 لأن فبراير لا يعرف يوماً بعده.
import type { Expense, PeriodKey } from '../types'

/** `YYYY-MM` بشهر ضمن 01..12 — أي شيء آخر ليس مفتاح شهر. */
const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

// لا Intl عمداً: مخرجاتها تتغيّر مع إصدار ICU فتهشّ الاختبارات.
const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

export function isValidPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === 'string' && PERIOD_KEY_PATTERN.test(value)
}

/** أول يوم يمكن أن يبدأ به الشهر وآخره — انظر رأس الملف. */
export const MIN_CYCLE_START_DAY = 1
export const MAX_CYCLE_START_DAY = 28

/** `cycleStartDay` من Firestore. أي قيمة غير صالحة = 1، أي الشهر التقويمي. */
export function normalizeCycleStartDay(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= MIN_CYCLE_START_DAY && value <= MAX_CYCLE_START_DAY
    ? value
    : MIN_CYCLE_START_DAY
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * الشهر الذي يقع فيه تاريخ `YYYY-MM-DD`، أو null لتاريخ لا بادئة شهر صالحة له.
 * ⚠️ بـ startDay = 1 مطابقة بادئة خالصة كما كانت، فيوم تالف لا يُسقط المصروف.
 */
export function periodForDate(date: unknown, startDay = 1): PeriodKey | null {
  if (typeof date !== 'string') return null
  const month = date.slice(0, 7)
  if (!isValidPeriodKey(month)) return null
  if (startDay <= 1) return month
  const day = Number(date.slice(8, 10))
  return Number.isFinite(day) && day >= startDay ? nextPeriod(month) : month
}

/** `currentPeriod` من Firestore. الغياب = الشهر الحالي (رحلة حُوِّلت للتو إلى long_term). */
export function normalizePeriodKey(value: unknown, now: Date = new Date(), startDay = 1): PeriodKey {
  return isValidPeriodKey(value) ? value : currentPeriodKey(now, startDay)
}

/** شهر «الآن» بتوقيت الجهاز. ⚠️ لا UTC: أول ساعات الشهر في الرياض ستُحسب على السابق. */
export function currentPeriodKey(now: Date = new Date(), startDay = 1): PeriodKey {
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  return periodForDate(today, startDay) ?? today.slice(0, 7)
}

/**
 * يزيح مفتاح الشهر بعدد أشهر (موجب أو سالب) بحساب صحيح خالص — بلا `Date`.
 * مفتاح غير صالح يُعاد كما هو: لا نخترع شهراً من قيمة لا نفهمها.
 */
export function shiftPeriod(key: PeriodKey, months: number): PeriodKey {
  if (!isValidPeriodKey(key) || !Number.isFinite(months)) return key
  const year  = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  // فهرس شهري مطلق — يعبر حدود السنة بلا فرع خاص لديسمبر/يناير.
  const absolute = year * 12 + (month - 1) + Math.trunc(months)
  const newYear  = Math.floor(absolute / 12)
  const newMonth = absolute - newYear * 12 + 1
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`
}

export const nextPeriod     = (key: PeriodKey): PeriodKey => shiftPeriod(key, 1)
export const previousPeriod = (key: PeriodKey): PeriodKey => shiftPeriod(key, -1)

/** أول يوم في الشهر بصيغة `Expense.date` — تاريخ حركات *افتتاح* الشهر الجديد. */
export function periodStartDate(key: PeriodKey, startDay = 1): string {
  return startDay <= 1 ? `${key}-01` : `${previousPeriod(key)}-${pad2(startDay)}`
}

/**
 * آخر يوم في الشهر — تاريخ حركات *إغلاق* الشهر. `new Date(y, m, 0)` = اليوم صفر
 * من الشهر التالي (تتكفّل بالكبيسة)، وهو عدّ أيام لا مقارنة.
 */
export function periodEndDate(key: PeriodKey, startDay = 1): string {
  if (startDay > 1) return `${key}-${pad2(startDay - 1)}`
  const year  = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const days  = new Date(year, month, 0).getDate()
  return `${key}-${String(days).padStart(2, '0')}`
}

/** تاريخ تالف = خارج أي شهر، لا استثناء (مسار يعمل على كل عرض). */
export function isInPeriod(expenseDate: unknown, key: PeriodKey, startDay = 1): boolean {
  return periodForDate(expenseDate, startDay) === key
}

/** «أغسطس 2026» — للعرض فقط. مفتاح غير صالح يُعاد كما هو بلا تجميل. */
export function formatPeriodLabel(key: PeriodKey): string {
  if (!isValidPeriodKey(key)) return String(key)
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/**
 * كل الشهور من أول مصروف حتى الشهر المفتوح، تصاعدياً. بلا مصاريف → [currentPeriod].
 *
 * ⚠️ متسلسلة بلا فجوات عمداً: شهر بلا مصروف لا يختفي فيُظنّ أن الرحلة توقّفت.
 */
export function listPeriods(
  expenses: Pick<Expense, 'date'>[],
  currentPeriod: PeriodKey,
  startDay = 1,
): PeriodKey[] {
  if (!isValidPeriodKey(currentPeriod)) return []

  let earliest = currentPeriod
  for (const e of expenses) {
    const key = periodForDate(e.date, startDay)
    if (key !== null && key < earliest) earliest = key
  }

  // سقف احترازي ضد تاريخ فاسد بسنة بعيدة (القاعدة ١٩).
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
