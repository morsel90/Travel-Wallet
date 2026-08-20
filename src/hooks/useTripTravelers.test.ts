import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTripTravelers } from './useTripTravelers'

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  travelersColByTrip: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({ getDocs: mocks.getDocs }))
vi.mock('../firestore', () => ({ travelersColByTrip: mocks.travelersColByTrip }))

/** يحاكي QuerySnapshot: docs بدالة data() فقط — data() تُرجع الشكل الكامل كما تُخزَّن فعلياً. */
const snapshotOf = (rows: Array<Record<string, unknown>>) => ({
  docs: rows.map(data => ({ data: () => data })),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.travelersColByTrip.mockReturnValue({ __col: true })
  mocks.getDocs.mockResolvedValue(snapshotOf([]))
})

describe('useTripTravelers — التعطيل', () => {
  it('لا يقرأ شيئاً وهو معطَّل', async () => {
    const { result } = renderHook(() => useTripTravelers('trip-1', false))
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(result.current.travelers).toBeNull()
  })

  it('لا يقرأ بلا معرّف رحلة', () => {
    renderHook(() => useTripTravelers(null, true))
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('useTripTravelers — الجلب', () => {
  it('يعيد المسافرين كما خُزِّنوا، شاملاً uid/joinedAt عند وجودهما', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 100, uid: 'u1', joinedAt: 5 },
      { id: 2, name: 'سعد', shortName: 'سعد', deposited: 0 },
    ]))
    const { result } = renderHook(() => useTripTravelers('trip-1', true))

    await waitFor(() => expect(result.current.travelers).not.toBeNull())
    expect(result.current.travelers).toEqual([
      { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 100, uid: 'u1', joinedAt: 5 },
      { id: 2, name: 'سعد', shortName: 'سعد', deposited: 0 },
    ])
  })

  it('فشل القراءة يرفع error ولا يترك قائمة نصف محمّلة', async () => {
    mocks.getDocs.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    const { result } = renderHook(() => useTripTravelers('trip-1', true))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.travelers).toBeNull()
  })
})

describe('useTripTravelers — refresh', () => {
  it('يعيد الجلب عند الطلب — وهو ما تعتمد عليه اللوحة بعد ربط مسافر بحساب', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0 }]))
    const { result } = renderHook(() => useTripTravelers('trip-1', true))
    await waitFor(() => expect(result.current.travelers).toHaveLength(1))

    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0, uid: 'u1' },
      { id: 2, name: 'سعد', shortName: 'سعد', deposited: 0 },
    ]))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.travelers).toHaveLength(2))
    expect(mocks.getDocs).toHaveBeenCalledTimes(2)
  })
})
