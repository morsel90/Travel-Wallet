// 🆕 دوال بيانات التقارير للعرض على الشاشة — بحتة (بلا React/DOM) وقابلة للاختبار.
// تكمّل reports.ts (الذي يبني صفوف Excel)، لكن هذه تُعيد كائنات مُهيكلة تناسب
// عرض واجهة صفحة التقارير (ReportsView).

import type { Expense, PeriodKey, Traveler } from '../types'
import { splitByShares } from './calculations'
import { matchesTraveler } from './participants'
import { filterCycleExpenses, periodOpeningBalance } from './longTerm'

export interface TravelerReportLine {
  id: string
  date: string
  description: string
  category: string
  share: number
}

export interface TravelerReport {
  lines: TravelerReportLine[]
  totalShare: number
}

/**
 * تقرير مسافر واحد: قائمة المصاريف التي شارك فيها مع مبلغ حصّته من كلٍّ منها
 * (بنفس منطق splitByShares المستخدم في الحسابات والواجهة)، ومجموع حصصه.
 * الأسطر مرتّبة من الأحدث للأقدم.
 */
export function buildTravelerReport(traveler: Traveler, expenses: Expense[]): TravelerReport {
  const lines: TravelerReportLine[] = []
  let totalShare = 0

  for (const exp of expenses) {
    if (exp.participants.length === 0) continue
    const idx = exp.participants.findIndex(p => matchesTraveler(traveler, p))
    if (idx === -1) continue
    const shares = splitByShares(exp.amount, exp.participants, exp.shares)
    const share = shares[idx] ?? 0
    lines.push({
      id: exp.id,
      date: exp.date,
      description: exp.description,
      category: exp.category || 'أخرى',
      share,
    })
    totalShare += share
  }

  lines.sort((a, b) => b.date.localeCompare(a.date))
  return { lines, totalShare }
}

export interface DailySummaryRow {
  date: string
  count: number
  total: number
  cumulative: number
}

/**
 * ملخص يومي: لكل يوم عدد المصاريف وإجماليها، مع المجموع التراكمي حتى ذلك اليوم.
 * مرتّب زمنياً تصاعدياً.
 */
export function buildDailySummary(expenses: Expense[]): DailySummaryRow[] {
  const byDay = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const cur = byDay.get(e.date) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += e.amount
    byDay.set(e.date, cur)
  }
  let cumulative = 0
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      cumulative += v.total
      return { date, count: v.count, total: v.total, cumulative }
    })
}

export interface StatementRow {
  /** 🆕 `${exp.id}:${kind}` لا exp.id وحده — مصروف واحد قد يُنتج سطرين (دفعه من
   * جيبه + حصته فيه)، انظر تعليق الدالة أدناه. */
  id: string
  date: string
  description: string
  category: string
  /** 🆕 'share': حصته من مصروف شارك فيه (يُخصم). 'paidByPocket': ما دفعه من جيبه لمصروف (يُضاف). انظر Expense.paidBy. */
  kind: 'share' | 'paidByPocket'
  /** القيمة المطلقة للحركة — أثرها على الرصيد الجاري يُقرأ من `kind` لا من إشارة العدد. */
  amount: number
  balanceAfter: number
}

export interface AccountStatement {
  opening: number
  rows: StatementRow[]
  totalShare: number
  /** 🆕 إجمالي ما دفعه هذا المسافر من جيبه لمصاريف (Expense.paidBy = هويته) — صفر لمن لم يدفع من جيبه قط. */
  totalPaidByPocket: number
  /** المودَع + دفعه من جيبه − إجمالي حصصه — نفس صيغة TravelerBalance.remaining في calculateBalances تماماً؛ الحقلان يجب أن يتطابقا دائماً لنفس المسافر. */
  remaining: number
}

/**
 * كشف حساب مسافر: يبدأ من رصيده المُودَع (opening) ثم يتحرّك بترتيب زمني
 * تصاعدي (حسب createdAt) — خصماً لحصّته من كل مصروف شارك فيه، وإضافةً لكل
 * مبلغ دفعه من جيبه بدل الصندوق (Expense.paidBy) — مع رصيد جارٍ (balanceAfter)
 * بعد كل حركة. الرصيد النهائي = remaining = المُودَع + دفعه من جيبه − إجمالي
 * الحصص، بنفس منطق calculateBalances في utils/calculations.ts بالضبط (انظر
 * تعليقها) — لا حساباً موازياً مستقلاً قد ينحرف عنه.
 *
 * ⚠️ **مصروف واحد قد يُنتج سطرين**: من دفع مصروفاً من جيبه *وشارك فيه أيضاً*
 * يظهر له سطر "دفعه من جيبه" (+المبلغ كاملاً) وسطر "حصته" (−نصيبه) لنفس
 * المصروف — بالضبط ما يحدث لرصيده فعلياً في calculateBalances (يُقيَّد له
 * المبلغ كاملاً ثم يُخصم نصيبه كغيره من المشاركين). لهذا `id` هنا `exp.id`
 * ملحقاً بـ `kind`، لا exp.id وحده.
 */
