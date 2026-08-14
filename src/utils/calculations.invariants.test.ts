import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  splitEven,
  splitByShares,
  calculateBalances,
  calculateSettlements,
  calculateTotalSpent,
  calculateTotalDeposited,
} from './calculations'
import type { Traveler, TravelerBalance, Expense } from '../types'

// ─── قواعد السلامة المالية (Financial Invariants) ─────────────────────────────
//
// هذه ليست اختبارات وحدوية بالمعنى المعتاد. الاختبار الوحدوي يقول «هذا المدخل
// يعطي هذا المخرج»؛ أما القاعدة هنا فتقول «مهما كان المدخل، يجب أن يبقى هذا
// صحيحاً». والفرق عملي: الاختبار الوحدوي يغطي ما فكّرتَ فيه، والقاعدة تغطي ما
// لم تفكّر فيه — وهو بالضبط ما يكسر تطبيق حسابات.
//
// التوليد بـ fast-check: كل قاعدة تُجرَّب على مئات الحالات المولّدة عشوائياً،
// وعند الفشل يُقلّص المولّد الحالة إلى أصغر مثال يعيد إنتاجها (shrinking) بدل
// أن يترك أمامك مصفوفة من ١٢ مصروفاً لا تدري أيّها السبب.
//
// ⚠️ عند فشل أي قاعدة هنا: الرقم المعروض في الواجهة خاطئ ولا يوجد ما يُنبّه
// المستخدم. لا تُضعِف القاعدة لتمرّ — إمّا أن السلوك خطأ فيُصلَح، أو أن القاعدة
// نفسها مصوغة خطأ فتُعاد صياغتها مع تعليق يشرح لماذا.
//
// ── ملاحظة على وحدة القياس ──────────────────────────────────────────────────
// كل الحسابات تعمل بالهللة (١/١٠٠ ريال) — انظر Math.round(total * 100) في
// splitEven. لذا تُصاغ قواعد الحفظ بالهللات لا بالريالات: المقارنة المباشرة بين
// أعداد الفاصلة العائمة (0.1 + 0.2 !== 0.3) تُفشل قاعدة صحيحة لسبب لا علاقة له
// بالمال. وهذا أيضاً يعني أن ما دون الهللة يُفقد بالتقريب عمداً — القاعدة ١
// تنصّ على حفظ *المبلغ مقرَّباً إلى الهللة*، وهو أقوى ما يمكن ضمانه بصدق.

// ─── مولّدات (Arbitraries) ────────────────────────────────────────────────────

/** مبلغ مالي صالح: عدد صحيح من الهللات مقسوماً على ١٠٠ — لا يُنتج قيماً دون الهللة. */
const money = (minHalalas: number, maxHalalas: number) =>
  fc.integer({ min: minHalalas, max: maxHalalas }).map(h => h / 100)

/** رصيد قد يكون موجباً أو سالباً (دائن أو مدين). */
const signedMoney = (maxHalalas: number) => money(-maxHalalas, maxHalalas)

const travelerIds = fc.uniqueArray(fc.integer({ min: 1, max: 999 }), {
  minLength: 1,
  maxLength: 8,
})

const mkTraveler = (id: number, deposited: number): Traveler => ({
  id,
  name: `مسافر ${id}`,
  shortName: `م${id}`,
  deposited,
})

const mkExpense = (over: Partial<Expense>): Expense => ({
  id: 'x',
  date: '2026-01-01',
  description: 'مصروف',
  amount: 0,
  originalAmount: 0,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [],
  createdAt: 0,
  ...over,
})

/**
 * «دفتر» كامل: مسافرون بمبالغ مودعة، ومصاريف يشارك فيها مسافرون موجودون فعلاً.
 * القيد المهم: كل مشارك يقابله مسافر في القائمة — لأن المشارك غير المطابق له
 * سلوك مختلف مقصود، ويُختبر منفصلاً أدناه.
 */
