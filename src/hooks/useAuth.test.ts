import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from './useAuth'
import { auth } from '../firebase'

// firebase/auth واجهة الاتصال الحقيقية بالخادم — نستبدلها بالكامل حتى لا يحدث
// أي اتصال شبكة فعلي، ونتحكم يدوياً بمتى ينطلق onAuthStateChanged وبأي مستخدم،
// وبنجاح/فشل كل مسار تسجيل دخول (Google/بريد) على حدة.
const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  // 🆕 مُنشئ بسيط يكفي: الكود لا يفحص شكل المزوّد، فقط يمرّره لـ signInWithPopup/Redirect.
  GoogleAuthProvider: vi.fn().mockImplementation(() => ({})),
  signInWithPopup: mocks.signInWithPopup,
  signInWithRedirect: mocks.signInWithRedirect,
  getRedirectResult: mocks.getRedirectResult,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
}))

vi.mock('../firebase', () => ({ auth: {} }))

/** يحاكي خطأ Firebase Auth كما يصل للعميل: كائن Error بحقل code إضافي. */
function authError(code: string) {
  return Object.assign(new Error(code), { code })
}

// TRIP_ID يُحسب من window.location.search عند تحميل الوحدة — في بيئة الاختبار
// (بلا ?trip=) يستقرّ دائماً على الرحلة الافتراضية المُعرَّفة في utils/tripId.ts.
const TRIP_ID = 'travelapp-87206'

