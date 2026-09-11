import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useTripStats } from './useTripStats'

const mocks = vi.hoisted(() => ({
  getCountFromServer: vi.fn(),
  getAggregateFromServer: vi.fn(),
}))

// `query`/`where`/`sum` وسوم بحتة هنا — ما يُختبر هو *أي* مجموعة سُئلت وبأي
// فلتر، وكيف تُطرح نتيجة المحذوف من المجموع الكامل.
vi.mock('firebase/firestore', () => ({
  getCountFromServer: mocks.getCountFromServer,
  getAggregateFromServer: mocks.getAggregateFromServer,
  query: (col: unknown, ...cs: unknown[]) => ({ col, constraints: cs }),
  where: (f: string, op: string, v: unknown) => ({ __where: [f, op, v] }),
  sum: (f: string) => ({ __sum: f }),
}))
vi.mock('../firebase', () => ({ db: {} }))
vi.mock('../firestore', () => ({
  expensesColByTrip:  (tripId: string) => ({ __col: 'expenses',  tripId }),
  travelersColByTrip: (tripId: string) => ({ __col: 'travelers', tripId }),
}))

const fakeUser = { uid: 'user-1' } as User

const countSnap = (count: number) => ({ data: () => ({ count }) })
const sumSnap   = (total: number) => ({ data: () => ({ total }) })

/** أي استعلام يحمل فلتراً هو استعلام «المحذوف» — انظر isDeleted في الخطّاف. */
const isDeletedQuery = (arg: { constraints?: unknown[] }) =>
  Array.isArray(arg?.constraints) && arg.constraints.length > 0

/**
 * @param travelers [الكل، المحذوف]
 * @param expenses  [مجموع الكل، مجموع المحذوف]
 */
const wire = (travelers: [number, number], expenses: [number, number]) => {
  mocks.getCountFromServer.mockImplementation(async (arg: { constraints?: unknown[] }) =>
    countSnap(isDeletedQuery(arg) ? travelers[1] : travelers[0]))
  mocks.getAggregateFromServer.mockImplementation(async (arg: { constraints?: unknown[] }) =>
    sumSnap(isDeletedQuery(arg) ? expenses[1] : expenses[0]))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTripStats', () => {
  it('لا يستعلم شيئاً بلا مستخدم أو بلا معرّفات', async () => {
    const { result: noUser } = renderHook(() => useTripStats(['t1'], null))
    const { result: noIds }  = renderHook(() => useTripStats([], fakeUser))

    await waitFor(() => {
      expect(noUser.current).toEqual({})
      expect(noIds.current).toEqual({})
    })
    expect(mocks.getCountFromServer).not.toHaveBeenCalled()
    expect(mocks.getAggregateFromServer).not.toHaveBeenCalled()
  })

  // ⚠️ هذا هو جوهر الخطّاف: الحذف ليّن، والأرقام يجب أن تطابق ما تعرضه ترويسة
  // الرحلة (activeExpenses/activeTravelers) لا المجموعة الخام.
  it('يطرح المحذوف من المجموع — لا يعرض الخام', async () => {
    wire([7, 2], [1000, 250])

    const { result } = renderHook(() => useTripStats(['t1'], fakeUser))
    await waitFor(() => expect(result.current.t1).toBeDefined())

    expect(result.current.t1).toEqual({ travelerCount: 5, totalSpent: 750 })
  })

  it('يسأل مجموعتي الرحلة نفسها، والمحذوف بفلتر deletedAt > 0 وحده', async () => {
    wire([1, 0], [10, 0])

    const { result } = renderHook(() => useTripStats(['t9'], fakeUser))
    await waitFor(() => expect(result.current.t9).toBeDefined())

    const countArgs = mocks.getCountFromServer.mock.calls.map(c => c[0])
    const aggArgs   = mocks.getAggregateFromServer.mock.calls.map(c => c[0])

    // المسافرون: استعلام بلا فلتر + استعلام المحذوف؛ المصاريف: نفس الزوج.
    expect(countArgs).toEqual([
      { __col: 'travelers', tripId: 't9' },
      { col: { __col: 'travelers', tripId: 't9' }, constraints: [{ __where: ['deletedAt', '>', 0] }] },
    ])
    expect(aggArgs[0]).toEqual({ __col: 'expenses', tripId: 't9' })
    expect(aggArgs[1]).toEqual({
      col: { __col: 'expenses', tripId: 't9' }, constraints: [{ __where: ['deletedAt', '>', 0] }],
    })
    // المجموع على المبلغ المحوَّل (amount) لا على originalAmount
    expect(mocks.getAggregateFromServer.mock.calls[0][1]).toEqual({ total: { __sum: 'amount' } })
  })

  it('لا يُرجع رقماً غير منتهٍ — مستند بمبلغ فاسد يُفسد المجموع الخادمي كله', async () => {
    mocks.getCountFromServer.mockImplementation(async (arg: { constraints?: unknown[] }) =>
      countSnap(isDeletedQuery(arg) ? 0 : 3))
    mocks.getAggregateFromServer.mockImplementation(async (arg: { tripId?: string; col?: { tripId: string }; constraints?: unknown[] }) => {
      if (isDeletedQuery(arg)) return sumSnap(0)
      return sumSnap((arg.tripId ?? arg.col?.tripId) === 'nan' ? NaN : 500)
    })

    // رحلة سليمة إلى جانب الفاسدة: ظهور السليمة يُثبت أن الدمج وقع فعلاً، فغياب
    // الفاسدة بعده غياب حقيقي لا «لم يصل بعد».
    const { result } = renderHook(() => useTripStats(['ok', 'nan'], fakeUser))
    await waitFor(() => expect(result.current.ok).toBeDefined())

    // لا مدخل أصلاً — البطاقة تُرسم بالاسم والحالة بدل عرض NaN ﷼
    expect(result.current.nan).toBeUndefined()
  })

  it('فشل رحلة واحدة لا يُسقط أرقام البقية', async () => {
    mocks.getCountFromServer.mockImplementation(async (arg: { tripId?: string; col?: { tripId: string } }) => {
      const tripId = arg.tripId ?? arg.col?.tripId
      if (tripId === 'broken') throw Object.assign(new Error('denied'), { code: 'permission-denied' })
      return countSnap(isDeletedQuery(arg as { constraints?: unknown[] }) ? 1 : 4)
    })
    mocks.getAggregateFromServer.mockImplementation(async (arg: { constraints?: unknown[] }) =>
      sumSnap(isDeletedQuery(arg) ? 0 : 500))

    const { result } = renderHook(() => useTripStats(['ok', 'broken'], fakeUser))
    await waitFor(() => expect(result.current.ok).toBeDefined())

    expect(result.current.ok).toEqual({ travelerCount: 3, totalSpent: 500 })
    expect(result.current.broken).toBeUndefined()
  })

  it('يدمج جلبة جديدة فوق القديمة بدل محوها', async () => {
    wire([2, 0], [100, 0])
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useTripStats(ids, fakeUser),
      { initialProps: { ids: ['a'] } },
    )
    await waitFor(() => expect(result.current.a).toBeDefined())

    wire([5, 0], [300, 0])
    rerender({ ids: ['b'] })
    await waitFor(() => expect(result.current.b).toBeDefined())

    // 'a' لم تُمحَ: فتح قائمة المؤرشف يطلب معرّفات أخرى، ولا يجوز أن يُفرّغ
    // أرقام القائمة النشطة التي وصلت قبله.
    expect(result.current.a).toEqual({ travelerCount: 2, totalSpent: 100 })
    expect(result.current.b).toEqual({ travelerCount: 5, totalSpent: 300 })
  })
})