const bookArb = travelerIds.chain(ids =>
  fc
    .record({
      deposits: fc.array(money(0, 1_000_000), {
        minLength: ids.length,
        maxLength: ids.length,
      }),
      expenses: fc.array(
        fc.subarray(ids, { minLength: 1 }).chain(participants =>
          fc.record({
            amount: money(1, 500_000),
            participants: fc.constant(participants),
            shares: fc.oneof(
              fc.constant(undefined),
              fc
                .array(fc.integer({ min: 1, max: 1000 }), {
                  minLength: participants.length,
                  maxLength: participants.length,
                })
                .map(ws =>
                  Object.fromEntries(
                    participants.map((p, i) => [String(p), ws[i] / 100]),
                  ),
                ),
            ),
          }),
        ),
        { maxLength: 12 },
      ),
    })
    .map(({ deposits, expenses }) => ({
      travelers: ids.map((id, i) => mkTraveler(id, deposits[i])),
      expenses: expenses.map((e, i) =>
        mkExpense({ id: `e${i}`, amount: e.amount, participants: e.participants, shares: e.shares }),
      ),
    })),
)

/** أرصدة جاهزة للتسوية — تُولَّد مباشرة بدل اشتقاقها، لتغطية توزيعات لا ينتجها دفتر عادي. */
const balancesArb = travelerIds.chain(ids =>
  fc
    .array(signedMoney(100_000), { minLength: ids.length, maxLength: ids.length })
    .map(remainings =>
      ids.map((id, i): TravelerBalance => ({
        ...mkTraveler(id, 0),
        totalExpenses: 0,
        remaining: remainings[i],
      })),
    ),
)

// ─── أدوات ────────────────────────────────────────────────────────────────────

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** تحويل إلى هللات — وحدة المقارنة الوحيدة الصادقة في هذا الملف. */
const halalas = (x: number) => Math.round(x * 100)

const RUNS = { numRuns: 500 }

// ─── القاعدة ١: مجموع الحصص = مبلغ المصروف ────────────────────────────────────
// لا تُخلق هللة ولا تُفقد هللة عند التقسيم. كسر هذه القاعدة يعني أن مجموع ما
// يدين به المشاركون لا يساوي ما دُفع فعلاً — أي أن الدفتر لا يتوازن من أول خطوة.

