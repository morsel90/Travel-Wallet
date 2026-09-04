// 🆕 دوال بيانات التقارير للعرض على الشاشة — بحتة (بلا React/DOM) وقابلة للاختبار.
// تكمّل reports.ts (الذي يبني صفوف Excel)، لكن هذه تُعيد كائنات مُهيكلة تناسب
// عرض واجهة صفحة التقارير (ReportsView).

import type { DepositLogEntry, DepositMode, Expense, PeriodKey, Traveler, TravelerBalance } from '../types'
import { splitByShares } from './calculations'
import { matchesTraveler } from './participants'
import { filterCycleExpenses } from './longTerm'
import { replayDepositLogs } from './deposits'
import { formatPeriodLabel } from './period'

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
interface ExpenseEntry { exp: Expense; kind: StatementRow['kind']; amount: number }

/** إدخالات مصروف واحد لهذا المسافر (حصة و/أو دفعها من جيبه) — غير مرتّبة،
 *  مشتركة بين buildAccountStatement وbuildMergedTimeline لتفادي تكرار نفس
 *  منطق matchesTraveler/splitByShares في مكانين قد ينحرفان لاحقاً. */
function collectExpenseEntries(traveler: Traveler, expenses: Expense[]): ExpenseEntry[] {
  const entries: ExpenseEntry[] = []

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

  return entries
}

