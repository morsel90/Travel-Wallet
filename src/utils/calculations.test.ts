import { describe, it, expect } from 'vitest'
import {
  splitEven,
  splitByShares,
  calculateBalances,
  calculateTotalSpent,
  calculateTotalDeposited,
  calculateSettlements,
  calculateCategoryTotals,
  calculateSpendingTrend,
} from './calculations'
import type { Traveler, Expense, TravelerBalance } from '../types'

// ─── بيانات اختبار مشتركة ─────────────────────────────────────────────────────
const travelers: Traveler[] = [
  { id: 1, name: 'محمد العاثم',  shortName: 'محمد',  deposited: 1000 },
  { id: 2, name: 'عيسى آل شبير', shortName: 'عيسى',  deposited: 500  },
  { id: 3, name: 'فرحان الملا',  shortName: 'فرحان', deposited: 0    },
]

// مُنشئ مصروف مختصر — يملأ الحقول الإلزامية ويسمح بتجاوز ما يلزم
const mkExpense = (over: Partial<Expense>): Expense => ({
  id: 'x',
  date: '2024-01-01',
  description: 'اختبار',
  amount: 0,
  originalAmount: 0,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [],
  createdAt: 0,
  ...over,
})

// ─── splitEven ────────────────────────────────────────────────────────────────
describe('splitEven', () => {
  it('يقسّم بالتساوي عند القسمة الكاملة', () => {
    expect(splitEven(300, 3)).toEqual([100, 100, 100])
  })

  it('يوزّع الباقي بالهللات على الأوائل', () => {
    expect(splitEven(100, 3)).toEqual([33.34, 33.33, 33.33])
  })

  it('مجموع الحصص يساوي المبلغ الأصلي دائماً', () => {
    for (const [total, n] of [[100, 3], [10, 7], [0.1, 3], [999.99, 4]] as const) {
      const sum = splitEven(total, n).reduce((a, b) => a + b, 0)
      expect(Math.round(sum * 100)).toBe(Math.round(total * 100))
    }
  })

  it('يُرجِع مصفوفة فارغة عند عدد مشاركين غير صالح', () => {
    expect(splitEven(100, 0)).toEqual([])
  })
})

// ─── splitByShares (🆕 تقسيم غير متساوٍ) ───────────────────────────────────────
describe('splitByShares', () => {
  it('يطابق splitEven تماماً عند غياب shares', () => {
    expect(splitByShares(100, [1, 2, 3], undefined)).toEqual(splitEven(100, 3))
  })

  it('يطابق splitEven تماماً عند خريطة shares فارغة', () => {
    expect(splitByShares(100, [1, 2, 3], {})).toEqual(splitEven(100, 3))
  })

  it('"ضعف الحصة": مشارك بوزن 2 يأخذ ضعف من له وزن 1', () => {
    // 300 على 3 أوزان (1، 1، 2) = مجموع 4 حصص → 75 لكل حصة
    const result = splitByShares(300, [1, 2, 3], { '1': 1, '2': 1, '3': 2 })
    expect(result).toEqual([75, 75, 150])
  })

  it('وزن غير محدد لمشارك = وزن 1 افتراضياً', () => {
    // المشارك 3 بلا وزن محدد → 1 (نفس المشارك 1)، والمشارك 2 وزنه 3
    const result = splitByShares(500, [1, 2, 3], { '2': 3 })
    const sum = result.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100)).toBe(50000)
    expect(result[1]).toBeGreaterThan(result[0])
    expect(result[0]).toBe(result[2])
  })

  it('وزن سالب أو صفر أو غير رقمي دفاعياً = وزن 1 (لا ينهار ولا يُنتج قسمة على صفر)', () => {
    const result = splitByShares(100, [1, 2], { '1': -5, '2': 0 })
    expect(result).toEqual(splitEven(100, 2))
  })

  it('مجموع الحصص يساوي المبلغ الأصلي دائماً حتى مع أوزان تسبب كسوراً', () => {
    const result = splitByShares(100, [1, 2, 3], { '1': 1, '2': 3, '3': 5 })
    const sum = result.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100)).toBe(10000)
  })
})

// ─── calculateTotalDeposited ──────────────────────────────────────────────────
describe('calculateTotalDeposited', () => {
  it('يجمع كل المبالغ المودعة', () => {
    expect(calculateTotalDeposited(travelers)).toBe(1500)
  })

  it('يُرجِع صفراً لقائمة فارغة', () => {
    expect(calculateTotalDeposited([])).toBe(0)
  })
})