describe('قاعدة ١ — مجموع الحصص يساوي مبلغ المصروف', () => {
  it('splitEven يحفظ المبلغ مهما كان عدد المشاركين', () => {
    fc.assert(
      fc.property(money(1, 500_000), fc.integer({ min: 1, max: 30 }), (total, n) => {
        expect(halalas(sum(splitEven(total, n)))).toBe(halalas(total))
      }),
      RUNS,
    )
  })

  it('splitByShares يحفظ المبلغ بأوزان صحيحة أو كسرية', () => {
    fc.assert(
      fc.property(
        money(1, 500_000),
        fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          const ids = weights.map((_, i) => i + 1)
          const shares = Object.fromEntries(ids.map((id, i) => [String(id), weights[i] / 100]))
          expect(halalas(sum(splitByShares(total, ids, shares)))).toBe(halalas(total))
        },
      ),
      RUNS,
    )
  })

  it('splitByShares يطابق splitEven عند غياب الأوزان أو بطلانها جميعاً', () => {
    fc.assert(
      fc.property(money(1, 500_000), fc.integer({ min: 1, max: 12 }), (total, n) => {
        const ids = Array.from({ length: n }, (_, i) => i + 1)
        // وزن ٠ أو سالب يُعامَل كوزن ١ (انظر splitByShares) — فالنتيجة قسمة متساوية
        const allInvalid = Object.fromEntries(ids.map(id => [String(id), 0]))
        expect(splitByShares(total, ids, undefined)).toEqual(splitEven(total, n))
        expect(splitByShares(total, ids, allInvalid)).toEqual(splitEven(total, n))
      }),
      RUNS,
    )
  })

  it('لا حصة سالبة عندما يكون المبلغ موجباً', () => {
    fc.assert(
      fc.property(
        money(1, 500_000),
        fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          const ids = weights.map((_, i) => i + 1)
          const shares = Object.fromEntries(ids.map((id, i) => [String(id), weights[i] / 100]))
          for (const share of splitByShares(total, ids, shares)) {
            expect(share).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      RUNS,
    )
  })

  it('فرق الحصص في القسمة المتساوية لا يتجاوز هللة واحدة', () => {
    // يمنع انحيازاً صامتاً في توزيع الباقي: لو تراكم الباقي على شخص واحد لظهر هنا.
    fc.assert(
      fc.property(money(1, 500_000), fc.integer({ min: 1, max: 30 }), (total, n) => {
        const shares = splitEven(total, n)
        expect(halalas(Math.max(...shares) - Math.min(...shares))).toBeLessThanOrEqual(1)
      }),
      RUNS,
    )
  })
})

// ─── القاعدة ٢: حفظ المال عبر الأرصدة ─────────────────────────────────────────
// معادلة الدفتر: كل هللة أُنفقت نُسبت إلى مسافر، ورصيد كل مسافر هو ما أودعه ناقص
// ما نُسب إليه. كسرها يعني ظهور مال من العدم أو اختفاؤه — وهو أسوأ عطل ممكن في
// تطبيق تقسيم مصاريف، لأنه لا يرمي خطأً ولا يُلاحَظ حتى تُنازَع تسوية.

describe('قاعدة ٢ — حفظ المال في الأرصدة', () => {
  it('remaining = deposited − totalExpenses لكل مسافر', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        for (const b of calculateBalances(travelers, expenses)) {
          expect(b.remaining).toBeCloseTo(b.deposited - b.totalExpenses, 9)
        }
      }),
      RUNS,
    )
  })

  it('مجموع ما نُسب للمسافرين = مجموع المصاريف (لا مال يُخلق أو يُفقد)', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        const balances = calculateBalances(travelers, expenses)
        const attributed = halalas(sum(balances.map(b => b.totalExpenses)))
        const spent = expenses.reduce((s, e) => s + halalas(e.amount), 0)
        expect(attributed).toBe(spent)
      }),
      RUNS,
    )
  })

  it('مجموع الأرصدة المتبقية = مجموع الإيداعات − مجموع المصاريف', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        const balances = calculateBalances(travelers, expenses)
        const totalRemaining = halalas(sum(balances.map(b => b.remaining)))
        const totalDeposited = halalas(sum(travelers.map(t => t.deposited)))
        const totalSpent = expenses.reduce((s, e) => s + halalas(e.amount), 0)
        expect(totalRemaining).toBe(totalDeposited - totalSpent)
      }),
      RUNS,
    )
  })

  it('لا مسافر يتحمّل حصة سالبة', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        for (const b of calculateBalances(travelers, expenses)) {
          expect(b.totalExpenses).toBeGreaterThanOrEqual(0)
        }
      }),
      RUNS,
    )
  })

  it('الحساب لا يعدّل مدخلاته (نقاء الدالة)', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        const before = JSON.stringify({ travelers, expenses })
        calculateBalances(travelers, expenses)
        expect(JSON.stringify({ travelers, expenses })).toBe(before)
      }),
      RUNS,
    )
  })

  it('مشارك لا يقابله مسافر: حصته تتسرّب من الدفتر — سلوك موثّق لا مضمون', () => {
    // calculateBalances تتجاهل المشارك الذي لا يطابق أي مسافر (b.find → undefined).
    // النتيجة أن المجموع المنسوب أقل من المصروف. هذا مقبول اليوم لأن الحذف لَيّن
    // (المسافر يبقى في المصفوفة) — لكنه يصبح خطأ صامتاً إن مُرِّرت يوماً قائمة
    // «المسافرين النشطين» فقط بدل الكاملة. هذا الاختبار يُثبّت الافتراض ليُكشف
    // حينها بدل أن يمرّ بصمت.
    const travelers = [mkTraveler(1, 100)]
    const balances = calculateBalances(travelers, [
      mkExpense({ amount: 100, participants: [1, 99] }),
    ])
    expect(balances[0].totalExpenses).toBe(50)
    expect(sum(balances.map(b => b.totalExpenses))).toBeLessThan(100)
  })
})

