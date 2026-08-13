import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from './useAuth'

// firebase/auth واجهة الاتصال الحقيقية بالخادم — نستبدلها بالكامل حتى لا يحدث
// أي اتصال شبكة فعلي، ونتحكم يدوياً بمتى ينطلق onAuthStateChanged وبأي مستخدم.
const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  // كائن auth قابل للتحوير (mutable) — يحاكي auth.currentUser الحقيقي الذي
  // يُحدَّثه SDK فايربيس نفسه عند كل تغيّر لحالة المصادقة، والذي يعتمد عليه
  // callVerify مباشرة (لا على وسيط دالة onAuthStateChanged).
  authObj: { currentUser: null as unknown },
  // 🆕 الدالة التي يُرجعها httpsCallable — هي ما يُستدعى فعلياً بالحمولة
  callVerifyFn: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInAnonymously: mocks.signInAnonymously,
}))

// 🆕 استُبدل fetch الخام بـ httpsCallable من SDK — انظر التعليق في useAuth.ts.
// نحاكي المصنع نفسه ليُرجع دالتنا، فنتحكم في الاستجابة والخطأ معاً.
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mocks.callVerifyFn,
}))

vi.mock('../firebase', () => ({ auth: mocks.authObj, functions: {} }))

/** يحاكي خطأ دالة سحابية كما يصل للعميل: code بصيغة functions/... مع details. */
function functionsError(code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), { code, details })
}

// TRIP_ID يُحسب من window.location.search عند تحميل الوحدة — في بيئة الاختبار
// (بلا ?trip=) يستقرّ دائماً على الرحلة الافتراضية المُعرَّفة في utils/tripId.ts.
const TRIP_ID = 'travelapp-87206'
const pinStorageKey = `travelapp_trip_pin_${TRIP_ID}`