// ─── calculateTotalSpent ──────────────────────────────────────────────────────
describe('calculateTotalSpent', () => {
  it('يجمع مبالغ كل المصاريف (بالريال)', () => {
    const expenses = [
      mkExpense({ amount: 300 }),
      mkExpense({ amount: 150 }),
      mkExpense({ amount: 50.5 }),
    ]
    expect(calculateTotalSpent(expenses)).toBe(500.5)
  })

  it('يُرجِع صفراً لقائمة فارغة', () => {
    expect(calculateTotalSpent([])).toBe(0)
  })
})

// ─── calculateBalances ────────────────────────────────────────────────────────
describe('calculateBalances', () => {
  it('بدون مصاريف: remaining = deposited و totalExpenses = 0', () => {
    const balances = calculateBalances(travelers, [])
    expect(balances.map(b => b.totalExpenses)).toEqual([0, 0, 0])
    expect(balances.map(b => b.remaining)).toEqual([1000, 500, 0])
  })

  it('يوزّع المصروف بالتساوي على المشاركين', () => {
    const expenses = [
      mkExpense({ amount: 300, participants: [1, 2, 3] }),
    ]
    const balances = calculateBalances(travelers, expenses)
    // الحصة = 300 / 3 = 100 لكل مشارك
    expect(balances[0]).toMatchObject({ shortName: 'محمد',  totalExpenses: 100, remaining: 900 })
    expect(balances[1]).toMatchObject({ shortName: 'عيسى',  totalExpenses: 100, remaining: 400 })
    expect(balances[2]).toMatchObject({ shortName: 'فرحان', totalExpenses: 100, remaining: -100 })
  })

  it('يحمّل المشاركين المحددين فقط دون غيرهم', () => {
    const expenses = [
      mkExpense({ amount: 200, participants: [1, 2] }),
    ]
    const balances = calculateBalances(travelers, expenses)
    expect(balances[0].totalExpenses).toBe(100) // محمد
    expect(balances[1].totalExpenses).toBe(100) // عيسى
    expect(balances[2].totalExpenses).toBe(0)   // فرحان لم يشارك
  })

  it('يراكم حصص عدة مصاريف على نفس المسافر', () => {
    const expenses = [
      mkExpense({ amount: 100, participants: [1] }),
      mkExpense({ amount: 60,  participants: [1, 2] }),
    ]
    const balances = calculateBalances(travelers, expenses)
    // محمد: 100 + 30 = 130
    expect(balances[0].totalExpenses).toBe(130)
    expect(balances[0].remaining).toBe(870)
    // عيسى: 30
    expect(balances[1].totalExpenses).toBe(30)
  })

  it('يطابق المشاركين بالمعرّف الرقمي (id)', () => {
    const expenses = [mkExpense({ amount: 300, participants: [1, 2, 3] })]
    const balances = calculateBalances(travelers, expenses)
    expect(balances.map(b => b.totalExpenses)).toEqual([100, 100, 100])
  })

  it('القسمة غير المتساوية: يوزّع الباقي ويُبقي المجموع دقيقاً', () => {
    const expenses = [
      mkExpense({ amount: 100, participants: [1, 2, 3] }),
    ]
    const balances = calculateBalances(travelers, expenses)
    expect(balances[0].totalExpenses).toBe(33.34) // محمد (أول مشارك يأخذ الهللة الزائدة)
    expect(balances[1].totalExpenses).toBe(33.33) // عيسى
    expect(balances[2].totalExpenses).toBe(33.33) // فرحان
    const sumShares = balances.reduce((s, b) => s + b.totalExpenses, 0)
    expect(Math.round(sumShares * 100)).toBe(10000) // = 100.00 ريال بالضبط
  })

  it('يتجاهل المصروف بلا مشاركين (تجنّب القسمة على صفر)', () => {
    const expenses = [mkExpense({ amount: 500, participants: [] })]
    const balances = calculateBalances(travelers, expenses)
    expect(balances.every(b => b.totalExpenses === 0)).toBe(true)
  })

  it('يتجاهل معرّف مشارك لا يطابق أي مسافر دون أن ينهار', () => {
    const expenses = [
      mkExpense({ amount: 90, participants: [1, 999] }),
    ]
    const balances = calculateBalances(travelers, expenses)
    // الحصة تُحسب على أساس عدد المشاركين (2) = 45، لكن تُطبَّق على محمد فقط
    expect(balances[0].totalExpenses).toBe(45)
    expect(balances[1].totalExpenses).toBe(0)
    expect(balances[2].totalExpenses).toBe(0)
  })

  it('لا يطفر على المصفوفة الأصلية للمسافرين', () => {
    const snapshot = JSON.parse(JSON.stringify(travelers))
    calculateBalances(travelers, [mkExpense({ amount: 30, participants: [1] })])
    expect(travelers).toEqual(snapshot)
  })

  // 🆕 تقسيم غير متساوٍ عبر shares
  it('يوزّع المصروف حسب shares (تقسيم غير متساوٍ) بدل التساوي عند وجودها', () => {
    const expenses = [
      // فرحان (id=3) يدفع ضعف حصة الآخرين
      mkExpense({ amount: 400, participants: [1, 2, 3], shares: { '1': 1, '2': 1, '3': 2 } }),
    ]
    const balances = calculateBalances(travelers, expenses)
    expect(balances[0].totalExpenses).toBe(100) // محمد: حصة عادية
    expect(balances[1].totalExpenses).toBe(100) // عيسى: حصة عادية
    expect(balances[2].totalExpenses).toBe(200) // فرحان: ضعف الحصة
  })
})

