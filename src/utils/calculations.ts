import type { Traveler, TravelerBalance, Expense, Repayment, Settlement, CategoryTotal, SpendingTrendPoint } from '../types'
import { matchesTraveler } from './participants'

// ─── دوال حساب نقية ─────────────────────────────────────────────────────────
// ⚠️ مسار قراءة يعمل على كل مصروف في كل عرض: القيمة غير المنتهية تُعامَل صفراً
// ولا يُرمى استثناء — مستند فاسد واحد لا يُسقط الشجرة ولا يُحوّل الأرصدة NaN.
// الحماية الحقيقية عند حدود الإدخال؛ هذه شبكة أمان للبيانات القائمة (القاعدة ١٩).

/**
 * قسمة متساوية بلا فقدان هللة: الباقي يوزَّع على الأوائل فيساوي المجموع المبلغ.
 *
 * @example
 * splitEven(100, 3) // يرجع: [33.34, 33.33, 33.33]
 */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return []
  // ⚠️ أصفار لا مصفوفة فارغة: calculateBalances تقابل shares[i] بـ participants[i].
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0)
  const totalHalalas = Math.round(total * 100)
  const base         = Math.floor(totalHalalas / n)
  const remainder    = totalHalalas - base * n   // عدد المشاركين الذين يأخذون هللة إضافية
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}

/**
 * قسمة بالأوزان (وزن غير صالح = 1، بلا أوزان = قسمة متساوية). الهللات الباقية
 * بطريقة «أكبر كسر متبقٍ» فيطابق المجموع المبلغ.
 */
export function splitByShares(
  total: number,
  participantIds: Array<number | string>,
  shares: Record<string, number> | undefined,
): number[] {
  const n = participantIds.length
  if (n <= 0) return []
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0)
  if (!shares || Object.keys(shares).length === 0) return splitEven(total, n)

  const weights = participantIds.map(id => {
    const w = shares[String(id)]
    // ⚠️ isFinite لا typeof: Infinity عددٌ موجب فتصير القسمة NaN.
    return Number.isFinite(w) && w > 0 ? w : 1
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  // على المجموع لا الآحاد: وزنان منتهيان (1e308) قد يفيض مجموعهما.
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return splitEven(total, n)

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

/** رصيد كل مسافر: المودَع + ما دفعه من جيبه ± السداد − نصيبه من المصاريف. */
export function calculateBalances(travelers: Traveler[], expenses: Expense[], repayments: Repayment[] = []): TravelerBalance[] {
  // ⚠️ يُطهَّر deposited نفسه لا remaining وحده، وإلا انكسرت القاعدة ٢
  // (remaining = deposited − totalExpenses) على بيانات تالفة. لا يُعاد كتابة المستند.
  const balances: TravelerBalance[] = travelers.map(t => {
    const deposited = Number.isFinite(t.deposited) ? t.deposited : 0
    return { ...t, deposited, totalExpenses: 0, remaining: deposited }
  })

  expenses.forEach(exp => {
    // دُفع من جيب مسافر: يُقيَّد كاملاً للدافع، ثم يُخصم نصيبه أدناه كغيره.
    // 'fund' أو الغياب (المصاريف القديمة) = من الصندوق.
    if (typeof exp.paidBy === 'number') {
      const payer = balances.find(b => matchesTraveler(b, exp.paidBy as number))
      if (payer) payer.remaining += Number.isFinite(exp.amount) ? exp.amount : 0
    }

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

  // السداد — القيد الثالث: ينقل الرصيد بين طرفَين. ⚠️ لا يمسّ deposited ولا
  // totalExpenses (يعتمد عليه cycleShareBalances). المحذوف يستبعده المستدعي.
  repayments.forEach(r => {
    const amount = Number.isFinite(r.amount) ? r.amount : 0
    const from = balances.find(b => b.id === r.fromId)
    const to   = balances.find(b => b.id === r.toId)
    if (from) from.remaining += amount
    if (to)   to.remaining   -= amount
  })

  return balances
}

export function calculateTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, exp) => sum + (Number.isFinite(exp.amount) ? exp.amount : 0), 0)
}

export function calculateTotalDeposited(travelers: Traveler[]): number {
  return travelers.reduce((sum, t) => sum + (Number.isFinite(t.deposited) ? t.deposited : 0), 0)
}

/**
 * التحويلات المقترحة لتصفية الحسابات — «تبسيط الديون» بالعمل على صافي الرصيد:
 * من صافيه صفر لا يظهر، فتنهار السلاسل (علي←خالد←سارا = علي←سارا).
 *
 * جشعة: أكبر مدين مع أكبر دائن، فلا تتجاوز N-1 تحويلاً (الاختبارات تثبّت ذلك).
 * ⚠️ ليست الأمثل رياضياً (NP-hard) — لا تستبدلها دون قياس؛ المكسب تحويل أو اثنان.
 */
export function calculateSettlements(balances: TravelerBalance[]): Settlement[] {
  // هللة — أرصدة شبه صفرية من تقريب الفاصلة العائمة ليست ديوناً.
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

/** إجمالي كل فئة، تنازلياً. */
export function calculateCategoryTotals(expenses: Expense[]): CategoryTotal[] {
  const totals = new Map<string, number>()
  expenses.forEach(exp => {
    const category = exp.category?.trim() || 'أخرى'
    totals.set(category, (totals.get(category) ?? 0) + exp.amount)
  })
  return Array.from(totals, ([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

/** مجموع كل يوم وتراكمه، تصاعدياً بالتاريخ. */
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