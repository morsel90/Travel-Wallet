import { describe, it, expect } from 'vitest'
import {
  ROLLOVER_EPSILON, ROLLOVER_CATEGORY, settlementDirection, planRollover, countRolloverMovements,
  describeExitBlock, describeOrganizerExitBlock, filterCycleExpenses, calculateCycleWallet,
  boundaryRolloverAmount, periodOpeningBalance, periodClosingBalance,
} from './longTerm'
import type { TravelerBalance, Expense } from '../types'

const balance = (over: Partial<TravelerBalance>): TravelerBalance => ({
  id: 1, name: 'سعد', shortName: 'سعد', deposited: 0,
  totalExpenses: 0, remaining: 0, ...over,
})

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e1', date: '2026-08-10', description: 'مصروف', amount: 100, originalAmount: 100,
  currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 0, ...over,
})

describe('settlementDirection', () => {
  it('يميّز الدائن من المدين', () => {
    expect(settlementDirection(150)).toBe('credit')
    expect(settlementDirection(-150)).toBe('debt')
  })

  // نفس عتبة calculateSettlements — رصيد شبه صفري ليس ديناً.
  it('يعتبر ما دون الهللة مسوّى', () => {
    expect(settlementDirection(0)).toBe('settled')
    expect(settlementDirection(ROLLOVER_EPSILON)).toBe('settled')
    expect(settlementDirection(-ROLLOVER_EPSILON)).toBe('settled')
    expect(settlementDirection(0.005)).toBe('settled')
  })

  // القاعدة ١٩ — رصيد غير منتهٍ لا تُبنى عليه حركة مالية.
  it('يعتبر الرصيد غير المنتهي مسوّى لا حركة', () => {
    expect(settlementDirection(NaN)).toBe('settled')
    expect(settlementDirection(Infinity)).toBe('settled')
    expect(settlementDirection(-Infinity)).toBe('settled')
  })
})

describe('planRollover', () => {
  it('يبني حركة لكل مسافر باتجاهها ومبلغها', () => {
    const plan = planRollover([
      balance({ id: 1, name: 'سعد',  remaining: 300 }),
      balance({ id: 2, name: 'خالد', remaining: -120.5 }),
      balance({ id: 3, name: 'سارة', remaining: 0 }),
    ])

    expect(plan).toEqual([
      { travelerId: 1, travelerName: 'سعد',  remaining: 300,    direction: 'credit' },
      { travelerId: 2, travelerName: 'خالد', remaining: -120.5, direction: 'debt' },
      { travelerId: 3, travelerName: 'سارة', remaining: 0,      direction: 'settled' },
    ])
  })

  it('يطهّر الرصيد غير المنتهي إلى صفر بدل تسريبه للمعاينة', () => {
    const [movement] = planRollover([balance({ remaining: NaN })])
    expect(movement.remaining).toBe(0)
    expect(movement.direction).toBe('settled')
  })

  it('يعدّ الحركات الفعلية دون المسوّين', () => {
    const plan = planRollover([
      balance({ id: 1, remaining: 300 }),
      balance({ id: 2, remaining: 0 }),
      balance({ id: 3, remaining: -5 }),
    ])
    expect(countRolloverMovements(plan)).toBe(2)
  })
})

describe('describeExitBlock', () => {
  // ⚠️ الحارس الأهم: الرحلة القياسية لا يتغيّر سلوكها بحرف.
  it('لا يمنع شيئاً في الرحلة القياسية مهما كان الرصيد', () => {
    expect(describeExitBlock('standard', 'سعد', 5000)).toBeNull()
    expect(describeExitBlock('standard', 'سعد', -5000)).toBeNull()
  })

  it('يسمح بالخروج عند رصيد مسوّى في الرحلة الطويلة', () => {
    expect(describeExitBlock('long_term', 'سعد', 0)).toBeNull()
    expect(describeExitBlock('long_term', 'سعد', ROLLOVER_EPSILON)).toBeNull()
  })

  it('يمنع الخروج ويسمّي المبلغ والاتجاه', () => {
    expect(describeExitBlock('long_term', 'سعد', 300)).toContain('له رصيد متبقٍّ 300.00 ريال')
    expect(describeExitBlock('long_term', 'خالد', -120.5)).toContain('عليه 120.50 ريال')
  })
})