function mkUser(claims: Record<string, unknown>) {
  return {
    uid: 'uid-1',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  // 🆕 لا محاولة إعادة توجيه معلَّقة في الحالة الافتراضية لكل اختبار.
  mocks.getRedirectResult.mockResolvedValue(null)
  // onAuthStateChanged الحقيقية تُعيد دالة إلغاء اشتراك دائماً — الـ hook يستدعيها
  // عند التفكيك، فلا بد أن يعكس الموك ذلك بدل إعادة undefined.
  mocks.onAuthStateChanged.mockReturnValue(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/**
 * يستخرج دالة الاستماع المُسجَّلة عبر onAuthStateChanged ويستدعيها بمستخدم
 * معيّن ضمن act، وينتظر اكتمال كل ما بداخل الـ hook من await.
 */
async function fireAuthChange(user: unknown, callIndex = 0) {
  const callback = mocks.onAuthStateChanged.mock.calls[callIndex][1]
  await act(async () => {
    await callback(user)
  })
}

describe('useAuth', () => {
  describe('استعادة الجلسة عند التحميل', () => {
    it('يبدأ بحالة تحميل قبل استقرار حالة المصادقة', () => {
      const { result } = renderHook(() => useAuth())
      expect(result.current.authLoading).toBe(true)
      expect(result.current.user).toBeNull()
    })

    it('عند عدم وجود مستخدم (لا جلسة محفوظة) ينهي التحميل بلا مستخدم', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(null)
      expect(result.current.user).toBeNull()
      expect(result.current.authLoading).toBe(false)
    })

    // ⚠️ لا signInAnonymously بعد الآن على الإطلاق — انظر docs/DECISIONS.md.
    // هذا الاختبار يثبّت غيابها الكامل، لا مجرّد تأجيلها كما كان سابقاً.
    it('لا يُنشئ أي جلسة مجهولة تلقائياً عند غياب المستخدم', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(null)
      expect(result.current.user).toBeNull()
      // لا استدعاء لأي من دوال تسجيل الدخول تلقائياً
      expect(mocks.signInWithPopup).not.toHaveBeenCalled()
      expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
    })

    it('مسؤول مستعاد من جلسة محفوظة يبقى مسؤولاً', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ admin: true }))
      expect(result.current.isAdmin).toBe(true)
      expect(result.current.authLoading).toBe(false)
    })

    it('تسجيل الخروج من وضع المسؤول يُعيد الحالة لغير مسؤول ويُفرغ الرحلات', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ admin: true, trips: { 'trip-a': true } }))
      expect(result.current.isAdmin).toBe(true)

      await fireAuthChange(null)
      expect(result.current.isAdmin).toBe(false)
      expect(result.current.joinedTripIds).toEqual([])
    })
  })

  describe('انقطاع الشبكة أثناء استعادة الجلسة', () => {
    afterEach(() => {
      ;(auth as { currentUser: unknown }).currentUser = null
    })

    it('فشل تحديث التوكن (بلا اتصال) لا يُبقي الشاشة عالقة في التحميل', async () => {
      const { result } = renderHook(() => useAuth())
      const user = mkUser({})
      user.getIdTokenResult.mockRejectedValue(authError('auth/network-request-failed'))

      await fireAuthChange(user)

      expect(result.current.authLoading).toBe(false)
      expect(result.current.user).toBe(user)
    })

    // 🐛 هذا بالضبط ما كان يُظهر شاشة «رحلاتي» بحالة "لم تنضم لأي رحلة بعد"
    // خطأً لمستخدم منضمّ فعلاً: فشل تحديث التوكن بلا كاش محلي كان يترك
    // joinedTripIds على افتراضيها الفارغ بصمت.
    it('فشل تحديث التوكن بلا أي كاش محلي سابق يبقي isAdmin/joinedTripIds على الافتراضي الفارغ', async () => {
      const { result } = renderHook(() => useAuth())
      const user = mkUser({})
      user.getIdTokenResult.mockRejectedValue(authError('auth/network-request-failed'))

      await fireAuthChange(user)

      expect(result.current.isAdmin).toBe(false)
      expect(result.current.joinedTripIds).toEqual([])
    })

    it('فشل تحديث التوكن مع وجود كاش محلي من مزامنة سابقة ناجحة يستعيد آخر isAdmin/joinedTripIds بدل الفارغ', async () => {
      // جلسة أولى ناجحة (متصلة) تكتب الكاش المحلي لهذا المستخدم
      const { unmount: unmount1 } = renderHook(() => useAuth())
      const onlineUser = mkUser({ admin: true, trips: { [TRIP_ID]: true } })
      await fireAuthChange(onlineUser, 0)
      unmount1()

      // جلسة ثانية لاحقة (مثلاً بعد إغلاق التطبيق) لنفس المستخدم، لكن بلا اتصال
      const { result: result2 } = renderHook(() => useAuth())
      const offlineUser = mkUser({})
      offlineUser.uid = onlineUser.uid
      offlineUser.getIdTokenResult.mockRejectedValue(authError('auth/network-request-failed'))
      await fireAuthChange(offlineUser, 1)

      expect(result2.current.isAdmin).toBe(true)
      expect(result2.current.joinedTripIds).toEqual([TRIP_ID])
    })

    it('عودة الاتصال (حدث online) تُعيد محاولة المزامنة تلقائياً دون إعادة تحميل الصفحة', async () => {
      const { result } = renderHook(() => useAuth())
      const user = mkUser({})
      user.getIdTokenResult.mockRejectedValueOnce(authError('auth/network-request-failed'))

      await fireAuthChange(user)
      expect(result.current.authLoading).toBe(false)
      expect(result.current.isAdmin).toBe(false)

      user.getIdTokenResult.mockResolvedValueOnce({ claims: { admin: true, trips: { [TRIP_ID]: true } } })
      ;(auth as { currentUser: unknown }).currentUser = user

      await act(async () => {
        window.dispatchEvent(new Event('online'))
        await Promise.resolve()
      })

      expect(result.current.isAdmin).toBe(true)
      expect(result.current.joinedTripIds).toEqual([TRIP_ID])
    })

    it('حدث online بلا مستخدم حالي (auth.currentUser فارغ) لا يفعل شيئاً', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(null)

      await act(async () => {
        window.dispatchEvent(new Event('online'))
        await Promise.resolve()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.authLoading).toBe(false)
    })
  })

  describe('قراءة خريطة trips من الـ claims', () => {
    it('joinedTripIds يعكس كل الرحلات المنضم لها من خريطة claims', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ trips: { [TRIP_ID]: true, 'trip-b': true } }))
      expect(result.current.joinedTripIds.sort()).toEqual([TRIP_ID, 'trip-b'].sort())
    })

    it('joinedTripIds يتجاهل الرحلات ذات القيمة false', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ trips: { 'trip-a': true, 'trip-b': false } }))
      expect(result.current.joinedTripIds).toEqual(['trip-a'])
    })

    it('joinedTripIds متاح للمسؤول أيضاً', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ admin: true, trips: { 'trip-a': true } }))
      expect(result.current.isAdmin).toBe(true)
      expect(result.current.joinedTripIds).toEqual(['trip-a'])
    })

    it('صيغة claims قديمة/غير متوقّعة (member: true بلا خريطة trips) لا تُسقط التدفق', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ member: true }))
      expect(result.current.joinedTripIds).toEqual([])
      expect(result.current.authLoading).toBe(false) // لا انهيار، فقط قائمة فارغة
    })

    it('خريطة trips بصيغة غير كائن (مصفوفة) تُعامَل كفارغة', async () => {
      const { result } = renderHook(() => useAuth())
      await fireAuthChange(mkUser({ trips: ['trip-a'] }))
      expect(result.current.joinedTripIds).toEqual([])
    })
  })

  describe('signInWithGoogle', () => {
    it('نجاح النافذة المنبثقة لا يترك خطأً ولا يتراجع لإعادة التوجيه', async () => {
      mocks.signInWithPopup.mockResolvedValue({})
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1)
      expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
      expect(result.current.signInError).toBeNull()
      expect(result.current.isSigningIn).toBe(false)
    })

    it('إلغاء المستخدم للنافذة (popup-closed-by-user) لا يُعرَض كخطأ', async () => {
      mocks.signInWithPopup.mockRejectedValue(authError('auth/popup-closed-by-user'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(result.current.signInError).toBeNull()
      expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
    })

    // ⚠️ هذا هو مسار متصفحات واتساب/تيليجرام المدمجة — النافذة المنبثقة غير
    // مدعومة هناك أصلاً (auth/operation-not-supported-in-this-environment).
    it('بيئة لا تدعم النافذة المنبثقة تتراجع تلقائياً لـ signInWithRedirect', async () => {
      mocks.signInWithPopup.mockRejectedValue(authError('auth/operation-not-supported-in-this-environment'))
      mocks.signInWithRedirect.mockResolvedValue(undefined)
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1)
      expect(result.current.signInError).toBeNull()
    })

    it('نافذة محجوبة (popup-blocked) تتراجع أيضاً لإعادة التوجيه', async () => {
      mocks.signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'))
      mocks.signInWithRedirect.mockResolvedValue(undefined)
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1)
    })

    it('فشل إعادة التوجيه نفسه (بعد التراجع إليه) يعرض رسالة "جرّب متصفحاً آخر"', async () => {
      mocks.signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'))
      mocks.signInWithRedirect.mockRejectedValue(authError('auth/internal-error'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(result.current.signInError).toContain('متصفحاً آخر')
    })

    it('خطأ آخر غير مصنَّف كإلغاء أو كبيئة غير مدعومة يعرض رسالة عامة', async () => {
      mocks.signInWithPopup.mockRejectedValue(authError('auth/network-request-failed'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithGoogle() })

      expect(result.current.signInError).not.toBeNull()
      expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
    })

    it('isSigningIn صحيحة أثناء الاستدعاء وتعود false بعده', async () => {
      let resolvePopup!: () => void
      mocks.signInWithPopup.mockReturnValue(new Promise<void>(resolve => { resolvePopup = resolve }))
      const { result } = renderHook(() => useAuth())

      let pending!: Promise<void>
      act(() => { pending = result.current.signInWithGoogle() })
      expect(result.current.isSigningIn).toBe(true)

      await act(async () => { resolvePopup(); await pending })
      expect(result.current.isSigningIn).toBe(false)
    })
  })

  describe('إكمال إعادة التوجيه (getRedirectResult عند التحميل)', () => {
    it('لا يفعل شيئاً حين لا توجد عملية إعادة توجيه معلّقة', async () => {
      mocks.getRedirectResult.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth())
      await act(async () => { await Promise.resolve() })
      expect(result.current.signInError).toBeNull()
    })

    it('فشل إكمال إعادة التوجيه يعرض رسالة خطأ', async () => {
      mocks.getRedirectResult.mockRejectedValue(authError('auth/internal-error'))
      const { result } = renderHook(() => useAuth())
      await act(async () => { await Promise.resolve().then(() => Promise.resolve()) })
      expect(result.current.signInError).toContain('تسجيل الدخول')
    })

    it('إلغاء المستخدم لإعادة التوجيه لا يُعرَض كخطأ', async () => {
      mocks.getRedirectResult.mockRejectedValue(authError('auth/user-cancelled'))
      const { result } = renderHook(() => useAuth())
      await act(async () => { await Promise.resolve().then(() => Promise.resolve()) })
      expect(result.current.signInError).toBeNull()
    })
  })

  describe('signInWithEmail', () => {
    it('mode="signIn" يستدعي signInWithEmailAndPassword', async () => {
      mocks.signInWithEmailAndPassword.mockResolvedValue({})
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signIn') })

      expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'secret1')
      expect(mocks.createUserWithEmailAndPassword).not.toHaveBeenCalled()
      expect(result.current.signInError).toBeNull()
    })

    it('mode="signUp" يستدعي createUserWithEmailAndPassword بدل تسجيل الدخول', async () => {
      mocks.createUserWithEmailAndPassword.mockResolvedValue({})
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signUp') })

      expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'secret1')
      expect(mocks.signInWithEmailAndPassword).not.toHaveBeenCalled()
    })

    it('user-not-found في وضع signIn يقترح إنشاء حساب بدل رسالة عامة', async () => {
      mocks.signInWithEmailAndPassword.mockRejectedValue(authError('auth/user-not-found'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signIn') })

      expect(result.current.signInError).toContain('إنشاء حساب')
    })

    it('email-already-in-use في وضع signUp يقترح تسجيل الدخول بدلاً منه', async () => {
      mocks.createUserWithEmailAndPassword.mockRejectedValue(authError('auth/email-already-in-use'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signUp') })

      expect(result.current.signInError).toContain('تسجيل الدخول')
    })

    it('wrong-password يعرض "كلمة المرور غير صحيحة"', async () => {
      mocks.signInWithEmailAndPassword.mockRejectedValue(authError('auth/wrong-password'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signIn') })

      expect(result.current.signInError).toContain('كلمة المرور')
    })

    it('weak-password يعرض رسالة الحد الأدنى لطول كلمة المرور', async () => {
      mocks.createUserWithEmailAndPassword.mockRejectedValue(authError('auth/weak-password'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', '123', 'signUp') })

      expect(result.current.signInError).toContain('6 خانات')
    })

    it('خطأ غير مصنَّف يسقط على رسالة عامة تناسب الوضع (دخول مقابل إنشاء)', async () => {
      mocks.signInWithEmailAndPassword.mockRejectedValue(authError('auth/network-request-failed'))
      const { result } = renderHook(() => useAuth())

      await act(async () => { await result.current.signInWithEmail('a@b.com', 'secret1', 'signIn') })

      expect(result.current.signInError).toContain('تسجيل الدخول')
    })
  })
})
