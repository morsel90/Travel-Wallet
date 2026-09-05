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
  document.body.style.minHeight = ''
})

describe('useIosSafeAreaFix', () => {
  it('يُحاكي تمريراً اصطناعياً (١ ثم رجوع لـ٠) عند التركيب', () => {
    renderHook(() => useIosSafeAreaFix())
    expect(window.scrollTo).toHaveBeenNthCalledWith(1, 0, 1)
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, 0, 0)
  })

  // 🐛 هذا بالضبط ما كشفه اختبار المستخدم الفعلي: شاشة «رحلاتي» القصيرة (لا
  // تفيض عن الشاشة) كانت تجعل window.scrollTo بلا أي أثر، فتبقى العلة قائمة
  // رغم إعادة التشغيل عند كل تركيب. فرض حشوة اصطناعية على body (انظر
  // useIosSafeAreaFix.ts) يضمن وجود ما يُمرَّر إليه دائماً — هذا الاختبار
  // يتحقق من الأثر الجانبي القابل للملاحظة بأمان: استعادة القيمة الأصلية بعد
  // اكتمال المحاكاة، لا القيمة العابرة أثناءها (تُستعاد تزامنياً هنا بفعل
  // مموّه requestAnimationFrame أعلاه قبل أي فرصة لملاحظتها).
  it('يستعيد قيمة minHeight الأصلية لـbody بعد اكتمال المحاكاة', () => {
    document.body.style.minHeight = '50px'
    renderHook(() => useIosSafeAreaFix())
    expect(document.body.style.minHeight).toBe('50px')
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