// ─── القاعدة ٣: التسويات تغطي الدين ───────────────────────────────────────────
// ⚠️ صياغة دقيقة: مجموع التسويات = min(إجمالي الدين, إجمالي الائتمان) وليس
// «إجمالي الدين» مطلقاً. السبب أن remaining = deposited − share، فمجموع الأرصدة
// يساوي فائض الصندوق أو عجزه ولا يساوي صفراً إلا مصادفةً. فإن كان الصندوق فائضاً
// بقي دائنون بلا مقابل، وإن كان عاجزاً بقي مدينون. صياغة «= إجمالي الدين» كانت
// ستفشل على دفتر سليم تماماً.

describe('قاعدة ٣ — التسويات تطابق الدين المستحق', () => {
  const debtOf = (bs: TravelerBalance[]) =>
    sum(bs.filter(b => b.remaining < -0.01).map(b => -b.remaining))
  const creditOf = (bs: TravelerBalance[]) =>
    sum(bs.filter(b => b.remaining > 0.01).map(b => b.remaining))

  it('مجموع التسويات = min(الدين, الائتمان)', () => {
    fc.assert(
      fc.property(balancesArb, balances => {
        const settlements = calculateSettlements(balances)
        const expected = Math.min(debtOf(balances), creditOf(balances))
        // التسامح: EPSILON = هللة واحدة لكل طرف يُستبعد، فالانحراف يتناسب مع العدد
        expect(sum(settlements.map(s => s.amount))).toBeCloseTo(expected, 1)
      }),
      RUNS,
    )
  })

  it('عند توازن الدفتر تماماً، يُسدَّد الدين بالكامل', () => {
    fc.assert(
      fc.property(balancesArb, raw => {
        fc.pre(raw.length >= 2)
        // إزاحة الأرصدة حتى يصبح مجموعها صفراً — حالة «الصندوق متوازن»
        const drift = halalas(sum(raw.map(b => b.remaining)))
        const balances = raw.map((b, i) => ({
          ...b,
          remaining: i === 0 ? (halalas(b.remaining) - drift) / 100 : b.remaining,
        }))
        const settlements = calculateSettlements(balances)
        expect(sum(settlements.map(s => s.amount))).toBeCloseTo(debtOf(balances), 1)
      }),
      RUNS,
    )
  })

  it('لا أحد يدفع لنفسه', () => {
    fc.assert(
      fc.property(balancesArb, balances => {
        for (const s of calculateSettlements(balances)) {
          expect(s.fromId).not.toBe(s.toId)
        }
      }),
      RUNS,
    )
  })

  it('كل تحويل بمبلغ موجب فعلي (لا تحويلات بقيمة صفر)', () => {
    fc.assert(
      fc.property(balancesArb, balances => {
        for (const s of calculateSettlements(balances)) {
          expect(s.amount).toBeGreaterThan(0)
        }
      }),
      RUNS,
    )
  })

  it('عدد التحويلات لا يتجاوز n−1', () => {
    // حدّ الخوارزمية الجشعة: كل دورة تُصفّر طرفاً واحداً على الأقل.
    fc.assert(
      fc.property(balancesArb, balances => {
        expect(calculateSettlements(balances).length).toBeLessThanOrEqual(
          Math.max(0, balances.length - 1),
        )
      }),
      RUNS,
    )
  })

  it('لا يدفع مدين أكثر مما عليه، ولا يقبض دائن أكثر مما له', () => {
    fc.assert(
      fc.property(balancesArb, balances => {
        const settlements = calculateSettlements(balances)
        for (const b of balances) {
          const paid = sum(settlements.filter(s => s.fromId === b.id).map(s => s.amount))
          const received = sum(settlements.filter(s => s.toId === b.id).map(s => s.amount))
          expect(paid).toBeLessThanOrEqual(Math.max(0, -b.remaining) + 0.011)
          expect(received).toBeLessThanOrEqual(Math.max(0, b.remaining) + 0.011)
        }
      }),
      RUNS,
    )
  })

  it('من رصيده صفر لا يظهر في التسويات (تبسيط الديون)', () => {
    fc.assert(
      fc.property(balancesArb, balances => {
        const settled = calculateSettlements(balances)
        const zeroIds = balances.filter(b => Math.abs(b.remaining) <= 0.01).map(b => b.id)
        for (const s of settled) {
          expect(zeroIds).not.toContain(s.fromId)
          expect(zeroIds).not.toContain(s.toId)
        }
      }),
      RUNS,
    )
  })
})