describe('filterCycleExpenses', () => {
  it('يستبعد مصاريف الشهور الأخرى', () => {
    const result = filterCycleExpenses([
      expense({ id: 'a', date: '2026-08-05' }),
      expense({ id: 'b', date: '2026-07-31' }),
      expense({ id: 'c', date: '2026-09-01' }),
    ], '2026-08')
    expect(result.map(e => e.id)).toEqual(['a'])
  })

  // ⚠️ الجوهر: مصروف الترحيل الذي كتبه closeMonth مؤرَّخ داخل الشهر (افتتاحاً
  // لعجز، أو إغلاقاً لرصيد) لكنه محاسبة إغلاق لا إنفاق فعلي — عدّه ضمن «مصاريف
  // هذا الشهر» يُضاعف نفس المبلغ الذي أنتجه هو (انظر تعليق closeMonth).
  it('يستبعد مصاريف الترحيل رغم وقوعها داخل الشهر', () => {
    const result = filterCycleExpenses([
      expense({ id: 'real', date: '2026-08-05' }),
      expense({ id: 'rollover', date: '2026-08-01', category: ROLLOVER_CATEGORY }),
    ], '2026-08')
    expect(result.map(e => e.id)).toEqual(['real'])
  })
})

describe('calculateCycleWallet', () => {
  // ⚠️ الجوهر: مهما كانت القيمتان، محفظة الدورة ناقص مصاريفها يُعيد الرصيد
  // المتبقي نفسه دائماً — هذا هو الاتساق بين «رصيد الدورة» و«المتبقي» في
  // البطاقة/الهيدر، بلا اعتماد على أي مصدر بيانات آخر.
  it('يُعيد المتبقي نفسه عند طرح مصاريف الدورة من محفظتها', () => {
    for (const [remaining, spent] of [[800, 0], [-200, 0], [150.5, 320], [-90, 45]]) {
      const wallet = calculateCycleWallet(remaining, spent)
      expect(wallet - spent).toBeCloseTo(remaining, 10)
    }
  })
})

describe('boundaryRolloverAmount', () => {
  // نفس شكل buildAdjustmentExpense في functions/index.js بالضبط — تسمية
  // الحقول والقيم مطابقة لما يكتبه closeMonth فعلاً.
  const rollover = (date: string, amount: number, travelerId = 1) =>
    expense({ id: `r-${date}`, date, amount, category: ROLLOVER_CATEGORY, participants: [travelerId] })

  it('يقرأ رصيداً دائناً من مصروف الترحيل المؤرَّخ بنهاية الشهر السابق', () => {
    const expenses = [rollover('2026-08-31', 800)]
    expect(boundaryRolloverAmount(1, expenses, '2026-08', '2026-09')).toBe(800)
  })

  it('يقرأ عجزاً من مصروف الترحيل المؤرَّخ ببداية الشهر التالي', () => {
    const expenses = [rollover('2026-09-01', 200)]
    expect(boundaryRolloverAmount(1, expenses, '2026-08', '2026-09')).toBe(-200)
  })

  it('null حين لا يوجد أثر إغلاق بين الفترتين', () => {
    expect(boundaryRolloverAmount(1, [], '2026-08', '2026-09')).toBeNull()
  })

  it('لا يخلط بين مسافرين — رصيد مسافر آخر بنفس التاريخ لا يُطابَق', () => {
    const expenses = [rollover('2026-08-31', 800, 2)]
    expect(boundaryRolloverAmount(1, expenses, '2026-08', '2026-09')).toBeNull()
  })

  it('لا يخلط مصروفاً حقيقياً بنفس التاريخ مع مصروف ترحيل', () => {
    const expenses = [expense({ id: 'real', date: '2026-08-31', amount: 800, category: 'طعام وشراب' })]
    expect(boundaryRolloverAmount(1, expenses, '2026-08', '2026-09')).toBeNull()
  })
})