function mkUser(claims: Record<string, unknown>) {
  return {
    uid: 'uid-1',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
    getIdToken: vi.fn().mockResolvedValue('id-token'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInAnonymously.mockResolvedValue(undefined)
  mocks.authObj.currentUser = null
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/**
 * يستخرج دالة الاستماع المُسجَّلة عبر onAuthStateChanged ويستدعيها بمستخدم
 * معيّن ضمن act — يضبط auth.currentUser أولاً كما يفعل SDK فايربيس الحقيقي
 * قبل إشعار المستمعين، وينتظر اكتمال كل ما بداخل الـ hook من await.
 */
async function fireAuthChange(user: unknown) {
  mocks.authObj.currentUser = user
  const callback = mocks.onAuthStateChanged.mock.calls[0][1]
  await act(async () => {
    await callback(user)
  })
}

describe('useAuth', () => {
  it('يبدأ بحالة تحميل قبل استقرار حالة المصادقة', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.pinCheckLoading).toBe(true)
    expect(result.current.user).toBeNull()
    expect(result.current.needsTripPin).toBe(false)
  })

  it('عند عدم وجود مستخدم (تسجيل خروج) ينهي التحميل دون طلب رمز', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(null)
    expect(result.current.user).toBeNull()
    expect(result.current.pinCheckLoading).toBe(false)
    expect(result.current.needsTripPin).toBe(false)
  })

  // ── اختبارات انحدار: طرد المسؤول عند إعادة التحميل ───────────────────────
  // ⚠️ كان signInAnonymously يُستدعى بلا شرط عند كل تحميل. وسلوك Firebase أن
  // إنشاء جلسة مجهولة بينما المستخدم الحالي غير مجهول يُحلّها محلّه — أي يطرد
  // المسؤول. ظهر الأثر عند التبديل بين الرحلات لأنه إعادة تحميل كاملة.
  it('لا يُنشئ جلسة مجهولة عند التحميل قبل أن تُستعاد الجلسة المحفوظة', () => {
    renderHook(() => useAuth())
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('مسؤول مستعاد من جلسة محفوظة يبقى مسؤولاً ولا يُستبدل بحساب مجهول', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ admin: true }))

    expect(result.current.isAdmin).toBe(true)
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('عضو عادي مستعاد من جلسة محفوظة لا يُستبدل بحساب مجهول جديد', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ trips: { [TRIP_ID]: true } }))

    expect(result.current.needsTripPin).toBe(false)
    // حساب مجهول جديد يعني uid جديداً بلا أي عضويات — وضياع رحلات المستخدم
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('يُنشئ جلسة مجهولة فقط حين يتبيّن فعلاً عدم وجود مستخدم', async () => {
    renderHook(() => useAuth())
    await fireAuthChange(null)
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('لا يُنشئ حسابين مجهولين عند تكرار حدث غياب المستخدم', async () => {
    // حسابان مجهولان متزامنان = uid ثانٍ بلا claims، فتضيع عضويات الأول
    mocks.signInAnonymously.mockReturnValue(new Promise(() => {})) // معلّق: يحاكي طلباً لم يكتمل بعد
    renderHook(() => useAuth())
    await fireAuthChange(null)
    await fireAuthChange(null)
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('تسجيل الخروج من وضع المسؤول يُعيد الحالة لغير مسؤول ويُفرغ الرحلات', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ admin: true, trips: { 'trip-a': true } }))
    expect(result.current.isAdmin).toBe(true)

    await fireAuthChange(null)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.joinedTripIds).toEqual([])
  })

  it('مستخدم بصلاحية admin claim لا يحتاج رمز الرحلة', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ admin: true }))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.needsTripPin).toBe(false)
    expect(result.current.pinCheckLoading).toBe(false)
  })

  it('مستخدم يملك claim trips لهذه الرحلة تحديداً لا يحتاج رمز', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ trips: { [TRIP_ID]: true } }))
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.needsTripPin).toBe(false)
  })

  it('claim trips لرحلة أخرى لا يُعفي من رمز هذه الرحلة', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ trips: { 'رحلة-أخرى': true } }))
    expect(result.current.needsTripPin).toBe(true)
  })

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

  it('joinedTripIds متاح للمسؤول أيضاً رغم خروجه المبكر من فحص الرمز', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ admin: true, trips: { 'trip-a': true } }))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.joinedTripIds).toEqual(['trip-a'])
  })

  it('صيغة claims قديمة/غير متوقّعة (member: true بلا خريطة trips) لا تُسقط التدفق', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ member: true }))
    expect(result.current.joinedTripIds).toEqual([])
    expect(result.current.needsTripPin).toBe(true) // يُطلب الرمز من جديد، لا انهيار
  })

  it('خريطة trips بصيغة غير كائن (مصفوفة) تُعامَل كفارغة', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({ trips: ['trip-a'] }))
    expect(result.current.joinedTripIds).toEqual([])
    expect(result.current.needsTripPin).toBe(true)
  })

  it('التحقق الناجح من الرمز يضيف الرحلة لـ joinedTripIds فوراً', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useAuth())
    expect(result.current.joinedTripIds).toEqual([])

    await act(async () => {
      await result.current.verifyTripPin('4321')
    })

    expect(result.current.joinedTripIds).toEqual([TRIP_ID])
  })

  it('مستخدم بلا صلاحيات ولا رمز محفوظ محلياً يحتاج رمز الرحلة', async () => {
    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({}))
    expect(result.current.needsTripPin).toBe(true)
    expect(result.current.pinCheckLoading).toBe(false)
  })

  it('يتحقق تلقائياً من رمز محفوظ محلياً — نجاح فيتخطى شاشة إدخال الرمز', async () => {
    window.localStorage.setItem(pinStorageKey, '1234')
    mocks.callVerifyFn.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({}))

    expect(result.current.needsTripPin).toBe(false)
    expect(mocks.callVerifyFn).toHaveBeenCalledWith({ pin: '1234', tripId: TRIP_ID })
  })

  it('رمز محفوظ محلياً لم يعد صالحاً — يُمسح ويُطلب رمز جديد', async () => {
    window.localStorage.setItem(pinStorageKey, '9999')
    mocks.callVerifyFn.mockRejectedValue(functionsError('functions/permission-denied', 'رمز الرحلة غير صحيح.'))

    const { result } = renderHook(() => useAuth())
    await fireAuthChange(mkUser({}))

    expect(result.current.needsTripPin).toBe(true)
    expect(window.localStorage.getItem(pinStorageKey)).toBeNull()
  })

  it('verifyTripPin الناجح يحفظ الرمز محلياً وينهي الحاجة له', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useAuth())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.verifyTripPin('4321')
    })

    expect(success).toBe(true)
    expect(result.current.needsTripPin).toBe(false)
    expect(window.localStorage.getItem(pinStorageKey)).toBe('4321')
  })

  it('verifyTripPin الفاشل بلا حظر معدّل يعرض رسالة رمز غير صحيح', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(functionsError('functions/permission-denied', 'رمز الرحلة غير صحيح.'))

    const { result } = renderHook(() => useAuth())
    await act(async () => {
      await result.current.verifyTripPin('0000')
    })

    expect(result.current.pinError).toBe('رمز الرحلة غير صحيح، حاول مرة أخرى.')
    expect(result.current.rateLimitSeconds).toBeNull()
  })

  it('verifyTripPin يعيد false عند غياب auth.currentUser (لا يرمي استثناءً)', async () => {
    mocks.authObj.currentUser = null
    const { result } = renderHook(() => useAuth())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.verifyTripPin('0000')
    })
    expect(success).toBe(false)
    expect(mocks.callVerifyFn).not.toHaveBeenCalled()
  })

  it('تجاوز حدّ المحاولات يبدأ عدّاً تنازلياً يُصفّر الخطأ تلقائياً عند انتهائه', async () => {
    vi.useFakeTimers()
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/resource-exhausted', 'تجاوزت الحد المسموح', { retryAfter: 2 })
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => {
      await result.current.verifyTripPin('0000')
    })

    expect(result.current.rateLimitSeconds).toBe(2)
    expect(result.current.pinError).toBe('تجاوزت الحد المسموح')

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.rateLimitSeconds).toBe(1)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.rateLimitSeconds).toBeNull()
    expect(result.current.pinError).toBeNull() // يُصفَّر تلقائياً عند انتهاء العدّ
  })

  // ⚠️ اختبار انحدار: الدالة كانت ترمي HttpsError بلا details، فكان العميل يسقط
  // على 900 ثانية ويعرض «15 دقيقة» دائماً مهما كان المتبقي. أُصلح في
  // functions/index.js — وهذان الاختباران يثبّتان الطرفين.
  it('يستخدم retryAfter القادم من الخادم لا قيمة ثابتة', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/resource-exhausted', 'محظور', { retryAfter: 42 })
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.verifyTripPin('0000') })

    expect(result.current.rateLimitSeconds).toBe(42)
  })

  it('يسقط على 900 ثانية فقط حين لا يرسل الخادم retryAfter إطلاقاً', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/resource-exhausted', 'محظور')
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.verifyTripPin('0000') })

    expect(result.current.rateLimitSeconds).toBe(900)
  })

  it('خطأ دالة من نوع آخر لا يُفسَّر كحظر معدّل', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/internal', 'عطل داخلي')
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.verifyTripPin('0000') })

    expect(result.current.rateLimitSeconds).toBeNull()
    // 🆕 كان هذا التوكيد يطلب «رمز الرحلة غير صحيح» — أي أنه كان يثبّت العرَض
    // الذي أُصلح: رسالة واحدة تُخفي كل الأسباب. الغرض المعلن في اسم الاختبار
    // (ألّا يُفسَّر كحظر معدّل) محفوظ في التوكيد أعلاه ولم يتغيّر.
    expect(result.current.pinError).toContain('خطأ في الخادم')
    expect(result.current.pinError).not.toContain('رمز الرحلة غير صحيح')
  })

  // ⚠️ الحالة التي كلّف غموضها ساعتين في 2026-08-13: امتداد متصفح يُسقط ترويسة
  // Authorization ⇒ الدالة ترمي unauthenticated ⇒ كانت الواجهة تقول «رمز الرحلة
  // غير صحيح»، فأُرسل التشخيص إلى الرمز وقاعدة البيانات بينما كان كلاهما سليماً.
  it('unauthenticated يذكر مانع الإعلانات ولا يُلقي اللوم على الرمز', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/unauthenticated', 'يجب تسجيل الدخول أولاً.')
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.verifyTripPin('2026') })

    expect(result.current.pinError).toContain('مانع إعلانات')
    expect(result.current.pinError).not.toContain('رمز الرحلة غير صحيح')
    expect(result.current.rateLimitSeconds).toBeNull()
  })

  it('permission-denied يبقى «رمز غير صحيح» — كتمان وجود الرحلة مقصود', async () => {
    mocks.authObj.currentUser = mkUser({})
    mocks.callVerifyFn.mockRejectedValue(
      functionsError('functions/permission-denied', 'رمز الرحلة غير صحيح.')
    )

    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.verifyTripPin('0000') })

    expect(result.current.pinError).toContain('رمز الرحلة غير صحيح')
  })
})
