import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Expense, Traveler, Repayment } from '../types'
import { useTripWorkspace } from './useTripWorkspace'
// المُحاكى أدناه يعيد useModals الحقيقي — انظر vi.mock('./index').
import { useModals } from './index'

// ─── useTripWorkspace ─────────────────────────────────────────────────────────
//
// ما يُختبر هنا هو ما يملكه هذا الخطاف وحده: التفرّعات بين الرحلة القياسية
// والطويلة، وحدود الصلاحية (منظّم/مسؤول)، وثبات المراجع التي تعيش في شريحة
// `actions` من المتجر (القاعدة ١٦)، ومتى يُسمح بالتعافي من المزامنة.
//
// ما لا يُختبر هنا: الحساب المالي (utils/calculations.invariants.test.ts)،
// ومنطق كل خطاف فرعي (لكلٍّ اختباره). لذلك خطافات Firestore مُحاكاة، أما
// useBalances وuseModals وuseFilteredExpenses فحقيقية: نقيّة بلا Firebase،
// ومحاكاتها كانت ستُخفي بالضبط ما نريد رؤيته — أرقاماً ومراجع حقيقية.

const h = vi.hoisted(() => ({
  expenses: [] as Expense[],
  travelers: [] as Traveler[],
  repayments: [] as Repayment[],
  expensesLoaded: true,
  travelersLoaded: true,
  repaymentsLoaded: true,
  // ما تستقبله الخطافات المُحاكاة — لنتحقّق مما مُرِّر إليها لا مما أعادته.
  dataUsers: [] as unknown[],
  syncRecoveryEnabled: [] as boolean[],
  confirmDeleteTraveler: vi.fn(),
  closeMonth: vi.fn(async () => null as unknown),
  exitTraveler: vi.fn(async () => false),
}))

vi.mock('./index', async () => {
  const { useModals } = await vi.importActual<typeof import('./useModals')>('./useModals')
  const { useBalances } = await vi.importActual<typeof import('./useBalances')>('./useBalances')
  // مراجع ثابتة عبر الرسمات، كما تعيدها الخطافات الحقيقية (useState/useCallback).
  const noop = () => {}
  const refresh = async () => {}
  const expenseActions = { isAddingExpense: false, newExpense: { description: '', amount: '', currency: 'SAR', exchangeRate: '1' } }
  const travelerActions = {
    isAddingTraveler: false, newTravelerName: '', newTravelerDeposit: '',
    confirmDeleteTraveler: (id: number) => h.confirmDeleteTraveler(id),
  }
  const longTermActions = {
    isClosingMonth: false, isExitingTraveler: false,
    closeMonth: (...a: unknown[]) => h.closeMonth(...(a as [])),
    exitTraveler: (...a: unknown[]) => h.exitTraveler(...(a as [])),
  }
  const settlementActions = { recordingKey: null, recordSettlement: async () => true }
  const repaymentActions = { deleteRepayment: noop, restoreRepayment: noop }
  return {
    useModals,
    useBalances,
    useExchangeRates: () => ({ ratesUpdatedAt: null, CURRENCIES: {} }),
    useExpenses: (user: unknown) => {
      h.dataUsers.push(user)
      return { expenses: h.expenses, setExpenses: noop, expensesLoaded: h.expensesLoaded, refreshExpenses: refresh }
    },
    useTravelers: () => ({ travelers: h.travelers, setTravelers: noop, travelersLoaded: h.travelersLoaded, refreshTravelers: refresh }),
    useRepayments: () => ({ repayments: h.repayments, setRepayments: noop, repaymentsLoaded: h.repaymentsLoaded, refreshRepayments: refresh }),
    useSyncTravelerNameFromProfile: () => undefined,
    useSyncRecovery: (enabled: boolean) => { h.syncRecoveryEnabled.push(enabled) },
    useExpenseActions: () => expenseActions,
    useTravelerActions: () => travelerActions,
    useDepositActions: () => ({}),
    useLongTermActions: () => longTermActions,
    useSettlementActions: () => settlementActions,
    useRepaymentActions: () => repaymentActions,
  }
})

vi.mock('../utils/tripId', () => ({ TRIP_ID: 'trip-1', HAS_EXPLICIT_TRIP_ID: true, INVITE_TOKEN: null }))

const me = { uid: 'me' } as User
const ahmed: Traveler = { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 300, deletedAt: null }
const saad: Traveler = { id: 2, name: 'سعد', shortName: 'سعد', deposited: 300, deletedAt: null, uid: 'me' }
const trashed: Traveler = { id: 3, name: 'خالد', shortName: 'خالد', deposited: 0, deletedAt: 1 }
const dinner: Expense = {
  id: 'e1', date: '2026-08-10', description: 'عشاء', amount: 200, originalAmount: 200,
  currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1,
}