describe('periodOpeningBalance / periodClosingBalance', () => {
  it('إغلاق دورة = افتتاح الدورة التالية — نفس القراءة من زاويتين', () => {
    const expenses = [
      expense({ id: 'r', date: '2026-08-31', amount: 800, category: ROLLOVER_CATEGORY, participants: [1] }),
    ]
    expect(periodClosingBalance(1, expenses, '2026-08', '2026-08')).toBe(800)
    expect(periodOpeningBalance(1, expenses, '2026-09', '2026-08')).toBe(800)
  })

  it('أول دورة في الرحلة — لا افتتاح معروف (لا lastClosedPeriod أصلاً)', () => {
    expect(periodOpeningBalance(1, [], '2026-07', null)).toBeNull()
  })

  // ⚠️ الحالة التي كشفها e2e فعلاً: closeMonth لا يكتب شيئاً لمسافر رصيده
  // مسوّى (صفر) عند الإغلاق — غياب المصروف هنا لا يعني «لا معلومة» إن كانت
  // الدورة السابقة *أُغلقت* بالفعل (lastClosedPeriod يثبت ذلك).
  it('مسافر مسوّى عند إغلاق فعلي — افتتاح صفر معروف لا مجهول', () => {
    // لا مصروف ترحيل لهذا المسافر إطلاقاً (لم يكن له رصيد يُرحَّل)، لكن أغسطس
    // أُغلق فعلاً (lastClosedPeriod='2026-08') — فسبتمبر يفتتح بصفر معروف.
    expect(periodOpeningBalance(1, [], '2026-09', '2026-08')).toBe(0)
  })

  it('لا خلط بين «لم تُغلق بعد» و«أُغلقت ومسوّى» — lastClosedPeriod أقدم من المطلوب', () => {
    // آخر إغلاق كان يوليو — أغسطس نفسه لم يُغلق بعد، فسبتمبر لا يزال مجهول الافتتاح.
    expect(periodOpeningBalance(1, [], '2026-09', '2026-07')).toBeNull()
  })

  it('نفس المبدأ لـ periodClosingBalance — دورة أُغلقت ومسافرها مسوّى', () => {
    expect(periodClosingBalance(1, [], '2026-08', '2026-08')).toBe(0)
    expect(periodClosingBalance(1, [], '2026-08', '2026-07')).toBeNull()
  })
})

describe('describeOrganizerExitBlock', () => {
  it('يمنع منظّم الرحلة من إخراج نفسه', () => {
    expect(describeOrganizerExitBlock('uid-1', 'uid-1', 'محمد')).toContain('محمد')
  })

  // ⚠️ يثبّت **تسميات الواجهة** لا مجرّد وجود رسالة. النصّ كان يحيل إلى «تبويب
  // الأعضاء في إدارة الرحلة» بعد أن دُمج الأول في «المسافرون» وحُذف الثاني
  // (CHANGELOG 2026-08-29)، فظلّ يُرشد إلى مكان محذوف ولم يكشفه الاختبار أعلاه
  // لأنه يفحص اسم المسافر وحده. أي إعادة تسمية قادمة لتبويب TRIP_TABS أو لزرّ
  // تعيين المنظّم في TripDetailPanel.tsx يجب أن تُسقط هذا الاختبار.
  it('يُرشد إلى المسار الفعلي في الواجهة بتسمياته الحالية', () => {
    const message = describeOrganizerExitBlock('uid-1', 'uid-1', 'محمد')!
    expect(message).toContain('المسافرون')
    expect(message).toContain('تعيين منظّماً')
    // الشرط الذي يفسّر غياب الزرّ عند مسافر مسجَّل يدوياً بلا حساب مرتبط.
    expect(message).toContain('ربط حسابه')
    // تسميات لم تعد موجودة في الواجهة — وجودها هنا يعني رسالة تُرشد إلى العدم.
    expect(message).not.toContain('تبويب «الأعضاء»')
    expect(message).not.toContain('إدارة الرحلة')
  })

  it('لا يمنع عضواً عادياً مهما كان uid موجوداً', () => {
    expect(describeOrganizerExitBlock('uid-2', 'uid-1', 'سعد')).toBeNull()
  })

  it('لا يمنع شيئاً حين يغيب uid المسافر أو organizerUid', () => {
    expect(describeOrganizerExitBlock(null, 'uid-1', 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock(undefined, 'uid-1', 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock('uid-1', undefined, 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock('uid-1', null, 'سعد')).toBeNull()
  })
})
