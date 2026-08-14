// اختبارات مسار إزالة العضو وحده من useTripAdminActions — بقية الدوال تكتب
// مباشرةً عبر القواعد وتغطّيها اختبارات firestore.rules.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTripAdminActions } from './useTripAdminActions'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  httpsCallable: vi.fn(),
  callable: vi.fn(),
  getIdToken: vi.fn(),
  currentUser: null as { getIdToken: (force?: boolean) => Promise<string> } | null,
}))

vi.mock('firebase/firestore', () => ({ setDoc: mocks.setDoc }))
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))
vi.mock('../firebase', () => ({
  functions: {},
  auth: { get currentUser() { return mocks.currentUser } },
}))
vi.mock('../firestore', () => ({ tripDocById: vi.fn(() => ({})) }))
vi.mock('../utils/haptics', () => ({ haptic: { success: vi.fn(), error: vi.fn() } }))

const showToast = vi.fn()
const handleFirestoreError = vi.fn()

const setup = (isAdmin = true) =>
  renderHook(() => useTripAdminActions({ isAdmin, showToast, handleFirestoreError }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser = { getIdToken: mocks.getIdToken }
  mocks.getIdToken.mockResolvedValue('tok')
  mocks.httpsCallable.mockReturnValue(mocks.callable)
  mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: true, stillHasAccess: false } })
})

describe('removeMember — الصلاحية والعقد', () => {
  it('غير المسؤول لا يستدعي الدالة إطلاقاً', async () => {
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('يستدعي manageMember بالوضع والمعرّفين الصحيحة', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageMember')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'remove', tripId: 'trip-1', uid: 'u1' })
  })

  // ⚠️ الـ claim لا يتحدّث إلا بتوكن جديد؛ مسؤولٌ مُنح صلاحيته للتوّ يحمل توكناً
  // بلا admin، فتردّه الدالة بـ permission-denied رغم أنه مسؤول فعلاً.
  it('يجدّد التوكن قبل الاستدعاء', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })
    expect(mocks.getIdToken).toHaveBeenCalledWith(true)
  })
})

// ⚠️ الرسالة ليست تجميلاً: «تمت الإزالة» وحدها تكذب في حالتين مختلفتين، وفي
// إحداهما قد يعتمد المسؤول عليها في تسرّب فعلي للرمز.
describe('removeMember — الرسالة تقول ما حدث فعلاً', () => {
  it('الإزالة الناجحة تذكر تأخير الساعة صراحةً', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(showToast.mock.calls[0][0].text).toContain('حتى ساعة')
  })

  it('إزالة مسؤول تُعلن أن وصوله باقٍ — صلاحيته عامة لا تمرّ بعضوية الرحلة', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: true, stillHasAccess: true } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'admin-2') })

    const text = showToast.mock.calls[0][0].text
    expect(text).toContain('مسؤول')
    expect(text).not.toContain('حتى ساعة')
  })

  it('من لم يكن عضواً: تنظيف سطر لا إزالة — ولا يُوعَد بقطع وصول لم يقع', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: false, stillHasAccess: false } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'ghost') })

    expect(showToast.mock.calls[0][0].text).toContain('لم يكن عضواً')
  })
})

describe('removeMember — الفشل', () => {
  it('رسالة الدالة العربية تُعرض كما هي', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا الإجراء متاح للمسؤول فقط.'), { code: 'functions/permission-denied' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا الإجراء متاح للمسؤول فقط.')
  })

  it('خطأ غير خاص بالدوال يمرّ لمعالج أخطاء Firestore', async () => {
    mocks.callable.mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(handleFirestoreError).toHaveBeenCalled()
  })

  it('يحرّر علم الحفظ بعد الفشل فيبقى الزر قابلاً لإعادة المحاولة', async () => {
    mocks.callable.mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(result.current.isSaving).toBe(false)
  })
})
