import { describe, it, expect } from 'vitest'
import type { DepositLogEntry, Expense, Traveler } from '../types'
import { buildTravelerReport, buildDailySummary, buildAccountStatement, buildMergedTimeline, buildCurrentPeriodTravelerSummaries, buildPeriodOverview } from './reportData'
import { calculateBalances } from './calculations'
import { ROLLOVER_CATEGORY } from './longTerm'

const ahmed: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null }
const saad:  Traveler = { id: 2, name: 'سعد',          shortName: 'سعد',  deposited: 100,  deletedAt: null }

const expenses: Expense[] = [
  { id: 'e1', date: '2026-07-10', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1, category: 'طعام وشراب' },
  { id: 'e2', date: '2026-07-10', description: 'وقود', amount: 100, originalAmount: 100, currency: 'SAR', exchangeRate: 1, participants: [1],    createdAt: 2, category: 'مواصلات' },
  { id: 'e3', date: '2026-07-11', description: 'فندق', amount: 300, originalAmount: 80,  currency: 'USD', exchangeRate: 3.75, participants: [1, 2], createdAt: 3, category: 'إقامة' },
]

describe('buildTravelerReport', () => {
  it('lists only expenses the traveler is part of, with their share', () => {
    const rep = buildTravelerReport(ahmed, expenses)
    // أحمد شارك في الثلاثة: 100 + 100 + 150 = 350
    expect(rep.lines).toHaveLength(3)
    expect(rep.totalShare).toBe(350)
  })

  it('excludes expenses the traveler is not part of', () => {
    const rep = buildTravelerReport(saad, expenses)
    // سعد شارك في e1 و e3 فقط: 100 + 150 = 250
    expect(rep.lines.map(l => l.id).sort()).toEqual(['e1', 'e3'])
    expect(rep.totalShare).toBe(250)
  })

  it('sorts lines newest first', () => {
    const rep = buildTravelerReport(ahmed, expenses)
    expect(rep.lines[0].date).toBe('2026-07-11')
  })
})

describe('buildDailySummary', () => {
  it('aggregates per day with a running cumulative total', () => {
    const rows = buildDailySummary(expenses)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ date: '2026-07-10', count: 2, total: 300, cumulative: 300 })
    expect(rows[1]).toEqual({ date: '2026-07-11', count: 1, total: 300, cumulative: 600 })
  })
})

describe('buildAccountStatement', () => {
  it('runs a chronological balance from the deposit down to remaining', () => {
    const st = buildAccountStatement(1000, ahmed, expenses)
    expect(st.opening).toBe(1000)
    expect(st.totalShare).toBe(350)
    expect(st.totalPaidByPocket).toBe(0)
    expect(st.remaining).toBe(650)
    // مرتّب زمنياً بـ createdAt تصاعدياً: e1(100)→900، e2(100)→800، e3(150)→650
    expect(st.rows.map(r => r.balanceAfter)).toEqual([900, 800, 650])
    expect(st.rows.every(r => r.kind === 'share')).toBe(true)
    expect(st.rows[0].id).toBe('e1:share')
    expect(st.rows[2].id).toBe('e3:share')
  })

  it('handles a traveler in only some expenses', () => {
    const st = buildAccountStatement(100, saad, expenses)
    // سعد: e1(100)→0، e3(150)→-150
    expect(st.rows.map(r => r.balanceAfter)).toEqual([0, -150])
    expect(st.remaining).toBe(-150)
  })

  it('credits an expense paid out of pocket, matching calculateBalances', () => {
    // أحمد دفع e2 (100) من جيبه بدل الصندوق، مع بقاء مشاركته في الثلاثة كما هي.
    const withPocketPay: Expense[] = expenses.map(e => e.id === 'e2' ? { ...e, paidBy: 1 } : e)
    const st = buildAccountStatement(1000, ahmed, withPocketPay)

    expect(st.totalPaidByPocket).toBe(100)
    expect(st.totalShare).toBe(350)
    // نفس صيغة calculateBalances بالضبط: المودَع + دفعه من جيبه − حصصه
    expect(st.remaining).toBe(1000 + 100 - 350)

    // e2 يُنتج سطرين: دفعه من جيبه (+100) وحصته فيه (−100) — أثرهما الصافي صفر،
    // بالضبط ما يحدث في calculateBalances لمن يدفع مصروفاً يشارك فيه هو نفسه.
    const e2Rows = st.rows.filter(r => r.id.startsWith('e2:'))
    expect(e2Rows.map(r => r.kind).sort()).toEqual(['paidByPocket', 'share'])
    expect(e2Rows.find(r => r.kind === 'paidByPocket')?.amount).toBe(100)
    expect(e2Rows.find(r => r.kind === 'share')?.amount).toBe(100)
  })

  it('excludes rollover-category expenses from the balance walk (closing side of a closed period)', () => {
    // أحمد أُغلق شهر يوليو له برصيد دائن 650 — مصروف الترحيل يقع تاريخياً
    // *داخل* يوليو (نهايته)، فلو دخل في حساب "المتبقي" هنا لضاعف نفس المبلغ.
    const withRollover: Expense[] = [
      ...expenses,
      { id: 'r1', date: '2026-07-31', description: 'ترحيل', amount: 650, originalAmount: 650,
        currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 99, category: ROLLOVER_CATEGORY },
    ]
    const st = buildAccountStatement(1000, ahmed, withRollover.filter(e => e.category !== ROLLOVER_CATEGORY))
    expect(st.remaining).toBe(650) // 1000 - 350، بلا أثر لمصروف الترحيل
  })

  it('credits an expense paid out of pocket for a non-participant too', () => {
    // سعد دفع e2 من جيبه لكنه لم يشارك فيها (participants: [1] فقط).
    const withPocketPay: Expense[] = expenses.map(e => e.id === 'e2' ? { ...e, paidBy: 2 } : e)
    const st = buildAccountStatement(100, saad, withPocketPay)

    expect(st.totalPaidByPocket).toBe(100)
    // لا يشارك في e2 فلا سطر 'share' له عنها — فقط سطر 'paidByPocket'.
    expect(st.rows.filter(r => r.id.startsWith('e2:'))).toEqual([
      expect.objectContaining({ id: 'e2:paidByPocket', kind: 'paidByPocket', amount: 100 }),
    ])
    // المودَع(100) + دفعه من جيبه(100) − حصصه في e1 وe3(250) = −50
    expect(st.remaining).toBe(100 + 100 - 250)
  })
})

