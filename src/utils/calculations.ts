import type { Traveler, TravelerBalance, Expense, Settlement, CategoryTotal, SpendingTrendPoint } from '../types'
import { matchesTraveler } from './participants'

// ─── دوال حساب نقية (Pure) ────────────────────────────────────────────────────
// مفصولة عن React لتكون قابلة للاختبار الوحدوي (unit testing) دون أي تبعية للواجهة.
// لا تعتمد على أي حالة خارجية — مدخلات ثابتة → مخرجات ثابتة.

/**
 * يقسّم مبلغاً بالتساوي على عدد من المشاركين بدون فقدان أي هللة بسبب التقريب.
 * يوزّع باقي الهللات بالتسلسل على المشاركين الأوائل لضمان أن مجموع الحصص يساوي المبلغ الأصلي تماماً.
 * 
 * @param {number} total - إجمالي المبلغ المراد تقسيمه.
 * @param {number} n - عدد المشاركين.
 * @returns {number[]} مصفوفة تحتوي على حصة كل مشارك بدقة متناهية.
 * 
 * @example
 * splitEven(100, 3) // يرجع: [33.34, 33.33, 33.33]
 */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return []
  const totalHalalas = Math.round(total * 100)
  const base         = Math.floor(totalHalalas / n)
  const remainder    = totalHalalas - base * n   // عدد المشاركين الذين يأخذون هللة إضافية
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}

/**
 * يقسّم مبلغاً على المشاركين بناءً على أوزان أو حصص مخصصة (مثلاً: شخص يتحمل ضعف الآخر).
 * إذا لم تُحدد حصص، أو كانت القيم غير صالحة، فإنه يعامل جميع المشاركين بوزن 1 (قسمة متساوية).
 * يستخدم خوارزمية "أكبر كسر متبقٍ" لتوزيع الهللات المتبقية لضمان تطابق المجموع.
 * 
 * @param {number} total - إجمالي المبلغ.
 * @param {Array<number | string>} participantIds - معرفات أو أسماء المشاركين.
 * @param {Record<string, number> | undefined} shares - كائن يمثل حصة كل مشارك (اختياري).
 * @returns {number[]} مصفوفة تمثل القيمة المالية المطلوبة من كل مشارك.
 */
export function splitByShares(
  total: number,
  participantIds: Array<number | string>,
  shares: Record<string, number> | undefined,
): number[] {
  const n = participantIds.length
  if (n <= 0) return []
  if (!shares || Object.keys(shares).length === 0) return splitEven(total, n)

  const weights = participantIds.map(id => {
    const w = shares[String(id)]
    return typeof w === 'number' && w > 0 ? w : 1
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0) return splitEven(total, n)

  const totalHalalas = Math.round(total * 100)
  const rawShares    = weights.map(w => (totalHalalas * w) / totalWeight)
  const floorShares  = rawShares.map(Math.floor)
  const distributed  = floorShares.reduce((s, v) => s + v, 0)
  const remainder    = totalHalalas - distributed

  const order = rawShares
    .map((v, i) => ({ i, frac: v - floorShares[i] }))
    .sort((a, b) => b.frac - a.frac)

  const halalas = [...floorShares]
  for (let k = 0; k < remainder && order.length > 0; k++) {
    halalas[order[k % order.length].i] += 1
  }

  return halalas.map(h => h / 100)
}

/**
 * يقوم بحساب الموقف المالي لكل مسافر بناءً على المصاريف التي شارك فيها والمبالغ التي دفعها مسبقاً.
 * تُحسب الحصص تلقائياً مع مراعاة الحصص المخصصة لكل مصروف.
 * 
 * @param {Traveler[]} travelers - قائمة المسافرين.
 * @param {Expense[]} expenses - قائمة جميع المصاريف المسجلة.
 * @returns {TravelerBalance[]} مصفوفة ببيانات المسافرين موضح فيها ما أنفقه كل شخص وما تبقى له/عليه.
 */
export function calculateBalances(travelers: Traveler[], expenses: Expense[]): TravelerBalance[] {
  const balances: TravelerBalance[] = travelers.map(t => ({
    ...t,
    totalExpenses: 0,
    remaining: t.deposited,
  }))

  expenses.forEach(exp => {
    const n = exp.participants.length
    if (n === 0) return
    const shares = splitByShares(exp.amount, exp.participants, exp.shares)
    exp.participants.forEach((p, i) => {
      const t = balances.find(b => matchesTraveler(b, p))
      if (t) {
        t.totalExpenses += shares[i]
        t.remaining     -= shares[i]
      }
    })
  })

  return balances
}

/**
 * @param {Expense[]} expenses - المصاريف.
 * @returns {number} إجمالي الأموال التي أُنفقت.
 */
export function calculateTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, exp) => sum + exp.amount, 0)
}

