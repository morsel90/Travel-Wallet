import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from './useCountdown'

const NOW = new Date('2026-08-08T12:00:00').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('يُرجع 0 عندما targetTimestamp هو null', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current).toBe(0)
  })

  it('يحسب الثواني المتبقية فوراً عند أول عرض', () => {
    const { result } = renderHook(() => useCountdown(NOW + 60_000))
    expect(result.current).toBe(60)
  })

  it('يتناقص مع مرور الوقت عبر المؤقّت الداخلي', () => {
    const { result } = renderHook(() => useCountdown(NOW + 5_000))
    expect(result.current).toBe(5)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(4)

    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(2)
  })

  it('يتوقف عند 0 ولا ينزل لسالب', () => {
    const { result } = renderHook(() => useCountdown(NOW + 2_000))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('يعيد الحساب فوراً عند تغيّر target دون انتظار أول tick', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountdown(target),
      { initialProps: { target: NOW + 10_000 } }
    )
    expect(result.current).toBe(10)

    rerender({ target: NOW + 30_000 })
    // لم يمرّ أي وقت فعلي — يجب أن ينعكس الهدف الجديد فوراً لا بعد ثانية
    expect(result.current).toBe(30)
  })

  it('يعود إلى 0 فوراً عند تحويل target إلى null', () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useCountdown(target),
      { initialProps: { target: NOW + 10_000 } as { target: number | null } }
    )
    expect(result.current).toBe(10)

    rerender({ target: null })
    expect(result.current).toBe(0)
  })
})