// مُنشئ رصيد مختصر لاختبار calculateSettlements (لا يحتاج لعبور calculateBalances)
const mkBalance = (over: Partial<TravelerBalance>): TravelerBalance => ({
  id: 0, name: '', shortName: '', deposited: 0, totalExpenses: 0, remaining: 0,
  ...over,
})

// ─── calculateSettlements ─────────────────────────────────────────────────────
describe('calculateSettlements', () => {
  it('لا تحويلات مقترحة عندما تكون كل الأرصدة متزنة (صفر تقريباً)', () => {
    const balances = [mkBalance({ id: 1, name: 'أ', remaining: 0 }), mkBalance({ id: 2, name: 'ب', remaining: 0.001 })]
    expect(calculateSettlements(balances)).toEqual([])
  })

  it('حالة بسيطة: مدين واحد ودائن واحد بنفس المبلغ', () => {
    const balances = [
      mkBalance({ id: 1, name: 'محمد', remaining: -100 }),
      mkBalance({ id: 2, name: 'عيسى', remaining: 100 }),
    ]
    expect(calculateSettlements(balances)).toEqual([
      { fromId: 1, fromName: 'محمد', toId: 2, toName: 'عيسى', amount: 100 },
    ])
  })

  it('مجموع مبالغ التحويلات المقترحة يساوي إجمالي الديون دائماً', () => {
    const balances = [
      mkBalance({ id: 1, name: 'أ', remaining: -300 }),
      mkBalance({ id: 2, name: 'ب', remaining: -50 }),
      mkBalance({ id: 3, name: 'ج', remaining: 200 }),
      mkBalance({ id: 4, name: 'د', remaining: 150 }),
    ]
    const settlements = calculateSettlements(balances)
    const totalTransferred = settlements.reduce((s, x) => s + x.amount, 0)
    expect(Math.round(totalTransferred * 100)).toBe(35000) // = 350.00 (إجمالي الديون = إجمالي الدائنين هنا)
  })

  it('يتجاهل الأرصدة شبه الصفرية (فروق تقريب أقل من هللة)', () => {
    const balances = [mkBalance({ id: 1, name: 'أ', remaining: -0.005 }), mkBalance({ id: 2, name: 'ب', remaining: 0.005 })]
    expect(calculateSettlements(balances)).toEqual([])
  })

  // ─── تبسيط الديون ──────────────────────────────────────────────────────────
  // الاختبارات أدناه تثبّت أهم خاصية في هذه الدالة وأقلّها وضوحاً من قراءتها:
  // أنها تعمل على *صافي* الرصيد لا على حواف «من دفع لمن»، فتنهار السلاسل
  // تلقائياً ويختفي الوسيط. بدونها قد يُعاد كتابة الدالة لاحقاً بحيث تُدرج
  // الوسطاء دون أن يكسر ذلك أي اختبار قائم.

  it('يُسقط الوسيط: علي يدين لخالد ١٠٠ وخالد يدين لسارا ١٠٠ ⇒ علي يدفع لسارا مباشرة', () => {
    const balances = [
      mkBalance({ id: 1, name: 'علي',  remaining: -100 }),
      mkBalance({ id: 2, name: 'خالد', remaining: 0 }),   // صافيه صفر — وسيط بحت
      mkBalance({ id: 3, name: 'سارا', remaining: 100 }),
    ]
    expect(calculateSettlements(balances)).toEqual([
      { fromId: 1, fromName: 'علي', toId: 3, toName: 'سارا', amount: 100 },
    ])
  })

  it('ينهار سلسلة طويلة إلى معاملة واحدة مهما زاد عدد الوسطاء', () => {
    const balances = [
      mkBalance({ id: 1, name: 'أ',  remaining: -100 }),
      mkBalance({ id: 2, name: 'ب',  remaining: 0 }),
      mkBalance({ id: 3, name: 'ج',  remaining: 0 }),
      mkBalance({ id: 4, name: 'د',  remaining: 0 }),
      mkBalance({ id: 5, name: 'هـ', remaining: 100 }),
    ]
    const settlements = calculateSettlements(balances)
    expect(settlements).toHaveLength(1)
    expect(settlements[0].fromName).toBe('أ')
    expect(settlements[0].toName).toBe('هـ')
  })

  it('لا يتجاوز عدد المعاملات N-1 ويُصفّر كل الأرصدة', () => {
    const balances = [
      mkBalance({ id: 1, name: 'أحمد', remaining: -250 }),
      mkBalance({ id: 2, name: 'سعد',  remaining: -120 }),
      mkBalance({ id: 3, name: 'فهد',  remaining: -30 }),
      mkBalance({ id: 4, name: 'خالد', remaining: 180 }),
      mkBalance({ id: 5, name: 'نورة', remaining: 150 }),
      mkBalance({ id: 6, name: 'ريم',  remaining: 70 }),
    ]
    const settlements = calculateSettlements(balances)
    expect(settlements.length).toBeLessThanOrEqual(balances.length - 1)

    // بعد تنفيذ كل التحويلات يجب أن يصل رصيد كل شخص إلى صفر:
    // الرصيد + ما دفعه − ما استلمه = 0
    const net = new Map<string, number>()
    for (const s of settlements) {
      net.set(s.fromName, (net.get(s.fromName) ?? 0) + s.amount)
      net.set(s.toName,   (net.get(s.toName)   ?? 0) - s.amount)
    }
    for (const p of balances) {
      expect(Math.abs(p.remaining + (net.get(p.name) ?? 0))).toBeLessThan(0.01)
    }
  })

  it('لا يطلب من أحد أن يدفع لنفسه', () => {
    const balances = [
      mkBalance({ id: 1, name: 'أ', remaining: -50 }),
      mkBalance({ id: 2, name: 'ب', remaining: 50 }),
    ]
    for (const s of calculateSettlements(balances)) {
      expect(s.fromId).not.toBe(s.toId)
    }
  })
})

