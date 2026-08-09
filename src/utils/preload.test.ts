import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { onIdle, preloadAll } from './preload'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('onIdle', () => {
  it('يستخدم requestIdleCallback حين يكون متاحاً', () => {
    const ric = vi.fn().mockReturnValue(7)
    vi.stubGlobal('requestIdleCallback', ric)

    const task = vi.fn()
    onIdle(task)

    expect(ric).toHaveBeenCalledTimes(1)
    // timeout إلزامي: بدونه قد لا يأتي وقت خمول أبداً على جهاز مشغول
    expect(ric.mock.calls[0][1]).toEqual({ timeout: 5000 })
  })

  it('الدالة المُرجَعة تلغي مهمة الخمول', () => {
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', vi.fn().mockReturnValue(7))
    vi.stubGlobal('cancelIdleCallback', cancel)

    onIdle(vi.fn())()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('يرجع لمؤقّت عادي حين لا يدعم المتصفح requestIdleCallback (Safari الأقدم)', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)

    const task = vi.fn()
    onIdle(task, 2000)

    expect(task).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('الإلغاء يمنع تنفيذ المهمة في المسار الاحتياطي أيضاً', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)

    const task = vi.fn()
    onIdle(task, 2000)()

    vi.advanceTimersByTime(5000)
    expect(task).not.toHaveBeenCalled()
  })
})

describe('preloadAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('يستدعي كل دوال الاستيراد المُمرَّرة', () => {
    const a = vi.fn().mockResolvedValue({})
    const b = vi.fn().mockResolvedValue({})

    preloadAll([a, b])

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('لا ينتظر اكتمال السحب (لا يُرجع وعداً ولا يحجب المستدعي)', () => {
    let resolved = false
    const slow = vi.fn(() => new Promise(res => setTimeout(() => { resolved = true; res({}) }, 10_000)))

    expect(preloadAll([slow])).toBeUndefined()
    expect(resolved).toBe(false) // مضى الاستدعاء دون انتظار
  })

  it('فشل السحب لا يرمي — التحميل المسبق تحسين انتهازي لا وظيفة حرجة', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'))
    const ok = vi.fn().mockResolvedValue({})

    expect(() => preloadAll([failing, ok])).not.toThrow()
    // الفشل لا يمنع بقية الأجزاء من السحب
    expect(ok).toHaveBeenCalledTimes(1)

    // ولا يترك وعداً مرفوضاً بلا معالج (unhandledrejection)
    await Promise.resolve()
  })

  it('دالة استيراد ترمي تزامنياً لا تُسقط بقية القائمة', () => {
    const throwsSync = vi.fn(() => { throw new Error('boom') })
    const ok = vi.fn().mockResolvedValue({})

    expect(() => preloadAll([throwsSync, ok])).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('قائمة فارغة لا تفعل شيئاً', () => {
    expect(() => preloadAll([])).not.toThrow()
  })
})
