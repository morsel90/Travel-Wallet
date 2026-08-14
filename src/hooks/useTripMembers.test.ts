import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTripMembers } from './useTripMembers'

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  tripMembersCol: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({ getDocs: mocks.getDocs }))
vi.mock('../firestore', () => ({ tripMembersCol: mocks.tripMembersCol }))

/** يحاكي QuerySnapshot: docs بمعرّف ودالة data(). */
const snapshotOf = (rows: Array<{ uid: string } & Record<string, unknown>>) => ({
  docs: rows.map(({ uid, ...data }) => ({ id: uid, data: () => data })),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tripMembersCol.mockReturnValue({ __col: true })
  mocks.getDocs.mockResolvedValue(snapshotOf([]))
})

describe('useTripMembers — التعطيل', () => {
  it('لا يقرأ شيئاً وهو معطَّل — القراءة للمسؤول وحده فلا نستدعي خطأ صلاحية متوقَّعاً', async () => {
    const { result } = renderHook(() => useTripMembers('trip-1', false))
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(result.current.members).toBeNull()
  })

  it('لا يقرأ بلا معرّف رحلة', () => {
    renderHook(() => useTripMembers(null, true))
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('useTripMembers — الجلب', () => {
  it('يحوّل معرّف المستند إلى uid — فهو المعرّف نفسه لا حقل داخله', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([{ uid: 'u1', joinedAt: 5, email: 'a@b.c' }]))
    const { result } = renderHook(() => useTripMembers('trip-1', true))

    await waitFor(() => expect(result.current.members).not.toBeNull())
    expect(result.current.members).toEqual([{ uid: 'u1', joinedAt: 5, email: 'a@b.c' }])
  })

  // ⚠️ هذا سبب الترتيب في الذاكرة بدل orderBy في الاستعلام: استعلام Firestore
  // بـ orderBy على حقل **يُسقط المستندات التي لا تملكه تماماً**. والسطور التي
  // بناها سكربت الترحيل بلا joinedAt هي الأقدم — أي كانت ستختفي بالضبط السطور
  // التي تحتاج مراجعة المسؤول أكثر من غيرها، بلا أي رسالة خطأ.
  it('يُبقي السطور بلا joinedAt في القائمة ويضعها في آخرها', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { uid: 'old', backfilledAt: 999 },
      { uid: 'new', joinedAt: 100 },
      { uid: 'mid', joinedAt: 50 },
    ]))
    const { result } = renderHook(() => useTripMembers('trip-1', true))

    await waitFor(() => expect(result.current.members).not.toBeNull())
    expect(result.current.members?.map(m => m.uid)).toEqual(['new', 'mid', 'old'])
    expect(result.current.members?.find(m => m.uid === 'old')?.joinedAt).toBeUndefined()
  })

  it('فشل القراءة يرفع error ولا يترك قائمة نصف محمّلة', async () => {
    mocks.getDocs.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    const { result } = renderHook(() => useTripMembers('trip-1', true))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.members).toBeNull()
  })
})

describe('useTripMembers — refresh', () => {
  it('يعيد الجلب عند الطلب — وهو ما تعتمد عليه اللوحة بعد إزالة عضو', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([{ uid: 'u1', joinedAt: 1 }, { uid: 'u2', joinedAt: 2 }]))
    const { result } = renderHook(() => useTripMembers('trip-1', true))
    await waitFor(() => expect(result.current.members).toHaveLength(2))

    mocks.getDocs.mockResolvedValue(snapshotOf([{ uid: 'u2', joinedAt: 2 }]))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.members).toHaveLength(1))
    expect(mocks.getDocs).toHaveBeenCalledTimes(2)
  })
})