// ─── القاعدة ٤: لا NaN ولا Infinity ولا حصة مستحيلة ───────────────────────────
//
// ⚠️ اقرأ هذا قبل إضعاف أي حارس Number.isFinite ⚠️
// هذه القاعدة كانت **مكسورة** حتى ٢٠٢٦-٠٨-١١، وأُصلحت في طبقتين معاً:
// حارس عند حدود الإدخال (hooks/useExpenseActions.ts) يمنع دخول NaN أصلاً،
// وتطهير داخل الدوال النقية (utils/calculations.ts) يحمي من المستندات الفاسدة
// الموجودة سلفاً في Firestore. الطبقتان لازمتان: الأولى وحدها تترك أي مستند
// فاسد قادراً على إفساد كل الأرقام، والثانية وحدها تترك التطبيق يكتب NaN إلى
// Firestore ويتلقى رفض صلاحيات مربكاً لا علاقة له بالسبب.
//
// المسار الذي كان يوصل NaN إلى الأرقام المعروضة — للتوثيق:
//   ١. حقل «سعر الصرف» في نموذج المصروف يمكن إفراغه بالكامل → exchangeRate = ''
//   ٢. handleAddExpense كان يتحقق من description و amount و participants فقط،
//      ولا يتحقق من exchangeRate إطلاقاً
//   ٣. parseFloat('') === NaN → amountSAR = NaN → payload.amount = NaN
//   ٤. المصروف يُكتب محلياً فوراً (تحديث متفائل) فتصير كل الأرصدة NaN
//   ٥. firestore.rules ترفض (amount >= 0 كاذبة مع NaN) فيتراجع Firestore،
//      لكن المستخدم يكون قد رأى «NaN» في كل مكان، ثم رسالة صلاحيات مربكة
//   ٦. دون اتصال: الكتابة تبقى معلّقة في IndexedDB ولا تُرفض — فتبقى كل
//      الأرصدة NaN إلى أن يعود الاتصال
//
// ونفس الشيء عبر حقل المبلغ نفسه: التنقية تُبقي '.' (تُزيل غير [0-9.] فقط)،
// و'.' نصٌّ صادق (truthy) فيمرّ من الشرط، وparseFloat('.') === NaN.
//
// والدرس الباقي: handleQuickAddExpense كان يحرس بـ `!Number.isFinite(amount)`
// منذ البداية بينما handleAddExpense لا يحرس — أي أن الملف كان يناقض نفسه.
// حين يوجد حارس على أحد مساري نفس العملية، ابحث عن المسار الآخر.

