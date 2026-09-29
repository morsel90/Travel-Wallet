// منطق الرحلات طويلة المدى — دوال نقية.
//
// ⚠️ معاينة وتفسير لا تنفيذ: closeMonth وexitTraveler (functions/index.js)
// يعيدان الحساب على بيانات الخادم ولا يستلمان خطة من هنا. الاعتماد على هذا
// الملف كحارس ثغرة؛ اختلافه عن الخادم مجرّد معاينة خاطئة.
import type { TravelerBalance, RolloverMovement, TripType, Expense, PeriodKey } from '../types'
import { isInPeriod, periodStartDate, periodEndDate, nextPeriod, previousPeriod } from './period'

/** هللة واحدة. ⚠️ يطابق عتبة calculateSettlements: «مسوّى» هناك = «مسوّى» عند الإغلاق والخروج. */
export const ROLLOVER_EPSILON = 0.01

/** فئة المصاريف التي يكتبها closeMonth. ليست في EXPENSE_CATEGORIES عمداً — لا يختارها إنسان. */
export const ROLLOVER_CATEGORY = 'تسوية شهرية'

/** اتجاه رصيد واحد عند الإغلاق — منطق واحد يشترك فيه الترحيل والخروج. */
export function settlementDirection(remaining: number): RolloverMovement['direction'] {
  // غير المنتهي يُعامَل كمسوّى (القاعدة ١٩): رصيد لا يُقرأ لا تُبنى عليه حركة مالية.
  if (!Number.isFinite(remaining) || Math.abs(remaining) <= ROLLOVER_EPSILON) return 'settled'
  return remaining > 0 ? 'credit' : 'debt'
}

/**
 * معاينة ترحيل الشهر: حركة لكل مسافر نشط.
 *
 * ⚠️ `remaining` التراكمي صحيح لا سهو: الإغلاق يصفّر ثم يعيد الفتح بالقيمة نفسها،
 * فالتراكمي *هو* رصيد الشهر الجاري.
 */
export function planRollover(balances: TravelerBalance[]): RolloverMovement[] {
  return balances.map(b => ({
    travelerId:   b.id,
    travelerName: b.name,
    remaining:    Number.isFinite(b.remaining) ? b.remaining : 0,
    direction:    settlementDirection(b.remaining),
  }))
}

/** عدد الحركات التي ستُكتب فعلاً — من رصيده صفر لا يُكتب له شيء. */
export function countRolloverMovements(movements: RolloverMovement[]): number {
  return movements.filter(m => m.direction !== 'settled').length
}

/**
 * مصاريف شهر واحد الحقيقية — بلا مصاريف الترحيل (محاسبة إغلاق لا إنفاق، وعدّها
 * يضاعف المبلغ).
 *
 * ⚠️ المصدر الوحيد لـ«الدورة الحالية» في الهيدر و«الشهر المحاسبي».
 */
export function filterCycleExpenses<T extends Pick<Expense, 'date' | 'category'>>(
  expenses: T[],
  period: PeriodKey,
  startDay = 1,
): T[] {
  return expenses.filter(e => e.category !== ROLLOVER_CATEGORY && isInPeriod(e.date, period, startDay))
}

/**
 * محفظة الدورة = المتبقي التراكمي + مصاريف الدورة. مشتقّة جبرياً لأن الإيداعات
 * غير مؤرَّخة في المخطط، والطرح يعيد «المتبقي» نفسه دائماً.
 */
export function calculateCycleWallet(cumulativeRemaining: number, cycleSpent: number): number {
  return cumulativeRemaining + cycleSpent
}

/**
 * رصيد مسافر عند حدّ إغلاق بين شهرين — يُقرأ من مصروف الترحيل الذي كتبه
 * closeMonth (deposited غير مؤرَّخ فلا يُعاد البناء منه):
 *   • دائن أُغلق به `before` → بتاريخ periodEndDate(before).
 *   • عجز افتُتح به `after` → بتاريخ periodStartDate(after).
 *
 * @returns +المبلغ (دائن أُغلق)، −المبلغ (عجز افتُتح)، أو null إن لم يُعثر
 *          على أثر إغلاق بين الفترتين لهذا المسافر (لم يُغلق `before` بعد،
 *          أو كان رصيده مسوّى صفراً عند الإغلاق فلم يُكتب له مصروف أصلاً).
 */
