import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePasswordReset } from './usePasswordReset'

const mocks = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }))

vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: mocks.sendPasswordResetEmail }))
vi.mock('../firebase', () => ({ auth: { __auth: true } }))

function setup() {
  const showToast = vi.fn()
  const view = renderHook(() => usePasswordReset({ showToast }))
  return { ...view, showToast }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sendPasswordResetEmail.mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })

describe('usePasswordReset', () => {
  it('يرسل للبريد بعد trim ويعلن النتيجة بتوست', async () => {
    const { result, showToast } = setup()
    await act(async () => { await result.current.requestReset('  a@b.com  ') })
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({ __auth: true }, 'a@b.com')
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('إذا كان البريد') }),
      6000,
    )
  })

  it('بريد فارغ: لا استدعاء ولا مهلة — يعيد missing-email ليقوله المستدعي بلغته', async () => {
    const { result, showToast } = setup()
    let outcome: string | undefined
    await act(async () => { outcome = await result.current.requestReset('   ') })
    expect(outcome).toBe('missing-email')
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.resetCooldownSeconds).toBe(0)
  })

  // ⚠️ **القاعدة الأمنية ١ — لا تُخفَّف.** لو اختلف الردّ بين بريد مسجَّل وآخر
  // غير مسجَّل، صار النموذج أداة تعداد حسابات مجانية. الرفض يُبتلع، والرسالة
  // والمهلة والنتيجة المعادة كلها مطابقة تماماً لحالة النجاح.
  it('فشل الإرسال لا يُميَّز عن نجاحه — لا في النتيجة ولا في الرسالة ولا في المهلة', async () => {
    mocks.sendPasswordResetEmail.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'auth/user-not-found' }),
    )
    const { result: failing, showToast: failToast } = setup()
    let failOutcome: string | undefined
    await act(async () => { failOutcome = await failing.current.requestReset('ghost@b.com') })

    const { result: ok, showToast: okToast } = setup()
    let okOutcome: string | undefined
    await act(async () => { okOutcome = await ok.current.requestReset('real@b.com') })

    expect(failOutcome).toBe(okOutcome)
    expect(failToast.mock.calls[0]).toEqual(okToast.mock.calls[0])
    expect(failing.current.resetCooldownSeconds).toBe(ok.current.resetCooldownSeconds)
  })

  // ⚠️ القاعدة الأمنية ٢: المهلة تمنع إعادة الإرسال المتكرر.
  it('محاولة ثانية داخل المهلة تُرفض بلا أي استدعاء ثانٍ', async () => {
    const { result } = setup()
    await act(async () => { await result.current.requestReset('a@b.com') })
    expect(result.current.resetCooldownSeconds).toBeGreaterThan(0)

    let second: string | undefined
    await act(async () => { second = await result.current.requestReset('a@b.com') })
    expect(second).toBe('busy')
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1)
  })
})
