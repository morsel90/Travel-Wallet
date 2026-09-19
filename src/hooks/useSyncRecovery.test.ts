import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSyncRecovery } from './useSyncRecovery'

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, writable: true, configurable: true })
}

/** يقفز بالساعة لتجاوز مهلة التهدئة (10 ثوانٍ) دون انتظار حقيقي. */
const passCooldown = () => vi.advanceTimersByTime(11_000)

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('useSyncRecovery', () => {
  it('يجلب من الخادم عند عودة التطبيق للواجهة', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // 🆕 كان يجلب عند عودة الشبكة أيضاً — حُذف عمداً: الـ SDK يستمع لـ online
  // بنفسه ويعيد تشغيل اتصاله (restartNetwork)، فالقراءة كانت تكراراً بلا
  // مقابل يحمل خطر محو الكتابات المعلّقة. انظر تعليق useSyncRecovery.ts.
  it('لا يجلب عند عودة الشبكة — ذاك من عمل الـ SDK نفسه', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    act(() => window.dispatchEvent(new Event('online')))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('لا يجلب شيئاً مباشرة بعد التركيب — المستمعون قرأوا للتوّ', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    // بلا تمرير الساعة: نحن داخل مهلة التهدئة المحسوبة من لحظة التركيب
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('يتجاهل تبديل التبويبات المتلاحق داخل مهلة التهدئة', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    // ⚠️ الانتظار هنا ليس تجميلاً: قفل "جلب جارٍ" يُحرَّر في finally أي على
    // microtask، فبدون تفريغها يبقى القفل هو المانع وتصبح مهلة التهدئة —
    // موضوع هذا الاختبار — غير مفحوصة أصلاً.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    // ثلاث عودات سريعة متتالية — لا تُطلق أي قراءة إضافية
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(1)

    // وبعد انقضاء المهلة تُطلق مجدداً
    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('لا يجلب عند الإخفاء — visibilitychange يُطلق في الاتجاهين', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).not.toHaveBeenCalled()

    // وحين يعود المستخدم فعلاً، يلحق التعافي هناك
    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('لا يُطلق جلباً ثانياً بينما الأول لم ينتهِ بعد', async () => {
    let settle: () => void = () => {}
    const refresh = vi.fn().mockReturnValue(new Promise<void>(res => { settle = () => res() }))
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(1)

    // الجلب الأول ما زال معلّقاً — ومهلة التهدئة انقضت، فالقفل وحده هو المانع
    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => { settle(); await Promise.resolve() })
    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('فشل الجلب لا يرمي ولا يُعطّل المحاولات التالية', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(true, refresh))

    passCooldown()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('لا يفعل شيئاً وهو معطّل (بلا صلاحية وصول)', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useSyncRecovery(false, refresh))

    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('يزيل مستمعي الأحداث عند إلغاء التحميل', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() => useSyncRecovery(true, refresh))
    unmount()

    passCooldown()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).not.toHaveBeenCalled()
  })
})
