import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyDepositMode, replayDepositLogs, INITIAL_DEPOSIT_REASON } from './deposits'
import type { DepositLogEntry, DepositMode } from '../types'

const RUNS = { numRuns: 300 }
const halalas = (x: number) => Math.round(x * 100)
const money = (min: number, max: number) =>
  fc.integer({ min, max }).map(h => h / 100)

describe('applyDepositMode', () => {
  it.each([
    ['add',      100, 50,  150],
    ['subtract', 100, 30,  70],
    ['set',      100, 400, 400],
  ] as const)('%s: %d ← %d = %d', (mode, prev, amt, expected) => {
    expect(applyDepositMode(prev, mode as DepositMode, amt)).toBe(expected)
  })

  // ⚠️ سلوك قائم منذ البداية ومقصود: الرصيد المُودَع لا يصير سالباً — المَدين
  // يظهر في remaining لا هنا. وأثره أن المبلغ المخصوم فعلياً أصغر من المُدخَل.
  it('subtract تُقصَر عند الصفر ولا تنزل تحته', () => {
    expect(applyDepositMode(50, 'subtract', 200)).toBe(0)
  })

  it('set بقيمة سالبة تُقصَر عند الصفر أيضاً', () => {
    expect(applyDepositMode(100, 'set', -50)).toBe(0)
  })

  // القاعدة ١٩: لا يدخل مبلغ غير منتهٍ أي حساب.
  it.each([NaN, Infinity, -Infinity])('مبلغ %s لا يُسمّم الرصيد القائم', bad => {
    expect(applyDepositMode(500, 'add', bad)).toBe(500)
    expect(applyDepositMode(500, 'set', bad)).toBe(500)
  })

  it('رصيد سابق غير منتهٍ يُعامَل كصفر', () => {
    expect(applyDepositMode(NaN, 'add', 100)).toBe(100)
  })

  it('لا يُنتج قيمة غير منتهية مهما كان المدخل', () => {
    fc.assert(
      fc.property(
        fc.oneof(money(0, 1_000_000), fc.constantFrom(NaN, Infinity, -Infinity)),
        fc.constantFrom<DepositMode>('add', 'subtract', 'set'),
        fc.oneof(money(0, 1_000_000), fc.constantFrom(NaN, Infinity, -Infinity)),
        (prev, mode, amt) => {
          const result = applyDepositMode(prev, mode, amt)
          expect(Number.isFinite(result)).toBe(true)
          expect(result).toBeGreaterThanOrEqual(0)
        },
      ),
      RUNS,
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// الاتساق المحاسبي — القاعدة التي وُجد هذا الملف من أجلها
//
// «الرصيد الحالي = مجموع حركات الإيداع الموثّقة». وهي ليست إعادة صياغة لاختبار
// وحدة: إن صحّت فكل ريال في `deposited` له سطر يفسّره؛ وإن كُسرت فهناك مال
// دخل الدفتر بلا أثر — وهو بالضبط ما كان يسمح به إنشاء المسافر برصيد ابتدائي
// قبل 2026-08-14.
//
// ⚠️ ولا يكفي إثبات أن السجلّ يحوي سطراً. السطر قد يوجد ويخالف الرصيد.
// ═══════════════════════════════════════════════════════════════════════════

/** يبني سطر سجلّ كما يكتبه التطبيق فعلاً — من الرصيدين لا من المبلغ المُدخَل. */
const mkLog = (
  previousDeposited: number,
  newDeposited: number,
  mode: DepositMode,
  createdAt: number,
): DepositLogEntry => ({
  id: `log-${createdAt}`,
  travelerId: 1,
  previousDeposited,
  newDeposited,
  delta: newDeposited - previousDeposited,
  mode,
  reason: null,
  changedByEmail: 'admin@example.com',
  changedByUid: 'admin-1',
  createdAt,
})

describe('الاتساق المحاسبي — الرصيد = مجموع الحركات الموثّقة', () => {
  it('أي سلسلة عمليات: إعادة تشغيل السجلّ تُنتج الرصيد النهائي نفسه', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            mode: fc.constantFrom<DepositMode>('add', 'subtract', 'set'),
            amount: money(0, 500_000),
          }),
          { minLength: 1, maxLength: 25 },
        ),
        operations => {
          // نحاكي ما يفعله التطبيق: كل عملية تُطبَّق على الرصيد وتُخلّف سطرها
          let balance = 0
          const logs: DepositLogEntry[] = operations.map((op, i) => {
            const previous = balance
            balance = applyDepositMode(previous, op.mode, op.amount)
            return mkLog(previous, balance, op.mode, 1_700_000_000_000 + i * 1000)
          })

          expect(halalas(replayDepositLogs(logs))).toBe(halalas(balance))
        },
      ),
      RUNS,
    )
  })

  // ⚠️ الترتيب جوهري لا تجميلي: `set` تُلغي كل ما قبلها، فقراءة السجلّات
  // بترتيب وصولها من Firestore (غير مضمون) تُنتج رصيداً مختلفاً تماماً.
  it('ترتيب السجلّات بـ createdAt لا بترتيب الوصول', () => {
    const logs = [
      mkLog(1000, 400, 'set', 3000),
      mkLog(0, 1000, 'set', 1000),
      mkLog(1000, 1000, 'add', 2000),
    ]
    expect(replayDepositLogs(logs)).toBe(400)
    expect(replayDepositLogs([...logs].reverse())).toBe(400)
  })

  it('سجلّ فارغ = رصيد صفر — مسافر أُنشئ بلا رصيد ابتدائي', () => {
    expect(replayDepositLogs([])).toBe(0)
  })

  // الحالة التي أغلقها C1: رصيد ابتدائي يُكتب كحركة `set` من صفر، فيصمد
  // الاتساق منذ أول ريال بدل أن يبدأ الدفتر برقم لا سطر له.
  it('الرصيد الابتدائي يُعاد بناؤه من سطره وحده', () => {
    const initial = mkLog(0, 3000, 'set', 1000)
    expect(initial.reason).toBeNull()
    expect(replayDepositLogs([initial])).toBe(3000)
    expect(replayDepositLogs([initial, mkLog(3000, 3500, 'add', 2000)])).toBe(3500)
  })

  it('نص سبب الرصيد الابتدائي مشترك بين الكاتب والاختبار — لا نسخة مكرّرة', () => {
    expect(INITIAL_DEPOSIT_REASON).toContain('رصيد ابتدائي')
  })
})