// ─── calculateCategoryTotals ──────────────────────────────────────────────────
describe('calculateCategoryTotals', () => {
  it('يجمع المبالغ حسب الفئة ويرتّب تنازلياً', () => {
    const expenses = [
      mkExpense({ amount: 100, category: 'طعام وشراب' }),
      mkExpense({ amount: 50,  category: 'طعام وشراب' }),
      mkExpense({ amount: 200, category: 'مواصلات' }),
    ]
    expect(calculateCategoryTotals(expenses)).toEqual([
      { category: 'مواصلات', total: 200 },
      { category: 'طعام وشراب', total: 150 },
    ])
  })

  it('يصنّف المصاريف بلا فئة محفوظة تحت "أخرى" (بيانات قديمة)', () => {
    const expenses = [mkExpense({ amount: 75 })] // بلا category — كحال المصاريف قبل هذا التعديل
    expect(calculateCategoryTotals(expenses)).toEqual([{ category: 'أخرى', total: 75 }])
  })

  it('يُرجِع مصفوفة فارغة لقائمة مصاريف فارغة', () => {
    expect(calculateCategoryTotals([])).toEqual([])
  })
})

// ─── calculateSpendingTrend ───────────────────────────────────────────────────
describe('calculateSpendingTrend', () => {
  it('يجمع مصاريف اليوم الواحد ويحسب المجموع التراكمي مرتّباً حسب التاريخ', () => {
    const expenses = [
      mkExpense({ amount: 100, date: '2024-03-02' }),
      mkExpense({ amount: 50,  date: '2024-03-01' }),
      mkExpense({ amount: 30,  date: '2024-03-01' }),
    ]
    expect(calculateSpendingTrend(expenses)).toEqual([
      { date: '2024-03-01', total: 80,  cumulative: 80 },
      { date: '2024-03-02', total: 100, cumulative: 180 },
    ])
  })

  it('يُرجِع مصفوفة فارغة لقائمة مصاريف فارغة', () => {
    expect(calculateSpendingTrend([])).toEqual([])
  })
})