export function buildAccountStatement(deposited: number, traveler: Traveler, expenses: Expense[]): AccountStatement {
  interface Entry { exp: Expense; kind: StatementRow['kind']; amount: number }
  const entries: Entry[] = []

  for (const exp of expenses) {
    // 🆕 دفعها من جيبه — انظر تعليق paidBy في calculateBalances؛ نفس تحصين
    // Number.isFinite هناك، فمصروف بمبلغ فاسد لا يُنتج رصيداً غير منتهٍ هنا أيضاً.
    if (typeof exp.paidBy === 'number' && matchesTraveler(traveler, exp.paidBy)) {
      entries.push({ exp, kind: 'paidByPocket', amount: Number.isFinite(exp.amount) ? exp.amount : 0 })
    }

    if (exp.participants.length > 0) {
      const idx = exp.participants.findIndex(p => matchesTraveler(traveler, p))
      if (idx !== -1) {
        const share = splitByShares(exp.amount, exp.participants, exp.shares)[idx] ?? 0
        entries.push({ exp, kind: 'share', amount: share })
      }
    }
  }

  entries.sort((a, b) => a.exp.createdAt - b.exp.createdAt)

  let balance = deposited
  const rows: StatementRow[] = entries.map(({ exp, kind, amount }) => {
    balance += kind === 'paidByPocket' ? amount : -amount
    return {
      id: `${exp.id}:${kind}`,
      date: exp.date,
      description: exp.description,
      category: exp.category || 'أخرى',
      kind,
      amount,
      balanceAfter: balance,
    }
  })

  const totalShare = entries.filter(e => e.kind === 'share').reduce((s, e) => s + e.amount, 0)
  const totalPaidByPocket = entries.filter(e => e.kind === 'paidByPocket').reduce((s, e) => s + e.amount, 0)

  return { opening: deposited, rows, totalShare, totalPaidByPocket, remaining: deposited + totalPaidByPocket - totalShare }
}

export interface PeriodTravelerSummary {
  id: number
  name: string
  /** رصيد الافتتاح — 0 حين hasKnownOpening=false (لا يُفسَّر كرصيد حقيقي). */
  opening: number
  /**
   * false يعني «رصيد الافتتاح غير معروف» — أول دورة في الرحلة (لا حدّ إغلاق
   * سابق أصلاً)، أو الدورة السابقة لم تُغلق بعد. لا «كان صفراً فعلاً»: اعرض
   * «—» لا 0 لكلّ من opening وclosing في هذه الحالة — closing المحسوب هنا
   * حينها ليس رصيداً نهائياً حقيقياً (لا يعرف رصيد الإيداع الأصلي وقتها، فقط
   * صافي حركة هذه الدورة وحدها)، بل صافي حركة الدورة (paidByPocket − spent)
   * فوق صفر مفترض. **spent وحده موثوق دائماً بصرف النظر عن hasKnownOpening.**
   */
  hasKnownOpening: boolean
  /** حصته من المصاريف الحقيقية في الدورة (بلا مصاريف الترحيل) — موثوق دائماً. */
  spent: number
  /** ما دفعه من جيبه لمصاريف الدورة، إن وُجد. */
  paidByPocket: number
  /** opening + paidByPocket − spent — رصيد نهائي حقيقي فقط حين hasKnownOpening=true. */
  closing: number
}

/**
 * ملخّص كل مسافر لدورة واحدة: افتتاحها (periodOpeningBalance)، صرفه الحقيقي
 * فيها، وإغلاقها — **بإعادة استخدام buildAccountStatement نفسها** لا حساب
 * موازٍ: تمرير رصيد الافتتاح كـ"المودَع" ومصاريف الدورة الحقيقية فقط (بلا
 * مصاريف الترحيل) يُنتج بالضبط ما تنتجه أي دورة عادية، سواء أُغلقت الدورة
 * فعلاً أم كانت لا تزال مفتوحة (عندها closing هو ما *سيُرحَّل* لو أُغلقت الآن).
 *
 * ⚠️ `allExpenses` يجب أن تكون **غير مُصفّاة** — periodOpeningBalance يبحث عن
 * مصروف الترحيل في تاريخ حدّ الدورة السابقة، وهو خارج مصاريف هذه الدورة نفسها.
 *
 * `lastClosedPeriod` (من مستند الرحلة، null إن لم يُغلق شهر بعد) يمرَّر كما
 * هو إلى periodOpeningBalance — لازم لتمييز «افتتح بصفر معروف» (مسافر مسوّى
 * عند إغلاق فعلي) عن «لا معلومة» (دورة سابقة لم تُغلق قط). بدونه يُعامَل كل
 * مسافر مسوّى كـ«مجهول الافتتاح» ولو أُغلقت دورته السابقة فعلاً — انظر تعليق
 * periodOpeningBalance في utils/longTerm.ts.
 */
export function buildPeriodTravelerSummaries(
  travelers: Traveler[],
  allExpenses: Expense[],
  period: PeriodKey,
  lastClosedPeriod: PeriodKey | null,
): PeriodTravelerSummary[] {
  const periodExpenses = filterCycleExpenses(allExpenses, period)
  return travelers.map(t => {
    const openingLookup = periodOpeningBalance(t.id, allExpenses, period, lastClosedPeriod)
    const opening = openingLookup ?? 0
    const statement = buildAccountStatement(opening, t, periodExpenses)
    return {
      id: t.id,
      name: t.name,
      opening,
      hasKnownOpening: openingLookup !== null,
      spent: statement.totalShare,
      paidByPocket: statement.totalPaidByPocket,
      closing: statement.remaining,
    }
  })
}
