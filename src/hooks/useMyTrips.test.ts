import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useMyTrips } from './useMyTrips'

const mocks = vi.hoisted(() => ({ getDoc: vi.fn() }))

vi.mock('firebase/firestore', () => ({ getDoc: mocks.getDoc }))
vi.mock('../firebase', () => ({ db: {} }))
vi.mock('../firestore', () => ({
  tripDocById: vi.fn((tripId: string) => ({ __tripDoc: tripId })),
}))

const fakeUser = { uid: 'user-1' } as User

/** لقطة مستند موجودة بالاسم المعطى (undefined = مستند بلا حقل اسم). */
const docSnap = (name?: string, itinerary?: unknown) => ({
  exists: () => true,
  data: () => ({ ...(name === undefined ? {} : { name }), ...(itinerary === undefined ? {} : { itinerary }) }),
})
const missingSnap = { exists: () => false, data: () => undefined }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMyTrips', () => {
  it('لا يقرأ شيئاً بلا مستخدم', async () => {
    const { result } = renderHook(() => useMyTrips(['t1'], null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(result.current.trips).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('لا يقرأ شيئاً عند قائمة معرّفات فارغة (لا خطأ ولا تحميل)', async () => {
    const { result } = renderHook(() => useMyTrips([], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(result.current.trips).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('يقرأ مستند كل رحلة على حدة — لا استعلام قائمة (القواعد تمنعه لغير المسؤول)', async () => {
    mocks.getDoc.mockResolvedValueOnce(docSnap('رحلة بولندا'))
    mocks.getDoc.mockResolvedValueOnce(docSnap('رحلة اليابان'))

    const { result } = renderHook(() => useMyTrips(['t1', 't2'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mocks.getDoc).toHaveBeenCalledTimes(2)
    expect(mocks.getDoc).toHaveBeenCalledWith({ __tripDoc: 't1' })
    expect(mocks.getDoc).toHaveBeenCalledWith({ __tripDoc: 't2' })
    expect(result.current.trips).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  it('يرتّب الرحلات أبجدياً بالاسم العربي', async () => {
    mocks.getDoc.mockResolvedValueOnce(docSnap('اليابان'))
    mocks.getDoc.mockResolvedValueOnce(docSnap('البوسنة'))

    const { result } = renderHook(() => useMyTrips(['t1', 't2'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.trips.map(t => t.name)).toEqual(['البوسنة', 'اليابان'])
  })

  it('يسقط للمعرّف كاسم معروض حين يكون المستند بلا اسم صالح', async () => {
    mocks.getDoc.mockResolvedValueOnce(docSnap(undefined))
    const { result } = renderHook(() => useMyTrips(['trip-xyz'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // status: 'active' لأن غياب الحقل يعني «نشطة» — انظر normalizeTripStatus
    expect(result.current.trips).toEqual([{ id: 'trip-xyz', name: 'trip-xyz', status: 'active', routeSummary: null }])
  })

  it('يبني ملخّص المسار من حقل itinerary — أول انطلاق وآخر وصول', async () => {
    const itinerary = [{
      id: 'seg1', mode: 'flight', identifier: 'QR 1',
      departure: { location: 'الرياض', time: '2026-07-21T22:30:00' },
      arrival: { location: 'دبي', time: '2026-07-22T00:30:00' },
    }]
    mocks.getDoc.mockResolvedValueOnce(docSnap('رحلة دبي', itinerary))
    const { result } = renderHook(() => useMyTrips(['t1'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.trips[0].routeSummary).toEqual({
      start: '2026-07-21T22:30:00', end: '2026-07-22T00:30:00', fromLocation: 'الرياض', toLocation: 'دبي',
    })
  })

  it('يُسقط رحلة مذكورة في claims لكن مستندها غير موجود، ويُبقي البقية', async () => {
    mocks.getDoc.mockResolvedValueOnce(docSnap('رحلة قائمة'))
    mocks.getDoc.mockResolvedValueOnce(missingSnap)

    const { result } = renderHook(() => useMyTrips(['t1', 'deleted-trip'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.trips).toEqual([{ id: 't1', name: 'رحلة قائمة', status: 'active', routeSummary: null }])
    expect(result.current.error).toBeNull() // نجاح جزئي ليس خطأً
  })

  it('فشل قراءة رحلة واحدة لا يُسقط بقية القائمة', async () => {
    mocks.getDoc.mockResolvedValueOnce(docSnap('رحلة ناجحة'))
    mocks.getDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))

    const { result } = renderHook(() => useMyTrips(['t1', 't2'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.trips).toEqual([{ id: 't1', name: 'رحلة ناجحة', status: 'active', routeSummary: null }])
    expect(result.current.error).toBeNull()
  })

  it('فشل كل القراءات يعرض رسالة خطأ بدل شاشة فارغة بلا تفسير', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useMyTrips(['t1', 't2'], fakeUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.trips).toEqual([])
    expect(result.current.error).toContain('تعذّر جلب رحلاتك')
  })

  it('لا يعيد القراءة عند إعادة عرض بنفس المعرّفات في مصفوفة جديدة', async () => {
    mocks.getDoc.mockResolvedValue(docSnap('رحلة'))

    const { result, rerender } = renderHook(
      ({ ids }) => useMyTrips(ids, fakeUser),
      { initialProps: { ids: ['t1'] } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.getDoc).toHaveBeenCalledTimes(1)

    // مرجع مصفوفة جديد بنفس المحتوى — useAuth يبني المصفوفة من جديد كل عرض
    rerender({ ids: ['t1'] })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.getDoc).toHaveBeenCalledTimes(1)
  })

  it('يعيد القراءة عند تغيّر المعرّفات فعلياً (انضمام لرحلة جديدة)', async () => {
    mocks.getDoc.mockResolvedValue(docSnap('رحلة'))

    const { result, rerender } = renderHook(
      ({ ids }) => useMyTrips(ids, fakeUser),
      { initialProps: { ids: ['t1'] } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.getDoc).toHaveBeenCalledTimes(1)

    rerender({ ids: ['t1', 't2'] })
    await waitFor(() => expect(result.current.trips).toHaveLength(2))
    expect(mocks.getDoc).toHaveBeenCalledTimes(3) // 1 سابقة + 2 بعد التغيير
  })
})