export function boundaryRolloverAmount(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  before: PeriodKey,
  after: PeriodKey,
  startDay = 1,
): number | null {
  const isOwnRollover = (e: typeof expenses[number]): boolean =>
    e.category === ROLLOVER_CATEGORY && e.participants.length === 1 && e.participants[0] === travelerId

  const closingEntry = expenses.find(e => isOwnRollover(e) && e.date === periodEndDate(before, startDay))
  if (closingEntry) return Number.isFinite(closingEntry.amount) ? closingEntry.amount : 0

  const openingEntry = expenses.find(e => isOwnRollover(e) && e.date === periodStartDate(after, startDay))
  if (openingEntry) return -(Number.isFinite(openingEntry.amount) ? openingEntry.amount : 0)

  return null
}

/**
 * رصيد افتتاح الدورة `period` لمسافر.
 *
 * ⚠️ غياب مصروف الترحيل ليس «لا معلومة» بالضرورة: closeMonth لا يكتب شيئاً
 * لرصيد مسوّى. إن كانت الدورة السابقة مغلقة (`lastClosedPeriod`) فالافتتاح صفر
 * معروف؛ وإلا null — والفرق بينهما مهمّ في تقرير مالي.
 */
export function periodOpeningBalance(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  period: PeriodKey,
  lastClosedPeriod: PeriodKey | null,
  startDay = 1,
): number | null {
  const before = previousPeriod(period)
  const boundary = boundaryRolloverAmount(travelerId, expenses, before, period, startDay)
  if (boundary !== null) return boundary
  return lastClosedPeriod !== null && lastClosedPeriod >= before ? 0 : null
}

/** رصيد إغلاق الدورة `period` (المُرحَّل فعلاً)، أو null إن لم تُغلق — المبدأ نفسه أعلاه. */
export function periodClosingBalance(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  period: PeriodKey,
  lastClosedPeriod: PeriodKey | null,
  startDay = 1,
): number | null {
  const boundary = boundaryRolloverAmount(travelerId, expenses, period, nextPeriod(period), startDay)
  if (boundary !== null) return boundary
  return lastClosedPeriod !== null && lastClosedPeriod >= period ? 0 : null
}

/**
 * نصّ منع إخراج العضو، أو null إن كان مسموحاً.
 *
 * ⚠️ للرحلات طويلة المدى فقط عمداً — القياسية تُسوّى مرة واحدة في نهايتها.
 */
export function describeExitBlock(
  tripType: TripType,
  travelerName: string,
  remaining: number,
): string | null {
  if (tripType !== 'long_term') return null
  const direction = settlementDirection(remaining)
  if (direction === 'settled') return null

  const amount = Math.abs(remaining).toFixed(2)
  return direction === 'credit'
    ? `لا يمكن إخراج ${travelerName} قبل تسوية حسابه — رصيده ${amount} ريال. سجّل مصروف تسوية (إعادة المبلغ له) لتصفير الرصيد أولاً، أو استخدم «تسوية وخروج».`
    : `لا يمكن إخراج ${travelerName} قبل تسوية حسابه — عليه ${amount} ريال. سجّل مصروف تسوية (استلام المبلغ منه) لتصفير الرصيد أولاً، أو استخدم «تسوية وخروج».`
}

/**
 * نصّ منع إخراج منظّم الرحلة، أو null.
 *
 * ⚠️ منفصل عن describeExitBlock: لا تحلّه تسوية — التحويلات تصل لبنكه، فلا
 * يخرج قبل تعيين منظّم آخر.
 * ⚠️ الإرشاد يطابق تسميات TripDetailPanel.tsx حرفياً (والاختبار يثبّتها) — غيّرهما معاً.
 */
export function describeOrganizerExitBlock(
  travelerUid: string | null | undefined,
  organizerUid: string | null | undefined,
  travelerName: string,
): string | null {
  if (!travelerUid || !organizerUid || travelerUid !== organizerUid) return null
  return `لا يمكن إخراج ${travelerName} — هو منظّم الرحلة، والتحويلات البنكية تصل لحسابه حالياً. عيّن منظّماً آخر أولاً: «تعديل الرحلة» من اسم الرحلة في الأعلى ← تبويب «المسافرون» ← «تعيين منظّماً». الزرّ يظهر لمن ربط حسابه فقط.`
}
