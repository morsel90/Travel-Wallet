import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettlementActions } from './useSettlementActions'
import { useLongTermActions } from './useLongTermActions'

// ─── تثبيت عقد الاستدعاء لخطافين بلا اختبارات (القاعدة ٢١) ───────────────────
//
// كُتب قبل نقل عقود الدوال السحابية إلى hooks/callables.ts. لا يختبر منطق
// الخطافين كاملاً — فقط ما سيلمسه النقل: **اسم الدالة المستدعاة، وشكل الطلب،
// وما يُعرض من ردّها**. اسم خاطئ هنا لا يُمسكه أي فحص أنواع قبل النقل، فهو
// مجرّد نصّ يُمرَّر لـ httpsCallable.

const mocks = vi.hoisted(() => ({
  httpsCallable: vi.fn(),
  callable: vi.fn(),
  getIdToken: vi.fn(),
}))

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))
vi.mock('../firebase', () => ({
  functions: {},
  auth: { get currentUser() { return { getIdToken: mocks.getIdToken } } },
}))
vi.mock('../utils/haptics', () => ({ haptic: { success: vi.fn(), error: vi.fn() } }))

const showToast = vi.fn()
const handleFirestoreError = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getIdToken.mockResolvedValue('tok')
  mocks.httpsCallable.mockReturnValue(mocks.callable)
})

describe('useSettlementActions → recordSettlement', () => {
  it('يستدعي recordSettlement بالطلب كما يقرؤه الخادم، ويعرض المبلغ الذي سجّله الخادم', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 't', fromId: 1, toId: 2, amount: 99.5 } })
    const { result } = renderHook(() => useSettlementActions({ showToast, handleFirestoreError }))
    let ok
    await act(async () => { ok = await result.current.recordSettlement('t', 1, 2, 99.499, 'سعد') })

    expect(ok).toBe(true)
    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'recordSettlement')
    // toName لا يُرسل — للرسالة وحدها.
    expect(mocks.callable).toHaveBeenCalledWith({ tripId: 't', fromId: 1, toId: 2, amount: 99.499 })
    expect(showToast).toHaveBeenCalledWith({ text: 'سُجّل تحويل 99.50 ريال إلى سعد', type: 'success' }, 5000)
  })
})

describe('useLongTermActions', () => {
  it('closeMonth يستدعي closeMonth ويُعيد ردّ الخادم كما هو', async () => {
    const rollover = { closedPeriod: '2026-07', openedPeriod: '2026-08', written: { deposits: 3 } }
    mocks.callable.mockResolvedValue({ data: rollover })
    const { result } = renderHook(() => useLongTermActions({ showToast, handleFirestoreError }))
    let returned
    await act(async () => { returned = await result.current.closeMonth('t', '2026-07') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'closeMonth')
    expect(mocks.callable).toHaveBeenCalledWith({ tripId: 't', period: '2026-07' })
    expect(returned).toEqual(rollover)
  })

  it('exitTraveler يستدعي exitTraveler، والرسالة تذكر المبلغ المسوّى إن وُجد', async () => {
    mocks.callable.mockResolvedValue({
      data: { success: true, tripId: 't', travelerId: 4, settledAmount: 120, direction: 'credit' },
    })
    const { result } = renderHook(() => useLongTermActions({ showToast, handleFirestoreError }))
    let ok
    await act(async () => { ok = await result.current.exitTraveler('t', 4, true) })

    expect(ok).toBe(true)
    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'exitTraveler')
    expect(mocks.callable).toHaveBeenCalledWith({ tripId: 't', travelerId: 4, settle: true })
    expect(showToast).toHaveBeenCalledWith(
      { text: 'تمت تسوية 120.00 ريال وإخراج المسافر من الرحلة', type: 'success' }, 4000,
    )
  })
})
