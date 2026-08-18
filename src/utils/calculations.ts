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
  // 🆕 مبلغ غير منتهٍ (NaN أو ±Infinity) يُعامَل كصفر بدل أن يُمرَّر.
  // بدونه: Math.round(NaN * 100) = NaN فتخرج المصفوفة كلها NaN، وInfinity أسوأ
  // لأن Infinity - Infinity = NaN أيضاً. ويكفي مستند مصروف واحد فاسد في Firestore
  // لتصير كل الأرصدة والتسويات المعروضة NaN.
  // لماذا صفر ولا نرمي استثناءً: هذا مسار *قراءة* يعمل على كل مصروف في كل عرض،
  // فالرمي يُسقط الشجرة كلها إلى ErrorBoundary بسبب مستند واحد. والصفر يحفظ طول
  // المصفوفة، وهو شرط لازم لأن calculateBalances تقابل shares[i] بـ participants[i].
  // الحماية الحقيقية عند حدود الإدخال (hooks/useExpenseActions.ts)؛ هذه شبكة أمان
  // للبيانات الفاسدة الموجودة أصلاً.
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0)
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
 * @param {Array<number | string>} participantIds - معرفات المشاركين (نوع عام، غير مربوط بـ Expense.participants).
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
  if (!Number.isFinite(total)) return Array.from({ length: n }, () => 0)  // 🆕 انظر splitEven
  if (!shares || Object.keys(shares).length === 0) return splitEven(total, n)

  const weights = participantIds.map(id => {
    const w = shares[String(id)]
    // 🆕 Number.isFinite بدل typeof: الشرط القديم `typeof w === 'number' && w > 0`
    // كان يقبل Infinity — فهي عدد وهي أكبر من صفر فعلاً — فيصير totalWeight
    // لانهائياً و(totalHalalas × Infinity) / Infinity = NaN. أما NaN فكان يسقط
    // بالمصادفة لا بالقصد، لأن كل مقارنة مع NaN كاذبة.
    return Number.isFinite(w) && w > 0 ? w : 1
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  // 🆕 !Number.isFinite: كل وزن قد يكون منتهياً ويفيض *مجموعها* إلى Infinity
  // (وزنان بقيمة 1e308 مثلاً)، فالفحص على المجموع لا على الآحاد.
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

/**
 * يقوم بحساب الموقف المالي لكل مسافر بناءً على المصاريف التي شارك فيها والمبالغ التي دفعها مسبقاً.
 * تُحسب الحصص تلقائياً مع مراعاة الحصص المخصصة لكل مصروف.
 * 
 * @param {Traveler[]} travelers - قائمة المسافرين.
 * @param {Expense[]} expenses - قائمة جميع المصاريف المسجلة.
 * @returns {TravelerBalance[]} مصفوفة ببيانات المسافرين موضح فيها ما أنفقه كل شخص وما تبقى له/عليه.
 */
export function calculateBalances(travelers: Traveler[], expenses: Expense[]): TravelerBalance[] {
  // 🆕 الرصيد المُودَع يُطهَّر هنا كما تُطهَّر المبالغ في splitEven/splitByShares.
  //
  // ⚠️ كان `remaining: t.deposited` مباشرةً — وهي آخر ثغرة في القاعدة ٤: مستندٌ
  // في Firestore يحمل deposited غير منتهٍ (كُتب قبل حارس الإدخال، أو من جهاز على
  // حزمة قديمة) يجعل remaining غير منتهٍ، ومنه «المتبقّي» في الترويسة وكشف
  // الحساب و«إجمالي المودَع» في كل تقرير.
  //
  // ⚠️ **ويُطهَّر الحقلان معاً لا remaining وحده.** لو طُهِّر remaining فقط
  // لعرض الجدول deposited غير منتهٍ بجانب remaining منتهٍ، فتنكسر القاعدة ٢
  // (remaining = deposited − totalExpenses) على بيانات تالفة — أي نُصلح قاعدة
  // بكسر أخرى. الصفر يحفظ القاعدتين معاً.
  //
  // ولا يُعاد كتابة المستند: نفس مبدأ الدوال النقية — القراءة دفاعية والإصلاح
  // قرار بشري (انظر صفّ «كل الأرصدة تظهر NaN» في جدول استكشاف الأخطاء).
  const balances: TravelerBalance[] = travelers.map(t => {
    const deposited = Number.isFinite(t.deposited) ? t.deposited : 0
    return { ...t, deposited, totalExpenses: 0, remaining: deposited }
  })

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
  // 🆕 مستند واحد بمبلغ غير منتهٍ كان يكفي لعرض NaN في إحصائيات الترويسة، حتى بعد
  // تحصين splitEven — لأن هذا المجموع لا يمرّ بالتقسيم أصلاً.
  return expenses.reduce((sum, exp) => sum + (Number.isFinite(exp.amount) ? exp.amount : 0), 0)
}

/**
 * @param {Traveler[]} travelers - المسافرين.
 * @returns {number} إجمالي المبالغ المدفوعة مقدماً في الصندوق.
 */
export function calculateTotalDeposited(travelers: Traveler[]): number {
  return travelers.reduce((sum, t) => sum + (Number.isFinite(t.deposited) ? t.deposited : 0), 0)
}

// ─── دوال مشتقة لتصوّر الأرصدة بياناً (Chart Data) ────────────────────────────

/**
 * يحسب التسويات المالية لتصفية الحسابات بين المسافرين بناءً على أرصدتهم.
 * يستخدم خوارزمية لمطابقة الأشخاص المدينين (رصيد سالب) مع الدائنين (رصيد موجب) لتبسيط التحويلات.
 * 
 * @param {TravelerBalance[]} balances - أرصدة المسافرين.
 * @returns {Settlement[]} قائمة بعمليات الدفع المقترحة (من يدفع لمن وكم المبلغ).
 *
 * ── هذه *هي* «تبسيط الديون» (Debt Simplification) ──────────────────────────
 * الدالة تعمل على **صافي** الرصيد (remaining) لا على حواف «من دفع لمن». وهذا
 * وحده يُنجز التبسيط: من كان صافيه صفراً لا يظهر في النتيجة إطلاقاً، فتنهار
 * السلاسل تلقائياً. مثال: «علي يدين لخالد ١٠٠ وخالد يدين لسارا ١٠٠» يُنتج
 * تحويلاً واحداً — علي يدفع لسارا — ولا يُذكر خالد.
 *
 * الخوارزمية جشعة (greedy): تطابق أكبر مدين بأكبر دائن تكراراً. كل دورة
 * تُصفّر طرفاً واحداً على الأقل، ولهذا لا يتجاوز عدد التحويلات N-1 أبداً.
 *
 * ⚠️ ليست الحل الأمثل رياضياً لأقل عدد تحويلات ممكن — المشكلة العامة NP-hard —
 * لكنها تُعطي نتيجة عملية جداً لعدد صغير من المشاركين كحال هذا التطبيق. لا
 * تستبدلها بحل «أمثل» دون قياس: المكسب المتوقع تحويل أو تحويلان في أحسن
 * الأحوال، مقابل خوارزمية أصعب في القراءة والتحقق من صحتها.
 *
 * ⚠️ هذه تحويلات *مقترحة* لتسوية من دفع أكثر/أقل من نصيبه — وليست تحويلات
 * بنكية فعلية ولا مرتبطة بأي نظام دفع.
 *
 * انظر calculateSettlements في calculations.test.ts: الاختبارات تثبّت انهيار
 * السلسلة وحدّ N-1 صراحةً.
 */
export function calculateSettlements(balances: TravelerBalance[]): Settlement[] {
  // هللة واحدة — تفادي معاملة أرصدة شبه صفرية (ناتجة عن تقريب الفاصلة العائمة)
  // كأنها ديون حقيقية، فتظهر تحويلات بقيمة 0.00 في الواجهة.
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