type Args = Parameters<typeof useTripWorkspace>[0]

function setup(overrides: Partial<Omit<Args, 'modals'>> & { tripType?: 'standard' | 'long_term' } = {}) {
  const { tripType = 'standard', ...rest } = overrides
  const showToast = vi.fn()
  const handleFirestoreError = vi.fn()
  const setSyncError = vi.fn()
  // useModals حقيقي داخل نفس الرسمة — كما يستدعيه useAppCoordinator بالضبط،
  // فيصل كائن `modals` جديداً في كل رسمة كما في التطبيق الفعلي.
  return renderHook(
    (props: Partial<Args>) => {
      const modals = useModals()
      const workspace = useTripWorkspace({
        user: me, isAdmin: false, hasAccess: true, profileDisplayName: undefined,
        config: { tripType, currentPeriod: '2026-08', lastClosedPeriod: undefined, organizerUid: 'org' },
        isOrganizer: false, modals, showToast, handleFirestoreError, setSyncError,
        ...rest, ...props,
      })
      return { workspace, modals }
    },
    { initialProps: {} },
  )
}

beforeEach(() => {
  h.expenses = [dinner]
  h.travelers = [ahmed, saad, trashed]
  h.repayments = []
  h.expensesLoaded = h.travelersLoaded = h.repaymentsLoaded = true
  h.dataUsers = []
  h.syncRecoveryEnabled = []
  h.confirmDeleteTraveler.mockClear()
  h.closeMonth.mockReset().mockResolvedValue(null)
  h.exitTraveler.mockReset().mockResolvedValue(false)
})

describe('useTripWorkspace — الدفتر', () => {
  it('يفصل النشط عن المحذوف، ويضع بطاقتي أولاً في قائمة العرض وحدها', () => {
    const { result } = setup()
    const { ledger } = result.current.workspace
    expect(ledger.activeTravelers.map(t => t.id)).toEqual([1, 2])
    expect(ledger.deletedTravelers.map(t => t.id)).toEqual([3])
    // بطاقتي (uid: 'me') أولاً للعرض…
    expect(ledger.travelersPanelBalances.map(b => b.id)).toEqual([2, 1])
    // …و`balances` نفسها بترتيبها الأصلي — تُستهلك في التصدير والتسويات.
    expect(ledger.balances.map(b => b.id)).toEqual([1, 2])
  })

  it('يبقى في التحميل الأوّلي حتى يصل السداد أيضاً، لا المصاريف والمسافرون وحدهم', () => {
    h.repaymentsLoaded = false
    const { result } = setup()
    expect(result.current.workspace.ledger.isInitialLoading).toBe(true)
  })

  it('لا يشترك في بيانات الرحلة بلا وصول', () => {
    setup({ hasAccess: false })
    expect(h.dataUsers.every(u => u === null)).toBe(true)
  })
})

describe('useTripWorkspace — حدود الصلاحية', () => {
  it('يُخفي تسجيل التحويل وحذف السداد عن المسافر العادي', () => {
    const { result } = setup()
    expect(result.current.workspace.ledger.onRecordTransfer).toBeUndefined()
    expect(result.current.workspace.ledger.onDeleteRepayment).toBeUndefined()
  })

  it.each([
    ['المنظّم', { isOrganizer: true }],
    ['المسؤول', { isAdmin: true }],
  ])('يُظهرهما لـ%s', (_label, who) => {
    const { result } = setup(who)
    expect(result.current.workspace.ledger.onRecordTransfer).toBeTypeOf('function')
    expect(result.current.workspace.ledger.onDeleteRepayment).toBeTypeOf('function')
  })
})

