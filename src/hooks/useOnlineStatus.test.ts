import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

const setNavigatorOnLine = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { value, writable: true, configurable: true })
}

afterEach(() => {
  setNavigatorOnLine(true) // إعادة الحالة الافتراضية لبقية الاختبارات
})

describe('useOnlineStatus', () => {
  it('يبدأ بحالة navigator.onLine الحالية', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('يتحوّل إلى false عند حدث offline', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())

    act(() => window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe(false)
  })

  it('يتحوّل إلى true عند حدث online', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    act(() => window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(true)
  })

  it('يزيل مستمعي الأحداث عند إلغاء التحميل (لا خطأ setState بعد unmount)', () => {
    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()
    expect(() => window.dispatchEvent(new Event('offline'))).not.toThrow()
  })
})