describe('buildMergedTimeline', () => {
  const log = (overrides: Partial<DepositLogEntry> = {}): DepositLogEntry => ({
    id: 'log-1',
    travelerId: 1,
    previousDeposited: 0,
    newDeposited: 1000,
    delta: 1000,
    mode: 'set',
    reason: null,
    changedByEmail: 'admin@example.com',
    changedByUid: 'admin-1',
    createdAt: 0,
    ...overrides,
  })

  it('بلا سجلات: legacyOpening = deposited كاملاً (كل الرصيد غير مُفسَّر بأي سطر)، وclosing = remaining', () => {
    const st = buildAccountStatement(1000, ahmed, expenses)
    const timeline = buildMergedTimeline(ahmed, expenses, [])
    expect(timeline.legacyOpening).toBe(1000)
    expect(timeline.rows.every(r => r.kind !== 'deposit')).toBe(true)
    expect(timeline.closing).toBe(st.remaining)
  })

  it('سجل واحد يفسّر كامل الرصيد: legacyOpening صفر، وclosing يطابق remaining كما تحسبه buildAccountStatement', () => {
    const st = buildAccountStatement(1000, ahmed, expenses)
    // خارج نطاق كل مصاريف الاختبار (createdAt: 1..3) — قبلها زمنياً.
    const timeline = buildMergedTimeline(ahmed, expenses, [log({ createdAt: -1 })])
    expect(timeline.legacyOpening).toBe(0)
    expect(timeline.closing).toBe(st.remaining)
  })

  it('يدمج حركة الإيداع في مكانها الزمني الصحيح بين حركتي مصروف، لا في البداية أو النهاية', () => {
    // e1 (createdAt:1) ← سجل الإيداع (createdAt:2) ← e2 (createdAt:2 أيضاً، لكن e3 لاحقاً بوضوح)
    // نضع السجل بين e1 وe3 زمنياً (createdAt: 2.5) للتأكد من ترتيبه في المنتصف تحديداً لا الطرفين.
    const timeline = buildMergedTimeline(ahmed, expenses, [log({ createdAt: 2.5, delta: 500, newDeposited: 1500, previousDeposited: 1000 })])
    const kinds = timeline.rows.map(r => r.kind)
    // e1:share، e2:share، الإيداع، e3:share — بنفس ترتيب createdAt (1، 2، 2.5، 3)
    expect(kinds).toEqual(['share', 'share', 'deposit', 'share'])
  })

  it('يقصر فروقاً عائمة صغيرة جداً (أقل من 0.005) إلى صفر بدل «رصيد قديم غير موثَّق» زائف', () => {
    // 999.999999999 بدل 1000 بالضبط — فرق تراكمي نموذجي لأخطاء الفاصلة العائمة، لا رصيداً حقيقياً.
    const timeline = buildMergedTimeline(ahmed, expenses, [log({ createdAt: -1, newDeposited: 999.999999999, delta: 999.999999999 })])
    expect(timeline.legacyOpening).toBe(0)
  })

  it('رصيد قديم حقيقي (مسافر سابق لسجل التدقيق) يبقى ظاهراً — لا يُقصَر لأنه ليس خطأ فاصلة عائمة', () => {
    // نصف الرصيد فقط موثَّق بسجل؛ النصف الآخر أقدم من أي سجل تدقيق.
    const timeline = buildMergedTimeline(ahmed, expenses, [log({ createdAt: -1, newDeposited: 500, delta: 500 })])
    expect(timeline.legacyOpening).toBe(500)
  })
})

