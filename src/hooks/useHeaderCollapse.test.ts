import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHeaderCollapse } from './useHeaderCollapse'

// requestAnimationFrame الحقيقي في jsdom يُجدوَل عبر مؤقّت غير متزامن، مما يعقّد
// الاختبار بلا فائدة — نستبدله بتنفيذ فوري متزامن لنتحكم في التوقيت بدقة عبر
// window.scrollY وحده، وهو ما يختبره هذا الـ hook فعلياً (throttling ليس سلوكاً
// وظيفياً بل تحسين أداء).
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
})

const scrollTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true })
  act(() => window.dispatchEvent(new Event('scroll')))
}

describe('useHeaderCollapse', () => {
  it('يبدأ غير مطوي (isCollapsed = false)', () => {
    const { result } = renderHook(() => useHeaderCollapse())
    expect(result.current).toBe(false)
  })

  it('يطوي الهيدر عند التمرير لأسفل بما يتجاوز عتبة الاتجاه', () => {
    const { result } = renderHook(() => useHeaderCollapse())
    scrollTo(50) // تمرير لأسفل بما يكفي
    expect(result.current).toBe(true)
  })

  it('لا يطوي الهيدر عند تمرير طفيف أقل من العتبة (jitter)', () => {
    const { result } = renderHook(() => useHeaderCollapse())
    scrollTo(3) // أقل من DIRECTION_THRESHOLD_PX (5)
    expect(result.current).toBe(false)
  })

  it('يعيد فتح الهيدر عند التمرير لأعلى بما يكفي بعد طيّه', () => {
    const { result } = renderHook(() => useHeaderCollapse())
    scrollTo(200)
    expect(result.current).toBe(true)

    scrollTo(150) // تمرير لأعلى بـ 50px — يتجاوز العتبة
    expect(result.current).toBe(false)
  })

  it('يعيد فتح الهيدر دائماً عند الاقتراب من قمة الصفحة', () => {
    const { result } = renderHook(() => useHeaderCollapse())
    scrollTo(200)
    expect(result.current).toBe(true)

    scrollTo(5) // ضمن NEAR_TOP_PX (10)
    expect(result.current).toBe(false)
  })

  it('يزيل مستمع التمرير عند إلغاء التحميل', () => {
    const { unmount } = renderHook(() => useHeaderCollapse())
    unmount()
    expect(() => scrollTo(500)).not.toThrow()
  })
})