describe('قاعدة ٤ — لا قيم غير منتهية (ما يصمد اليوم)', () => {
  it('وزن NaN أو سالب أو صفر يُعامَل كوزن ١ ولا يُنتج قيمة غير منتهية', () => {
    fc.assert(
      fc.property(
        money(1, 500_000),
        fc.array(fc.oneof(fc.constant(NaN), fc.constant(-5), fc.constant(0), fc.integer({ min: 1, max: 100 })), {
          minLength: 1,
          maxLength: 10,
        }),
        (total, weights) => {
          const ids = weights.map((_, i) => i + 1)
          const shares = Object.fromEntries(ids.map((id, i) => [String(id), weights[i]]))
          const result = splitByShares(total, ids, shares)
          for (const v of result) expect(Number.isFinite(v)).toBe(true)
          expect(halalas(sum(result))).toBe(halalas(total))
        },
      ),
      RUNS,
    )
  })

  it('مشاركون مكرّرون: الحصص تتراكم ولا يضيع مال', () => {
    const travelers = [mkTraveler(1, 0), mkTraveler(2, 0)]
    const balances = calculateBalances(travelers, [
      mkExpense({ amount: 90, participants: [1, 1, 2] }),
    ])
    expect(balances.map(b => b.totalExpenses)).toEqual([60, 30])
    expect(sum(balances.map(b => b.totalExpenses))).toBe(90)
  })

  it('قائمة مشاركين فارغة لا تُنتج حصصاً ولا تؤثر على الأرصدة', () => {
    expect(splitByShares(100, [], undefined)).toEqual([])
    expect(splitEven(100, 0)).toEqual([])
    const balances = calculateBalances([mkTraveler(1, 100)], [
      mkExpense({ amount: 100, participants: [] }),
    ])
    expect(balances[0].remaining).toBe(100)
  })

  it('كل مخرجات الدفتر السليم منتهية', () => {
    fc.assert(
      fc.property(bookArb, ({ travelers, expenses }) => {
        const balances = calculateBalances(travelers, expenses)
        for (const b of balances) {
          expect(Number.isFinite(b.totalExpenses)).toBe(true)
          expect(Number.isFinite(b.remaining)).toBe(true)
        }
        for (const s of calculateSettlements(balances)) {
          expect(Number.isFinite(s.amount)).toBe(true)
        }
      }),
      RUNS,
    )
  })
})