export function buildAccountStatement(deposited: number, traveler: Traveler, expenses: Expense[]): AccountStatement {
  const entries = collectExpenseEntries(traveler, expenses).sort((a, b) => a.exp.createdAt - b.exp.createdAt)

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

export interface DepositTimelineRow {
  id: string
  date: string
  kind: 'deposit'
  mode: DepositMode
  reason: string | null
  /** الفرق الفعلي الموقَّع (newDeposited − previousDeposited) — قد يكون سالباً
   *  حتى في mode='add' لو كان previousDeposited تالفاً وطُهِّر لصفر أولاً،
   *  انظر applyDepositMode في utils/deposits.ts. */
  delta: number
  balanceAfter: number
}

export type TimelineRow = StatementRow | DepositTimelineRow

export interface MergedTimeline {
  /** الرصيد قبل أول حركة في `rows` — صفر لأي مسافر تُفسِّر سجلاته كامل رصيده
   *  الحالي، أو المبلغ غير الموثَّق بأي سجل (مسافر سابق لإدخال سجل التدقيق،
   *  انظر docs/DECISIONS.md). ليس رصيداً "مودَعاً" بالمعنى المعتاد — هو فقط
   *  ما تبقّى غير مفسَّر بعد طرح مجموع السجلّات من deposited. */
  legacyOpening: number
  rows: TimelineRow[]
  closing: number
}

/** فروق أصغر من هذا تُقرَّب لصفر — تفادياً لسطر "رصيد قديم غير موثَّق: ٠٫٠٠"
 *  زائف ناتج عن تراكم أخطاء الفاصلة العائمة لا عن رصيد حقيقي غير مُفسَّر. */
const LEGACY_EPSILON = 0.005

/** "٢٠٢٦-٠٩-٠٣" من طابع زمني — بمكوّنات Date محلية لا toISOString (UTC)، نفس
 *  مبدأ formatRowDate في TravelerProfileModal وtripId.ts: تفادي فخّ منطقة
 *  زمنية يُزيح تاريخ حركة قرب منتصف الليل ليوم مختلف. */
function localDateFromTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * يدمج حركات المصاريف (حصة/دفعها من جيبه) مع سجل تعديلات الرصيد (depositLogs)
 * في خط زمني واحد مرتّب بالتاريخ الحقيقي (createdAt) لكل حركة — بلا أي حساب
 * مالي جديد، عرضي بحت فوق ما تحسبه buildAccountStatement/replayDepositLogs
 * أصلاً.
 *
 * ⚠️ **لماذا الدمج آمن رياضياً**: `DepositLogEntry.delta` هو الفرق الفعلي
 * المخزَّن فعلاً (newDeposited − previousDeposited، انظر تعليق
 * applyDepositMode في utils/deposits.ts)، فسلسلة الفروق بترتيبها الزمني
 * الصحيح تتلسكب (telescopes) بالضبط إلى `replayDepositLogs(logs)`. ولذلك:
 *
 *   legacyOpening + Σ(كل حركة في rows) = traveler.deposited + totalPaidByPocket − totalShare
 *
 * وهي نفس `remaining` التي تحسبها buildAccountStatement تماماً — مهما كان
 * ترتيب تداخل حركات الإيداع والمصاريف زمنياً (حركة إيداع لا تتأثر بأي مصروف
 * يسبقها أو يليها؛ `deposited` طرفٌ مستقل عن دفتر المصاريف، انظر
 * docs/DECISIONS.md «كل تعديل على deposited حركة مُدقَّقة»).
 *
 * نطاق محدود عمداً: لا صلة له بالرصيد الافتتاحي لدورة مُصفّاة
 * (periodOpeningBalance يقرأ مصروف ترحيل، لا deposited) — يُستدعى فقط في
 * العرض غير المُصفَّى بدورة. انظر TravelerProfileModal.
 */
export function buildMergedTimeline(traveler: Traveler, expenses: Expense[], logs: DepositLogEntry[]): MergedTimeline {
  const expenseItems = collectExpenseEntries(traveler, expenses).map(({ exp, kind, amount }) => ({
    ts: exp.createdAt,
    signedAmount: kind === 'paidByPocket' ? amount : -amount,
    row: { id: `${exp.id}:${kind}`, date: exp.date, description: exp.description, category: exp.category || 'أخرى', kind, amount } satisfies Omit<StatementRow, 'balanceAfter'>,
  }))

  const depositItems = logs.map(log => ({
    ts: log.createdAt,
    signedAmount: log.delta,
    row: { id: log.id, date: localDateFromTimestamp(log.createdAt), kind: 'deposit' as const, mode: log.mode, reason: log.reason, delta: log.delta } satisfies Omit<DepositTimelineRow, 'balanceAfter'>,
  }))

  const items = [...expenseItems, ...depositItems].sort((a, b) => a.ts - b.ts)

  const legacyOpeningRaw = traveler.deposited - replayDepositLogs(logs)
  const legacyOpening = Math.abs(legacyOpeningRaw) < LEGACY_EPSILON ? 0 : legacyOpeningRaw

  let balance = legacyOpening
  const rows: TimelineRow[] = items.map(({ row, signedAmount }) => {
    balance += signedAmount
    return { ...row, balanceAfter: balance }
  })

  return { legacyOpening, rows, closing: balance }
}

export interface PeriodTravelerSummary {
  id: number
  name: string
  /** المتاح له هذه الدورة (مُرحَّل + أي إيداع أُضيف خلالها) — انظر تعليق
   *  buildCurrentPeriodTravelerSummaries لصيغة الاشتقاق. */
  opening: number
  /** 🆕 دائماً true الآن — كانت تميّز «افتتاح مجهول» لدورة سابقة لا حدّ إغلاق
   *  معروف لها، لكن ReportsView.tsx لم يعد يعرض أي دورة سوى الحالية (لا مُصفّي
   *  يدوي بعد الآن، انظر تعليق periods في ReportsView.tsx)، وopening هنا دائماً
   *  معروف جبرياً بصرف النظر عن تاريخ الإغلاق. أُبقي الحقل لتوافق الشكل مع
   *  استهلاكه الحالي، لا لأنه يحمل معلومة متغيّرة بعد اليوم. */
  hasKnownOpening: boolean
  /** حصته من المصاريف الحقيقية في الدورة (بلا مصاريف الترحيل) — موثوق دائماً. */
  spent: number
  /** ما دفعه من جيبه لمصاريف الدورة، إن وُجد. */
  paidByPocket: number
  /** الرصيد الحيّ الحالي (balance.remaining) — نفس closing لأي دورة مفتوحة. */
  closing: number
}

/**
 * ملخّص كل مسافر **للدورة الحالية** (المفتوحة، لم تُغلق بعد) — الدورة الوحيدة
 * التي يعرضها ReportsView.tsx الآن (لا مُصفّي يدوي لدورة سابقة بعد اليوم).
 *
 * ⚠️ **لماذا لا periodOpeningBalance هنا**: تلك تقرأ رصيد حدّ الإغلاق بين
 * الدورة الحالية والسابقة (مصروف الترحيل الذي كتبه closeMonth إن وُجد) —
 * صحيح تاريخياً لدورة *منتهية*، لكن الدورة الحالية لم تنتهِ بعد، وأي إيداع
 * أُضيف *خلالها* (DepositModal يكتب depositLogs مباشرة، لا مصروفاً يدخل
 * filterCycleExpenses) غائب عن ذلك الرصيد الجامد كلياً. هذا بالضبط الخطأ
 * الذي أُصلح في TravelerProfileModal (commit 974db32) — إجمالي المودَع في
 * تقرير الرحلة يعاني نفس العرض: مسافر أضاف إيداعاً هذه الدورة يرى «المودَع»
 * أقلّ من حقيقته بقيمة ذلك الإيداع بالضبط.
 *
 * الحل نفسه بالضبط: اشتقاق جبري من `liveBalances` (calculateBalances على
 * كامل تاريخ الرحلة — صحيح دائماً، حيّ من travelers/{id}.deposited، بلا
 * حاجة لصلاحية depositLogs ولا لمعرفة رصيد حدّ الدورة) بعكس معادلة الرصيد:
 *   remaining = opening + paidByPocket − spent  ⇒  opening = remaining − paidByPocket + spent
 */
export function buildCurrentPeriodTravelerSummaries(
  travelers: Traveler[],
  liveBalances: TravelerBalance[],
  allExpenses: Expense[],
  period: PeriodKey,
): PeriodTravelerSummary[] {
  const periodExpenses = filterCycleExpenses(allExpenses, period)
  return travelers.map(t => {
    const remaining = liveBalances.find(b => b.id === t.id)?.remaining ?? 0
    // opening=0 هنا وسيط حسابي بحت (لا معنى مالياً له وحده) — نصيبه ودفعه من
    // جيبه هذه الدورة فقط هما المطلوبان لاشتقاق opening الحقيقي جبرياً أدناه.
    const statement = buildAccountStatement(0, t, periodExpenses)
    return {
      id: t.id,
      name: t.name,
      opening: remaining + statement.totalShare - statement.totalPaidByPocket,
      hasKnownOpening: true,
      spent: statement.totalShare,
      paidByPocket: statement.totalPaidByPocket,
      closing: remaining,
    }
  })
}

export interface PeriodOverviewRow {
  period: PeriodKey
  label: string
  count: number
  spent: number
}

/**
 * ملخّص كل دورة على حدة عبر الرحلة كلها — بديل «الملخص اليومي» في الرحلات
 * طويلة المدى: جدول بعشرات أو مئات الأيام غير مفيد لرحلة تمتد أشهراً،
 * والمستوى المفيد فعلاً هناك هو الدورة الشهرية. مصاريف كل دورة حقيقية فقط
 * (بلا مصاريف الترحيل)، بنفس استبعاد filterCycleExpenses/buildDailySummary.
 *
 * ⚠️ **بلا مجموع تراكمي عمداً** (بخلاف buildDailySummary) — الرصيد يُرحَّل
 * فعلياً بين الدورات (closeMonth)، فمجموع الصرف "منذ بداية الرحلة" ليس رقماً
 * أحد يتابعه: من يهمّه الأمر يريد كم دفع *هذه* الدورة تحديداً، ثم يبدأ من
 * جديد مع الدورة التالية.
 */
export function buildPeriodOverview(expenses: Expense[], periods: PeriodKey[]): PeriodOverviewRow[] {
  return periods.map(period => {
    const periodExpenses = filterCycleExpenses(expenses, period)
    const spent = periodExpenses.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)
    return { period, label: formatPeriodLabel(period), count: periodExpenses.length, spent }
  })
}
