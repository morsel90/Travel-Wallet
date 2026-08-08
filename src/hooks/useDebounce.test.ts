import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce', () => {
  it('يُرجع القيمة الأولية فوراً دون تأخير', () => {
    const { result } = renderHook(() => useDebounce('أول', 300))
    expect(result.current).toBe('أول')
  })

  it('لا يحدّث القيمة قبل انتهاء المهلة', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أول' },
    })

    rerender({ value: 'ثاني' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('أول')
  })

  it('يحدّث القيمة بعد انتهاء المهلة كاملة', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أول' },
    })

    rerender({ value: 'ثاني' })
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('ثاني')
  })

  it('يلغي المؤقّت السابق ويعيد العد عند تغيّر متكرر خلال فترة الانتظار', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أول' },
    })

    rerender({ value: 'ثاني' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'ثالث' }) // تغيير جديد قبل انتهاء مهلة "ثاني" — يُلغيها
    act(() => vi.advanceTimersByTime(200))
    // مضى 400ms منذ "ثاني" لكن مهلة "ثالث" (300ms) لم تكتمل إلا بعد 200ms من تغييرها
    expect(result.current).toBe('أول')

    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('ثالث')
  })

  it('يلغي المؤقّت عند إلغاء تحميل المكوّن (لا خطأ setState بعد unmount)', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أول' },
    })
    rerender({ value: 'ثاني' })
    unmount()
    expect(() => vi.advanceTimersByTime(300)).not.toThrow()
  })
})