describe('قاعدة ٤ — القيم غير المنتهية محجوزة عند الحساب', () => {
  // كل اختبار هنا كان يفشل قبل حرّاس Number.isFinite في calculations.ts.
  // القيمة غير المنتهية تُعامَل كصفر — لا تُرمى استثناءً — لأن هذا مسار قراءة
  // يمرّ على كل مصروف في كل عرض، فالرمي يُسقط الشجرة إلى ErrorBoundary بسبب
  // مستند واحد. الشرح الكامل في تعليق splitEven.

  it('splitEven لا يُنتج قيمة غير منتهية مهما كان المبلغ', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        fc.integer({ min: 1, max: 20 }),
        (total, n) => {
          const result = splitEven(total, n)
          expect(result).toHaveLength(n)
          for (const v of result) expect(Number.isFinite(v)).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('splitByShares لا يُنتج قيمة غير منتهية مهما كان المبلغ', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        fc.integer({ min: 1, max: 20 }),
        (total, n) => {
          const ids = Array.from({ length: n }, (_, i) => i + 1)
          const shares = Object.fromEntries(ids.map(id => [String(id), 2]))
          for (const v of splitByShares(total, ids, shares)) {
            expect(Number.isFinite(v)).toBe(true)
          }
          for (const v of splitByShares(total, ids, undefined)) {
            expect(Number.isFinite(v)).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  it('وزن Infinity لا يكسر التقسيم', () => {
    // الشرط القديم `typeof w === 'number' && w > 0` كان يقبل Infinity.
    const result = splitByShares(100, [1, 2], { '1': Infinity, '2': 1 })
    for (const v of result) expect(Number.isFinite(v)).toBe(true)
    expect(halalas(sum(result))).toBe(halalas(100))
  })

  it('أوزان منتهية يفيض مجموعها لا تكسر التقسيم', () => {
    // أخطر من سابقه: كل وزن على حدة منتهٍ تماماً، والفيضان يقع في الجمع —
    // فالفحص يجب أن يكون على totalWeight لا على الآحاد.
    const result = splitByShares(100, [1, 2], { '1': 1e308, '2': 1e308 })
    for (const v of result) expect(Number.isFinite(v)).toBe(true)
    expect(halalas(sum(result))).toBe(halalas(100))
  })

  it('مصروف واحد بمبلغ غير منتهٍ لا يُفسد بقية الدفتر', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        money(1, 100_000),
        (poison, good) => {
          const travelers = [mkTraveler(1, 1000), mkTraveler(2, 1000)]
          const balances = calculateBalances(travelers, [
            mkExpense({ id: 'bad', amount: poison, participants: [1, 2] }),
            mkExpense({ id: 'ok', amount: good, participants: [1, 2] }),
          ])
          for (const b of balances) {
            expect(Number.isFinite(b.remaining)).toBe(true)
            expect(Number.isFinite(b.totalExpenses)).toBe(true)
          }
          // المصروف السليم يبقى محسوباً بالكامل رغم فساد جاره
          expect(halalas(sum(balances.map(b => b.totalExpenses)))).toBe(halalas(good))
          for (const s of calculateSettlements(balances)) {
            expect(Number.isFinite(s.amount)).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  // ⚠️ هذه الثغرة عاشت حتى تدقيق الإصدار 2026-08-14 **لأن هذا الملف نفسه لم
  // يكن يولّدها**: كل مولّدات المسافرين هنا تُنتج deposited منتهياً، فقاعدة ٤ لم
  // تُختبر قط على هذا المدخل. تحصين المصاريف وحدها لا يغطّي الطرف الآخر من
  // معادلة الدفتر — والدرس أن الحارس لا يُقاس بعدد الدوال التي يغطّيها بل
  // بعدد **المداخل** التي تصل إليها.
  it('رصيد مُودَع غير منتهٍ لا يُفسد الأرصدة ولا التسويات', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        money(1, 100_000),
        money(1, 100_000),
        (poison, healthy, amount) => {
          const travelers = [mkTraveler(1, poison), mkTraveler(2, healthy)]
          const balances = calculateBalances(travelers, [
            mkExpense({ amount, participants: [1, 2] }),
          ])

          for (const b of balances) {
            expect(Number.isFinite(b.deposited)).toBe(true)
            expect(Number.isFinite(b.remaining)).toBe(true)
            expect(Number.isFinite(b.totalExpenses)).toBe(true)
            // ⚠️ القاعدة ٢ يجب أن تصمد على البيانات التالفة أيضاً: تطهير
            // remaining دون deposited كان سيكسرها بينما يُصلح القاعدة ٤.
            expect(b.remaining).toBeCloseTo(b.deposited - b.totalExpenses, 9)
          }

          // المسافر السليم لا يتأثر بجاره التالف
          expect(balances[1].deposited).toBe(healthy)

          for (const s of calculateSettlements(balances)) {
            expect(Number.isFinite(s.amount)).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  it('كشف الحساب يبدأ من رصيد منتهٍ حتى لو كان المستند تالفاً', () => {
    // buildAccountStatement يأخذ opening من balance.deposited، فتطهيره في
    // calculateBalances هو ما يحمي الكشف والتقارير وتصدير Excel معاً.
    const balances = calculateBalances([mkTraveler(1, Infinity)], [])
    expect(balances[0].deposited).toBe(0)
    expect(balances[0].remaining).toBe(0)
  })

  it('إجمالي المصروفات والإيداعات يتجاهل القيم غير المنتهية', () => {
    // هذان المجموعان لا يمرّان بالتقسيم، فتحصين splitEven وحده لا يغطيهما —
    // وكانا يعرضان NaN في إحصائيات الترويسة.
    expect(
      calculateTotalSpent([
        mkExpense({ amount: NaN, participants: [1] }),
        mkExpense({ amount: 250, participants: [1] }),
      ]),
    ).toBe(250)
    expect(
      calculateTotalDeposited([mkTraveler(1, NaN), mkTraveler(2, 300)]),
    ).toBe(300)
  })
})