/**
 * @param {Traveler[]} travelers - المسافرين.
 * @returns {number} إجمالي المبالغ المدفوعة مقدماً في الصندوق.
 */
export function calculateTotalDeposited(travelers: Traveler[]): number {
  return travelers.reduce((sum, t) => sum + t.deposited, 0)
}

// ─── دوال مشتقة لتصوّر الأرصدة بياناً (Chart Data) ────────────────────────────

/**
 * يحسب التسويات المالية لتصفية الحسابات بين المسافرين بناءً على أرصدتهم.
 * يستخدم خوارزمية لمطابقة الأشخاص المدينين (رصيد سالب) مع الدائنين (رصيد موجب) لتبسيط التحويلات.
 * 
 * @param {TravelerBalance[]} balances - أرصدة المسافرين.
 * @returns {Settlement[]} قائمة بعمليات الدفع المقترحة (من يدفع لمن وكم المبلغ).
 */
export function calculateSettlements(balances: TravelerBalance[]): Settlement[] {
  const EPSILON = 0.01

  const debtors = balances
    .filter(b => b.remaining < -EPSILON)
    .map(b => ({ id: b.id, name: b.name, amount: -b.remaining }))
    .sort((a, b) => b.amount - a.amount)

  const creditors = balances
    .filter(b => b.remaining > EPSILON)
    .map(b => ({ id: b.id, name: b.name, amount: b.remaining }))
    .sort((a, b) => b.amount - a.amount)

  const settlements: Settlement[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100

    if (amount > EPSILON) {
      settlements.push({
        fromId: debtor.id, fromName: debtor.name,
        toId: creditor.id, toName: creditor.name,
        amount,
      })
    }

    debtor.amount -= amount
    creditor.amount -= amount
    if (debtor.amount <= EPSILON) i++
    if (creditor.amount <= EPSILON) j++
  }

  return settlements
}

/**
 * يجمّع إجمالي المصاريف بحسب فئاتها (كالتنقل، السكن، المطاعم).
 * 
 * @param {Expense[]} expenses - قائمة المصاريف.
 * @returns {CategoryTotal[]} فئات المصاريف مرتبة تنازلياً حسب الأعلى تكلفة.
 */
export function calculateCategoryTotals(expenses: Expense[]): CategoryTotal[] {
  const totals = new Map<string, number>()
  expenses.forEach(exp => {
    const category = exp.category?.trim() || 'أخرى'
    totals.set(category, (totals.get(category) ?? 0) + exp.amount)
  })
  return Array.from(totals, ([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

/**
 * يحسب تطور معدل الصرف التراكمي مع مرور أيام الرحلة.
 * 
 * @param {Expense[]} expenses - قائمة المصاريف.
 * @returns {SpendingTrendPoint[]} مصفوفة تمثل مجموع المصروفات لكل يوم بشكل تراكمي.
 */
export function calculateSpendingTrend(expenses: Expense[]): SpendingTrendPoint[] {
  const totalsByDate = new Map<string, number>()
  expenses.forEach(exp => {
    totalsByDate.set(exp.date, (totalsByDate.get(exp.date) ?? 0) + exp.amount)
  })

  let cumulative = 0
  return Array.from(totalsByDate, ([date, total]) => ({ date, total }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(point => {
      cumulative += point.total
      return { ...point, cumulative }
    })
}