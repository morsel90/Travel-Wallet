import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAccountLink } from './useAccountLink'

const mocks = vi.hoisted(() => ({
  linkWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  credentialFromError: vi.fn(),
  httpsCallable: vi.fn(),
  merge: vi.fn(),
  getIdToken: vi.fn(),
  currentUser: null as { isAnonymous: boolean; getIdToken: () => Promise<string> } | null,
}))

vi.mock('firebase/auth', () => ({
  linkWithPopup: mocks.linkWithPopup,
  signInWithCredential: mocks.signInWithCredential,
  GoogleAuthProvider: class {
    static credentialFromError = mocks.credentialFromError
  },
}))

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))

vi.mock('../firebase', () => ({
  functions: {},
  auth: { get currentUser() { return mocks.currentUser } },
}))

const anonymousUser = () => ({ isAnonymous: true, getIdToken: mocks.getIdToken })
const err = (code: string) => Object.assign(new Error(code), { code })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser = anonymousUser()
  mocks.getIdToken.mockResolvedValue('anon-token')
  mocks.httpsCallable.mockReturnValue(mocks.merge)
  mocks.merge.mockResolvedValue({ data: { merged: 2 } })
})

describe('useAccountLink — المسار السعيد', () => {
  it('يربط الحساب ويستدعي onLinked دون أي نقل بيانات', async () => {
    mocks.linkWithPopup.mockResolvedValue({})
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkAccount() })

    expect(outcome).toEqual({ status: 'linked' })
    expect(onLinked).toHaveBeenCalledTimes(1)
    // الربط يحتفظ بنفس الـ uid، فلا شيء يُنقل ولا تُستدعى دالة الدمج إطلاقاً
    expect(mocks.merge).not.toHaveBeenCalled()
    expect(result.current.linkError).toBeNull()
  })

  it('لا يفعل شيئاً لمستخدم غير مجهول — الحساب الدائم لا يحتاج ترقية', async () => {
    mocks.currentUser = { isAnonymous: false, getIdToken: mocks.getIdToken }
    const { result } = renderHook(() => useAccountLink())

    let outcome
    await act(async () => { outcome = await result.current.linkAccount() })

    expect(outcome).toBeNull()
    expect(mocks.linkWithPopup).not.toHaveBeenCalled()
  })
})

// ⚠️ هذا هو الجزء الذي يُغفَل عادةً: عند وجود جلسة سابقة لحساب Google (سيناريو
// الجهاز الثاني) يتغيّر الـ uid وتُيتَّم عضويات الجلسة المجهولة.
describe('useAccountLink — مسار التعارض (credential-already-in-use)', () => {
  beforeEach(() => {
    mocks.linkWithPopup.mockRejectedValue(err('auth/credential-already-in-use'))
    mocks.credentialFromError.mockReturnValue({ providerId: 'google.com' })
    mocks.signInWithCredential.mockResolvedValue({})
  })

  it('يسجّل الدخول بالحساب القائم ثم ينقل العضويات', async () => {
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkAccount() })

    expect(outcome).toEqual({ status: 'merged', merged: 2 })
    expect(mocks.signInWithCredential).toHaveBeenCalled()
    expect(mocks.merge).toHaveBeenCalledWith({ previousIdToken: 'anon-token' })
    expect(onLinked).toHaveBeenCalledTimes(1)
  })

  it('يلتقط توكن الجلسة المجهولة قبل تبديل الحساب لا بعده', async () => {
    // ⚠️ الترتيب هو جوهر الأمان هنا: بعد signInWithCredential يتغيّر
    // auth.currentUser فلا يبقى سبيل لإثبات ملكية الجلسة السابقة. التوكن نفسه
    // هو الإثبات، ويجب أن يُلتقط قبل التبديل.
    const order: string[] = []
    mocks.getIdToken.mockImplementation(async () => { order.push('getIdToken'); return 'anon-token' })
    mocks.signInWithCredential.mockImplementation(async () => { order.push('signIn'); return {} })
    mocks.merge.mockImplementation(async () => { order.push('merge'); return { data: { merged: 1 } } })

    const { result } = renderHook(() => useAccountLink())
    await act(async () => { await result.current.linkAccount() })

    expect(order).toEqual(['getIdToken', 'signIn', 'merge'])
  })

  it('فشل الدمج وحده لا يُعرض كفشل كامل — الحساب جاهز والرحلات تحتاج رمزاً', async () => {
    mocks.merge.mockRejectedValue(err('functions/internal'))
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    await act(async () => { await result.current.linkAccount() })

    expect(result.current.linkError).toContain('تم تسجيل الدخول')
    expect(result.current.linkError).toContain('إعادة إدخال رموزها')
    // تسجيل الدخول نجح فعلاً، فالمتابعة صحيحة رغم فشل النقل
    expect(onLinked).toHaveBeenCalledTimes(1)
  })

  it('بلوغ حدّ حجم الـ claims أثناء الدمج يعطي رسالة تخصّه', async () => {
    mocks.merge.mockRejectedValue(err('functions/resource-exhausted'))
    const { result } = renderHook(() => useAccountLink())

    await act(async () => { await result.current.linkAccount() })

    expect(result.current.linkError).toContain('الحد الأقصى')
  })
})

describe('useAccountLink — الإلغاء والأخطاء', () => {
  it.each([
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/user-cancelled',
  ])('إغلاق النافذة (%s) ليس خطأً ولا يعرض رسالة حمراء', async code => {
    mocks.linkWithPopup.mockRejectedValue(err(code))
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkAccount() })

    expect(outcome).toEqual({ status: 'cancelled' })
    expect(result.current.linkError).toBeNull()
    expect(onLinked).not.toHaveBeenCalled()
  })

  it('حجب النافذة المنبثقة يعطي رسالة قابلة للتنفيذ', async () => {
    mocks.linkWithPopup.mockRejectedValue(err('auth/popup-blocked'))
    const { result } = renderHook(() => useAccountLink())

    await act(async () => { await result.current.linkAccount() })

    expect(result.current.linkError).toContain('حجب المتصفح')
  })

  it('يحرّر قفل الإرسال بعد الفشل فيبقى الزر قابلاً لإعادة المحاولة', async () => {
    mocks.linkWithPopup.mockRejectedValue(err('auth/network-request-failed'))
    const { result } = renderHook(() => useAccountLink())

    await act(async () => { await result.current.linkAccount() })

    expect(result.current.isLinking).toBe(false)
    expect(result.current.linkError).not.toBeNull()

    act(() => result.current.clearLinkError())
    expect(result.current.linkError).toBeNull()
  })
})
