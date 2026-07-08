import type { Traveler, TravelerBalance, Expense, Settlement, CategoryTotal, SpendingTrendPoint } from '../types'
import { matchesTraveler } from './participants'

// ─── دوال حساب نقية (Pure) ────────────────────────────────────────────────────
// مفصولة عن React لتكون قابلة للاختبار الوحدوي (unit testing) دون أي تبعية للواجهة.
// لا تعتمد على أي حالة خارجية — مدخلات ثابتة → مخرجات ثابتة.

/**
 * يقسّم مبلغاً على n مشاركين بحيث تتجمّع الحصص بدقّة = المبلغ الأصلي (دون فقد هللات).
 * يعمل بالهللات (أعداد صحيحة) لتفادي أخطاء الفاصلة العائمة، ثم يوزّع الباقي
 * هللةً هللةً على المشاركين الأوائل. مثال: splitEven(100, 3) → [33.34, 33.33, 33.33].
 */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return []
  const totalHalalas = Math.round(total * 100)
  const base         = Math.floor(totalHalalas / n)
  const remainder    = totalHalalas - base * n   // عدد المشاركين الذين يأخذون هللة إضافية
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}

/**
 * 🆕 يقسّم مبلغاً على مشاركين بأوزان غير متساوية (حصص) بدل التساوي التام —
 * "فلان يدفع ضعف" يُترجم لوزن 2 له مقابل وزن 1 للباقين، مثلاً. أي مشارك بلا
 * وزن محدد في shares (أو عند غياب shares بالكامل أو كونها فارغة) يُعامَل بوزن
 * 1 — هذا يجعلها مطابقة تماماً لـ splitEven عند تساوي كل الأوزان أو غيابها،
 * فلا حاجة لأي فرع منطقي إضافي أو ترحيل بيانات في بقية الكود.
 *
 * تعمل بالهللات (أعداد صحيحة) كـ splitEven تماماً لتفادي أخطاء الفاصلة
 * العائمة، وتوزّع باقي الهللات (الناتج عن تقريب كل حصة لأسفل) بطريقة "أكبر
 * كسر متبقٍ" (Largest Remainder) بحيث تتجمّع الحصص بدقّة = المبلغ الأصلي دون
 * محاباة دائمة لنفس المشارك.
 */
export function splitByShares(
  total: number,
  participantIds: Array<number | string>,
  shares: Record<string, number> | undefined,
): number[] {
  const n = participantIds.length
  if (n <= 0) return []
  if (!shares || Object.keys(shares).length === 0) return splitEven(total, n)

  // وزن غير صالح (سالب/صفر/غير رقم) يُعامَل كوزن 1 دفاعياً — هذا يحمي كل من
  // يقرأ هذا المصروف من قيمة تالفة أو مُتلاعَب بها قد تكون كُتبت مباشرة عبر
  // Firestore SDK متجاوزةً واجهة النموذج (انظر أيضاً isValidShares في firestore.rules)
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
 * يوزّع كل مصروف على مشاركيه ويحسب لكل مسافر:
 *  - totalExpenses: مجموع حصصه من المصاريف
 *  - remaining:     ما تبقّى من دفعه المسبق بعد خصم حصصه
 * المطابقة بين المصروف والمسافر تتم عبر المعرّف (id)، مع توافق خلفي مع الأسماء
 * المختصرة القديمة. القسمة عبر splitByShares (تُطابق splitEven تماماً عند عدم
 * وجود shares مخصّصة على المصروف) بحيث تتجمّع حصص المشاركين بدقّة = مبلغ
 * المصروف (لا فروق هللات بسبب التقريب).
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

/** إجمالي ما أُنفق (بالريال) عبر كل المصاريف. */
export function calculateTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, exp) => sum + exp.amount, 0)
}

/** إجمالي المبالغ المدفوعة مسبقاً من كل المسافرين. */
export function calculateTotalDeposited(travelers: Traveler[]): number {
  return travelers.reduce((sum, t) => sum + t.deposited, 0)
}

// ─── دوال مشتقة لتصوّر الأرصدة بياناً (Chart Data) ────────────────────────────
// 🆕 لا تعتمد على أي شيء غير موجود أصلاً (travelers/expenses) — مخرجاتها تُغذّي
// مكوّنات src/components/charts/ فقط، ولا تُكتب لـ Firestore أبداً.

/**
 * تسوية أرصدة مبسّطة (Debt Simplification) — تُحوّل كل أرصدة remaining الفردية
 * (من balances، أي بعد calculateBalances) إلى قائمة تحويلات مقترحة بين الأعضاء
 * لتصفير الجميع: من عليه (remaining سالب) إلى من له (remaining موجب).
 *
 * خوارزمية جشعة (greedy): تُطابق أكبر "مدين" مع أكبر "دائن" تكراراً حتى تنتهي
 * القائمتان. هذه ليست الحل الأمثل رياضياً من ناحية أقل عدد تحويلات ممكن (المشكلة
 * العامة NP-hard)، لكنها تُعطي نتيجة عملية ومعقولة جداً لعدد صغير من المشاركين
 * كحال هذا التطبيق. ⚠️ هذه تحويلات "مقترحة" لتسوية من دفع أكثر/أقل من نصيبه من
 * المصاريف المشتركة — وليست تحويلات بنكية فعلية ولا مرتبطة بأي نظام دفع حقيقي.
 */
export function calculateSettlements(balances: TravelerBalance[]): Settlement[] {
  const EPSILON = 0.01 // هللة واحدة — تفادي معاملة أرصدة شبه صفرية (تقريب الفاصلة العائمة) كدين حقيقي

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

/** إجمالي المصاريف مجمّعة حسب الفئة — المصاريف بلا فئة محفوظة (بيانات قديمة) تُصنَّف "أخرى". مرتّبة تنازلياً. */
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
 * تطوّر المصاريف عبر الزمن: لكل تاريخ فريد — مجموع مصاريف ذلك اليوم، والمجموع
 * التراكمي حتى ذلك اليوم شاملاً. مرتّبة تصاعدياً حسب التاريخ (مقارنة نصية آمنة
 * لأن التنسيق ثابت YYYY-MM-DD).
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