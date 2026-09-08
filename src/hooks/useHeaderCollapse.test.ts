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

  // ─── حارس القاع ─────────────────────────────────────────────────────────────
  // 🆕 حلقة تغذية راجعة حقيقية رُصدت أثناء معاينة إعادة تصميم الشاشة الرئيسية:
  // الهيدر `sticky` أي داخل تدفّق الصفحة، فتقلّصه يُنقص ارتفاع المستند نحو ٣٠
  // بكسل. وحين يكون المستخدم ملتصقاً بالقاع تماماً يقلّل المتصفح scrollY بنفس
  // المقدار، فيصل ذلك كتمرير «لأعلى» يتجاوز العتبة → يتمدّد الهيدر → يزيد
  // الارتفاع → … بلا نهاية. قِيس على 390×844: تبدّل بين 68px و98px خمساً
  // وثلاثين مرة في ثانيتين، حتى إن Playwright رفض النقر على زرّ «المزيد» في
  // الهيدر بحجّة «element is not stable».
  //
  // ⚠️ الاختبارات أعلاه لا تلتقط هذا: jsdom يترك scrollHeight صفراً فلا يُفعَّل
  // الحارس فيها أصلاً (maxScrollY سالب) — ولهذا بقيت خضراء قبل الإصلاح وبعده.
  // الاختباران التاليان يضبطان الهندسة صراحةً ليقعا في نطاق الحارس فعلاً.
  const setGeometry = (scrollHeight: number, innerHeight = 800) => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: scrollHeight, writable: true, configurable: true,
    })
    Object.defineProperty(window, 'innerHeight', {
      value: innerHeight, writable: true, configurable: true,
    })
  }

  it('لا يتبدّل عند الالتصاق بالقاع ولو انكمش المستند فتراجع scrollY', () => {
    setGeometry(3000)
    const { result } = renderHook(() => useHeaderCollapse())

    scrollTo(1000)            // تمرير لأسفل عادي → تقلّص
    expect(result.current).toBe(true)

    scrollTo(2200)            // أقصى تمرير: 3000 − 800 = 2200 (ملتصق بالقاع)
    expect(result.current).toBe(true)

    // ⚠️ **جوهر الاختبار**: انكماش المستند بمقدار تقلّص الهيدر يجرّ scrollY إلى
    // 2170 — «تمرير لأعلى» بـ30 بكسل يتجاوز العتبة. بلا الحارس تنقلب الحالة هنا،
    // ومن هذه النقطة بالضبط تبدأ الحلقة.
    setGeometry(2970)
    scrollTo(2170)
    expect(result.current).toBe(true)
  })

  it('الحارس لا يُجمّد الهيدر: تمرير حقيقي لأعلى بعيداً عن القاع يفتحه', () => {
    setGeometry(3000)
    const { result } = renderHook(() => useHeaderCollapse())

    scrollTo(1000)            // تقلّص عادي أولاً
    expect(result.current).toBe(true)

    scrollTo(2200)            // ملتصق بالقاع — الحالة كما هي
    expect(result.current).toBe(true)

    scrollTo(1800)            // ابتعد عن القاع فعلاً → السلوك المعتاد يعود
    expect(result.current).toBe(false)
  })
})
