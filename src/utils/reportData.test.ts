import { describe, it, expect } from 'vitest'
import type { Expense, Traveler } from '../types'
import { buildTravelerReport, buildDailySummary, buildAccountStatement, buildPeriodTravelerSummaries } from './reportData'
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

describe('buildPeriodTravelerSummaries', () => {
  // منى: لم تشارك في أي مصروف، رصيدها مسوّى (صفر) طوال الوقت — closeMonth لا
  // يكتب لها مصروف ترحيل عند الإغلاق أصلاً (انظر settlementDirection). هذه
  // هي الحالة التي كشفها e2e فعلاً: غياب مصروف الترحيل لا يعني «لا معلومة»
  // إن كانت الدورة السابقة أُغلقت فعلاً.
  const mona: Traveler = { id: 3, name: 'منى', shortName: 'منى', deposited: 0, deletedAt: null }

  // سيناريو إغلاق حقيقي: يوليو (expenses أعلاه) يُغلق — أحمد دائن 650
  // (1000−350)، سعد مدين 150 (100−250) — بنفس شكل مصاريف الترحيل التي يكتبها
  // closeMonth فعلاً (buildAdjustmentExpense في functions/index.js). ثم
  // مصروف واحد جديد في أغسطس، 100 مناصفةً بينهما.
  const withRollover: Expense[] = [
    ...expenses,
    { id: 'r-credit', date: '2026-07-31', description: 'ترحيل رصيد أحمد', amount: 650, originalAmount: 650,
      currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 99, category: 'تسوية شهرية' },
    { id: 'r-debt', date: '2026-08-01', description: 'عجز مُرحَّل — سعد', amount: 150, originalAmount: 150,
      currency: 'SAR', exchangeRate: 1, participants: [2], createdAt: 100, category: 'تسوية شهرية' },
    { id: 'e4', date: '2026-08-05', description: 'بنزين', amount: 100, originalAmount: 100,
      currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 101 },
  ]

  it('يشتقّ افتتاح/صرف/إغلاق دورة أغسطس من ترحيل يوليو الفعلي', () => {
    const [ahmedSummary, saadSummary] = buildPeriodTravelerSummaries([ahmed, saad], withRollover, '2026-08', '2026-07')

    expect(ahmedSummary).toMatchObject({ id: 1, opening: 650, hasKnownOpening: true, spent: 50, closing: 600 })
    expect(saadSummary).toMatchObject({ id: 2, opening: -150, hasKnownOpening: true, spent: 50, closing: -200 })
  })

  // ⚠️ الجوهر المكتشَف فعلاً عبر e2e (long-term-rollover.spec.ts): بلا
  // lastClosedPeriod كانت منى تظهر «مجهولة الافتتاح» رغم أن يوليو أُغلق
  // فعلاً — لمجرّد أن closeMonth لم يكتب لها مصروف ترحيل (رصيدها صفر أصلاً).
  it('مسافر مسوّى عند إغلاق فعلي — افتتاح صفر معروف لا مجهول', () => {
    const [, , monaSummary] = buildPeriodTravelerSummaries([ahmed, saad, mona], withRollover, '2026-08', '2026-07')
    expect(monaSummary).toMatchObject({ id: 3, opening: 0, hasKnownOpening: true, spent: 0, closing: 0 })
  })

  it('دورة يوليو نفسها — لا افتتاح معروف (أول دورة، لا lastClosedPeriod)، والصرف لا يشمل مصروف الترحيل', () => {
    const [ahmedSummary, saadSummary] = buildPeriodTravelerSummaries([ahmed, saad], withRollover, '2026-07', null)

    // ⚠️ hasKnownOpening=false تعني أن opening (0) وclosing المُشتقّ منه *كلاهما*
    // بلا معنى مالي حقيقي هنا — لا رصيد افتتاحي حقيقي معروف لأول دورة في
    // الرحلة (يحتاج deposited الأصلي وقتها، لا التراكمي الحالي). المعروف
    // بثقة هو الصرف الحقيقي وحده، وهو ما يفحصه هذا الاختبار.
    expect(ahmedSummary.hasKnownOpening).toBe(false)
    // 350 لا 1000 (650 ترحيل + 350 حقيقي) — لولا استبعاد فئة الترحيل لتضاعف الرقم.
    expect(ahmedSummary.spent).toBe(350)
    expect(saadSummary.spent).toBe(250)
  })

  // الاتّساق بين الإغلاق والافتتاح مُثبَت مباشرة على boundaryRolloverAmount
  // نفسها في longTerm.test.ts («إغلاق دورة = افتتاح الدورة التالية») — لا
  // تكرار له هنا عبر buildPeriodTravelerSummaries، إذ حالة يوليو تحديداً
  // (hasKnownOpening=false) تجعل مقارنة closing بـopening الشهر التالي غير
  // ذات معنى كما شُرح في الاختبار أعلاه.
})