describe('buildCurrentPeriodTravelerSummaries', () => {
  // ⚠️ خطأ حقيقي أبلغ عنه المستخدم: «إجمالي المودَع» في تقرير الرحلة الكامل
  // كان خاطئاً لكل دورة اختبرها. السبب: الدالة القديمة (buildPeriodTravelerSummaries،
  // حُذفت — ReportsView.tsx لم يعد يعرض إلا الدورة الحالية) كانت تقرأ رصيد حدّ
  // إغلاق جامد (periodOpeningBalance)، فتسقط إلى opening=0 لمجرّد أن الدورة
  // الحالية لم تُغلق بعد (لا مصروف ترحيل، ولا lastClosedPeriod)، رغم أن رصيد
  // كل مسافر الحقيقي معروف تماماً من balances الحيّة. هذه الدالة تحلّ محلها
  // للدورة الحالية — نفس حيلة TravelerProfileModal الجبرية (commit 974db32).
  it('يشتقّ المودَع جبرياً من الرصيد الحيّ — لا "لا معلومة" حتى بلا رصيد إغلاق سابق معروف', () => {
    const liveBalances = calculateBalances([ahmed, saad], expenses)
    const [ahmedSummary, saadSummary] = buildCurrentPeriodTravelerSummaries([ahmed, saad], liveBalances, expenses, '2026-07')

    // أحمد: أودع 1000 فعلاً، ونصيبه 350 — المودَع المشتقّ هنا يجب أن يطابق
    // 1000 (deposited الحقيقي) لا 0 كما كانت الدالة القديمة تُظهر.
    expect(ahmedSummary).toMatchObject({ id: 1, opening: 1000, hasKnownOpening: true, spent: 350, closing: 650 })
    expect(saadSummary).toMatchObject({ id: 2, opening: 100, hasKnownOpening: true, spent: 250, closing: -150 })
  })

  it('إيداع أُضيف خلال الدورة الحالية يظهر كاملاً في المودَع — لا يختفي كما في الخطأ المُبلَّغ عنه', () => {
    // أحمد أضاف 500 لرصيده *بعد* آخر إغلاق (نفس ما يحدث فعلياً: DepositModal
    // يكتب depositLogs مباشرة، فيرتفع traveler.deposited الحيّ دون أي مصروف
    // ترحيل يعكس ذلك). الدالة القديمة كانت تتجاهله تماماً لأنها تقرأ رصيد حدّ
    // الإغلاق الجامد فقط.
    const ahmedWithMidCycleDeposit: Traveler = { ...ahmed, deposited: 1500 }
    const liveBalances = calculateBalances([ahmedWithMidCycleDeposit, saad], expenses)
    const [ahmedSummary] = buildCurrentPeriodTravelerSummaries([ahmedWithMidCycleDeposit, saad], liveBalances, expenses, '2026-07')

    // المودَع = 1500 (deposited الحقيقي بعد الإيداع) — لا 1000 القديم ولا 0.
    expect(ahmedSummary.opening).toBe(1500)
    expect(ahmedSummary.closing).toBe(1150) // 1500 - 350
  })
})

describe('buildPeriodOverview', () => {
  const augustExpense: Expense = {
    id: 'e4', date: '2026-08-05', description: 'بنزين', amount: 100, originalAmount: 100,
    currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 101, category: 'مواصلات',
  }
  const rollover: Expense = {
    id: 'r1', date: '2026-07-31', description: 'ترحيل', amount: 650, originalAmount: 650,
    currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 99, category: ROLLOVER_CATEGORY,
  }

  it('يجمّع بالدورة الشهرية لا باليوم — بلا مجموع تراكمي (الرصيد يُرحَّل فعلياً بين الدورات)', () => {
    const rows = buildPeriodOverview([...expenses, rollover, augustExpense], ['2026-07', '2026-08'])
    expect(rows).toEqual([
      { period: '2026-07', label: 'يوليو 2026', count: 3, spent: 600 },
      { period: '2026-08', label: 'أغسطس 2026', count: 1, spent: 100 },
    ])
  })

  it('يستبعد مصاريف الترحيل — لا تُحتسب صرفاً حقيقياً ولا تُضاعف رصيداً', () => {
    const rows = buildPeriodOverview([...expenses, rollover], ['2026-07'])
    // 600 (المصاريف الحقيقية فقط) لا 1250 (600 + 650 الترحيل)
    expect(rows[0].spent).toBe(600)
  })

  it('دورة بلا أي مصروف تظهر بصفر — لا تختفي من القائمة', () => {
    const rows = buildPeriodOverview(expenses, ['2026-07', '2026-08', '2026-09'])
    expect(rows[2]).toEqual({ period: '2026-09', label: 'سبتمبر 2026', count: 0, spent: 0 })
  })
})