describe('useTripWorkspace — الرحلة القياسية مقابل الطويلة', () => {
  it('longTerm = null في الرحلة القياسية', () => {
    const { result } = setup()
    expect(result.current.workspace.longTerm).toBeNull()
  })

  it('longTerm حاضرة في الطويلة، والإدارة للمنظّم وحده', () => {
    const member = setup({ tripType: 'long_term' })
    expect(member.result.current.workspace.longTerm).not.toBeNull()
    expect(member.result.current.workspace.longTerm?.canManage).toBe(false)

    const organizer = setup({ tripType: 'long_term', isOrganizer: true })
    expect(organizer.result.current.workspace.longTerm?.canManage).toBe(true)
  })

  it('حذف مسافر في القياسية: حذف ليّن مباشر، بلا نافذة', () => {
    const { result } = setup()
    act(() => result.current.workspace.requestDeleteTraveler(ahmed))
    expect(h.confirmDeleteTraveler).toHaveBeenCalledWith(1)
    expect(result.current.modals.modal.type).toBe('none')
  })

  // 🆕 كانت تفتح نافذة «تسوية وخروج» في الطويلة. صار الخروج قسماً في ملف
  // المسافر تفتحه البطاقة نفسها (TravelerSection.tsx)، فلا تفرّع هنا بعد اليوم:
  // الحذف ليّن في الحالتين، وحارس الرصيد غير المسوّى داخل confirmDeleteTraveler
  // (describeExitBlockFor) يبقى شبكة الأمان لأي مسار آخر.
  it('حذف مسافر في الطويلة: نفس الحذف الليّن، بلا أي نافذة من اتحاد المودالات', () => {
    const { result } = setup({ tripType: 'long_term' })
    act(() => result.current.workspace.requestDeleteTraveler(ahmed))
    expect(h.confirmDeleteTraveler).toHaveBeenCalledWith(1)
    expect(result.current.modals.modal.type).toBe('none')
  })

  it('تأكيد الخروج يُعيد نجاحه للمستدعي ولا يمسّ حالة المودالات', async () => {
    const { result } = setup({ tripType: 'long_term', isOrganizer: true })
    act(() => result.current.modals.openLongTermPanel())

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.workspace.longTerm!.onConfirmExit(1, true) })
    expect(h.exitTraveler).toHaveBeenCalledWith('trip-1', 1, true)
    expect(ok).toBe(false)

    h.exitTraveler.mockResolvedValue(true)
    await act(async () => { ok = await result.current.workspace.longTerm!.onConfirmExit(1, true) })
    expect(ok).toBe(true)
    // ملف المسافر حالة محلّية في بطاقته — هو من يُغلق، لا closeModal.
    expect(result.current.modals.modal.type).toBe('longTermPanel')
  })

  it('إغلاق الشهر يُغلق نافذة «هذا الشهر» عند النجاح وحده', async () => {
    const { result } = setup({ tripType: 'long_term', isOrganizer: true })
    // 🆕 التأكيد خطوة داخل هذه النافذة (LongTermModal)، لا نافذة مستقلّة.
    act(() => result.current.modals.openLongTermPanel())
    await act(() => result.current.workspace.longTerm!.onConfirmRollover())
    expect(h.closeMonth).toHaveBeenCalledWith('trip-1', '2026-08')
    expect(result.current.modals.modal.type).toBe('longTermPanel')

    h.closeMonth.mockResolvedValue({ ok: true })
    await act(() => result.current.workspace.longTerm!.onConfirmRollover())
    expect(result.current.modals.modal.type).toBe('none')
  })
})

describe('useTripWorkspace — ثبات المراجع (القاعدة ١٦)', () => {
  // ⚠️ requestDeleteTraveler تعيش في شريحة `actions` من المتجر، وTripStoreProvider
  // يعيد كتابة تلك الشريحة كلما تغيّر مرجعها. المنسّق يُعاد رسمه مع كل حرف في
  // نموذج المصروف، فمرجع غير ثابت هنا = إعادة رسم كل مستهلكي `actions` مع كل
  // ضغطة مفتاح، بلا أي عَرَض ظاهر.
  it.each(['standard', 'long_term'] as const)('requestDeleteTraveler ثابتة عبر رسمات لا تغيّر البيانات (%s)', tripType => {
    const { result, rerender } = setup({ tripType })
    const first = result.current.workspace.requestDeleteTraveler
    rerender({})
    expect(result.current.workspace.requestDeleteTraveler).toBe(first)
  })
})

describe('useTripWorkspace — التعافي من المزامنة', () => {
  it('مفعّل مع الوصول وبلا كتابات معلّقة', () => {
    setup()
    expect(h.syncRecoveryEnabled.at(-1)).toBe(true)
  })

  it('معطّل ما دامت هناك كتابة لم يؤكّدها الخادم — القراءة من الخادم كانت ستمحوها', () => {
    h.expenses = [{ ...dinner, _pending: true }]
    setup()
    expect(h.syncRecoveryEnabled.at(-1)).toBe(false)
  })

  it('معطّل بلا وصول', () => {
    setup({ hasAccess: false })
    expect(h.syncRecoveryEnabled.at(-1)).toBe(false)
  })
})
