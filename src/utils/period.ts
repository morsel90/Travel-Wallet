// حساب الشهر المحاسبي — دوال نقية. الشهر نص `YYYY-MM` لا `Date`: يطابق بادئة
// `Expense.date` النصية، وترتيبه المعجمي هو الزمني.
//
// ⚠️ لا `Date` في أي مقارنة: `new Date('2026-08')` تُفسَّر UTC فتصير في الرياض
// ٣١ يوليو. تُستعمل فقط لشهر «الآن» ولعدد أيام الشهر.
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

/** `currentPeriod` من Firestore. الغياب = الشهر الحالي (رحلة حُوِّلت للتو إلى long_term). */
export function normalizePeriodKey(value: unknown, now: Date = new Date()): PeriodKey {
  return isValidPeriodKey(value) ? value : currentPeriodKey(now)
}

/** شهر «الآن» بتوقيت الجهاز. ⚠️ لا UTC: أول ساعات الشهر في الرياض ستُحسب على السابق. */
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
  // فهرس شهري مطلق — يعبر حدود السنة بلا فرع خاص لديسمبر/يناير.
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
 * آخر يوم في الشهر — تاريخ حركات *إغلاق* الشهر. `new Date(y, m, 0)` = اليوم صفر
 * من الشهر التالي (تتكفّل بالكبيسة)، وهو عدّ أيام لا مقارنة.
 */
export function periodEndDate(key: PeriodKey): string {
  const year  = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const days  = new Date(year, month, 0).getDate()
  return `${key}-${String(days).padStart(2, '0')}`
}

/** مطابقة بادئة نصية. تاريخ تالف = خارج أي شهر، لا استثناء (مسار يعمل على كل عرض). */
export function isInPeriod(expenseDate: unknown, key: PeriodKey): boolean {
  return typeof expenseDate === 'string' && expenseDate.slice(0, 7) === key
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
export function listPeriods(expenses: Pick<Expense, 'date'>[], currentPeriod: PeriodKey): PeriodKey[] {
  if (!isValidPeriodKey(currentPeriod)) return []

  let earliest = currentPeriod
  for (const e of expenses) {
    const key = typeof e.date === 'string' ? e.date.slice(0, 7) : ''
    if (isValidPeriodKey(key) && key < earliest) earliest = key
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
