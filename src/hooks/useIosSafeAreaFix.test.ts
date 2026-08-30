import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIosSafeAreaFix } from './useIosSafeAreaFix'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => { cb(0); return 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useIosSafeAreaFix', () => {
  it('يُحاكي تمريراً اصطناعياً (١ ثم رجوع لـ٠) عند التركيب', () => {
    renderHook(() => useIosSafeAreaFix())
    expect(window.scrollTo).toHaveBeenNthCalledWith(1, 0, 1)
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, 0, 0)
  })

  // 🐛 هذا بالضبط ما كان ناقصاً في محاولة الإصلاح الأولى: تشغيله مرة واحدة
  // فقط عند إقلاع التطبيق (بدل عند كل تركيب) كان يترك أي هيدر يُدرَج لاحقاً
  // (كالعودة من رحلة مفتوحة إلى «رحلاتي» عبر تبديل حالة React بلا إعادة
  // تحميل كاملة) بلا إصلاح — راجع useIosSafeAreaFix.ts.
  it('يُعاد تشغيله عند كل تركيب جديد، لا مرة واحدة فقط لكل الجلسة', () => {
    const { unmount } = renderHook(() => useIosSafeAreaFix())
    expect(window.scrollTo).toHaveBeenCalledTimes(2)
    unmount()

    renderHook(() => useIosSafeAreaFix())
    expect(window.scrollTo).toHaveBeenCalledTimes(4)
  })
})
