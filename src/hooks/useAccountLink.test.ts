import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAccountLink } from './useAccountLink'

const mocks = vi.hoisted(() => ({
  linkWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  credentialFromError: vi.fn(),
  httpsCallable: vi.fn(),
  merge: vi.fn(),
  getIdToken: vi.fn(),
  markUidChanged: vi.fn(),
  currentUser: null as { isAnonymous: boolean; getIdToken: () => Promise<string> } | null,
}))

// 🆕 يُعلن أن uid تغيّر (utils/mergeNotice.ts) — يُستهلَك بعد إعادة التحميل
// التالية لتحذير المستخدم أن مصاريفه القديمة (createdByUid غير المنقول عمداً)
// أصبحت للعرض فقط له. نتحقق هنا فقط من *متى* يُستدعى، لا من تفاصيله الداخلية
// (لها اختباراتها الخاصة في mergeNotice.test.ts).
vi.mock('../utils/mergeNotice', () => ({ markUidChanged: mocks.markUidChanged }))

vi.mock('firebase/auth', () => ({
  linkWithPopup: mocks.linkWithPopup,
  linkWithCredential: mocks.linkWithCredential,
  signInWithCredential: mocks.signInWithCredential,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  GoogleAuthProvider: class {
    static credentialFromError = mocks.credentialFromError
  },
  EmailAuthProvider: class {
    static credential = (email: string, password: string) => ({ email, password })
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
    // ولا حاجة لتحذير «مصاريفك القديمة أصبحت للعرض فقط» — uid لم يتغيّر أصلاً
    expect(mocks.markUidChanged).not.toHaveBeenCalled()
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
    // ⚠️ uid تغيّر فعلاً هنا — العلم يُرفع بغضّ النظر عن نجاح الدمج التالي،
    // لأن مصاريف الـ uid القديم تصبح للعرض فقط بمجرد تبديل الحساب، لا بنجاح النقل.
    expect(mocks.markUidChanged).toHaveBeenCalledTimes(1)
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

  // ⚠️ onLinked يُعيد تحميل الصفحة فوراً (السلوك الحقيقي في SaveAccountBanner)،
  // فلا وقت لاحقاً لرفع العلم — يجب أن يُرفع *قبل* onLinked لا بعده أو معه.
  it('markUidChanged يُستدعى قبل onLinked المُعيد للتحميل', async () => {
    const order: string[] = []
    mocks.markUidChanged.mockImplementation(() => { order.push('markUidChanged') })
    const onLinked = vi.fn(() => { order.push('onLinked') })

    const { result } = renderHook(() => useAccountLink(onLinked))
    await act(async () => { await result.current.linkAccount() })

    expect(order).toEqual(['markUidChanged', 'onLinked'])
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

describe('useAccountLink — linkWithEmail — المسار السعيد', () => {
  it('يربط حساباً بريدياً جديداً ويستدعي onLinked دون نقل بيانات', async () => {
    mocks.linkWithCredential.mockResolvedValue({})
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkWithEmail('a@b.com', 'secret1') })

    expect(outcome).toEqual({ status: 'linked' })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(mocks.merge).not.toHaveBeenCalled()
    expect(mocks.markUidChanged).not.toHaveBeenCalled()
  })

  it('لا يفعل شيئاً لمستخدم غير مجهول', async () => {
    mocks.currentUser = { isAnonymous: false, getIdToken: mocks.getIdToken }
    const { result } = renderHook(() => useAccountLink())

    let outcome
    await act(async () => { outcome = await result.current.linkWithEmail('a@b.com', 'secret1') })

    expect(outcome).toBeNull()
    expect(mocks.linkWithCredential).not.toHaveBeenCalled()
  })

  it('كلمة مرور ضعيفة ترفضها Firebase تُعرض برسالة واضحة', async () => {
    mocks.linkWithCredential.mockRejectedValue(err('auth/weak-password'))
    const { result } = renderHook(() => useAccountLink())

    await act(async () => { await result.current.linkWithEmail('a@b.com', '123') })

    expect(result.current.linkError).toContain('كلمة المرور قصيرة')
  })

  it('بريد بصياغة غير صالحة تُعرض برسالة واضحة', async () => {
    mocks.linkWithCredential.mockRejectedValue(err('auth/invalid-email'))
    const { result } = renderHook(() => useAccountLink())

    await act(async () => { await result.current.linkWithEmail('not-an-email', 'secret1') })

    expect(result.current.linkError).toContain('البريد الإلكتروني غير صالح')
  })
})

// ⚠️ هذا هو مسار "الجهاز الثاني" لكن بالبريد: بريد مسجَّل مسبقاً يعني إما نفس
// المستخدم يستعيد وصوله، أو محاولة انتحال — والتمييز الوحيد كلمة المرور.
describe('useAccountLink — linkWithEmail — مسار التعارض (email-already-in-use)', () => {
  beforeEach(() => {
    mocks.linkWithCredential.mockRejectedValue(err('auth/email-already-in-use'))
  })

  it('كلمة المرور الصحيحة تسجّل الدخول وتنقل العضويات', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({})
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkWithEmail('a@b.com', 'correct1') })

    expect(outcome).toEqual({ status: 'merged', merged: 2 })
    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'correct1')
    expect(mocks.merge).toHaveBeenCalledWith({ previousIdToken: 'anon-token' })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(mocks.markUidChanged).toHaveBeenCalledTimes(1)
  })

  // ⚠️ الحالة السالبة الأهم هنا: كلمة مرور خاطئة يجب ألا تسجّل دخولاً ولا تدمج
  // شيئاً — لا نخمّن ولا "نجرّب على أي حال".
  it('كلمة المرور الخاطئة تُرفض بلا تسجيل دخول ولا دمج', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValue(err('auth/wrong-password'))
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    let outcome
    await act(async () => { outcome = await result.current.linkWithEmail('a@b.com', 'wrong') })

    expect(outcome).toBeNull()
    expect(result.current.linkError).toContain('كلمة مرور مختلفة')
    expect(mocks.merge).not.toHaveBeenCalled()
    expect(onLinked).not.toHaveBeenCalled()
    // ⚠️ uid لم يتغيّر أصلاً (تسجيل الدخول فشل) — رفع العلم هنا كان سيحذّر
    // المستخدم زوراً من أثر لم يقع.
    expect(mocks.markUidChanged).not.toHaveBeenCalled()
  })

  it('يلتقط توكن الجلسة المجهولة قبل تسجيل الدخول لا بعده', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({})
    const order: string[] = []
    mocks.getIdToken.mockImplementation(async () => { order.push('getIdToken'); return 'anon-token' })
    mocks.signInWithEmailAndPassword.mockImplementation(async () => { order.push('signIn'); return {} })
    mocks.merge.mockImplementation(async () => { order.push('merge'); return { data: { merged: 1 } } })

    const { result } = renderHook(() => useAccountLink())
    await act(async () => { await result.current.linkWithEmail('a@b.com', 'correct1') })

    expect(order).toEqual(['getIdToken', 'signIn', 'merge'])
  })

  it('فشل الدمج وحده لا يُعرض كفشل كامل', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({})
    mocks.merge.mockRejectedValue(err('functions/internal'))
    const onLinked = vi.fn()
    const { result } = renderHook(() => useAccountLink(onLinked))

    await act(async () => { await result.current.linkWithEmail('a@b.com', 'correct1') })

    expect(result.current.linkError).toContain('تم تسجيل الدخول')
    expect(onLinked).toHaveBeenCalledTimes(1)
  })
})

describe('useAccountLink — resetPassword', () => {
  it('يرسل رابط إعادة التعيين ويُرجع true عند النجاح', async () => {
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAccountLink())

    let ok
    await act(async () => { ok = await result.current.resetPassword('a@b.com') })

    expect(ok).toBe(true)
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'a@b.com')
  })

  it('يُرجع false عند الفشل بدل رمي الاستثناء', async () => {
    mocks.sendPasswordResetEmail.mockRejectedValue(err('auth/invalid-email'))
    const { result } = renderHook(() => useAccountLink())

    let ok
    await act(async () => { ok = await result.current.resetPassword('bad') })

    expect(ok).toBe(false)
  })
})
