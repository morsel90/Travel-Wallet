import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useDepositActions } from './useDepositActions'
import type { Traveler } from '../types'

const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  batchUpdate: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
  haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn(), flash: vi.fn() },
}))

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  writeBatch: vi.fn(() => ({ update: mocks.batchUpdate, set: mocks.batchSet, commit: mocks.batchCommit })),
}))

vi.mock('../firebase', () => ({ db: {} }))

vi.mock('../firestore', () => ({
  travelerDoc: vi.fn((id: number) => ({ __travelerDoc: id })),
  depositLogsCol: vi.fn((id: number) => ({ __depositLogsCol: id })),
}))

vi.mock('../utils/haptics', () => ({ haptic: mocks.haptic }))

const traveler: Traveler = { id: 7, name: 'محمد العاثم', shortName: 'محمد', deposited: 1000, deletedAt: null }
const fakeUser = { uid: 'user-1', email: 'admin@example.com' } as User

type Params = Parameters<typeof useDepositActions>[0]

function setup(overrides: Partial<Params> = {}) {
  const setTravelers = vi.fn()
  const showToast = vi.fn()
  const handleFirestoreError = vi.fn()
  const params: Params = { user: null, setTravelers, showToast, handleFirestoreError, ...overrides }
  const view = renderHook((p: Params) => useDepositActions(p), { initialProps: params })
  return { ...view, setTravelers, showToast, handleFirestoreError }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.batchCommit.mockResolvedValue(undefined)
  mocks.doc.mockImplementation((col: unknown) => ({ __doc: col }))
})

describe('useDepositActions', () => {
  // ── حراسة المال عند الحدّ (القاعدة ١٩) — النتيجة المعادة هي ما يُبقي الحقل
  //    مفتوحاً بما كتبه المستخدم بدل أن يبتلع إدخاله بصمت. ─────────────────────
  it('يرفض مبلغاً غير رقمي ويعيد false', () => {
    const { result, setTravelers } = setup()
    expect(result.current.submitDeposit(traveler, { mode: 'add', amount: NaN, reason: '' })).toBe(false)
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يرفض مبلغاً غير منتهٍ (Infinity) ويعيد false', () => {
    const { result, setTravelers } = setup()
    expect(result.current.submitDeposit(traveler, { mode: 'add', amount: Infinity, reason: '' })).toBe(false)
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يرفض مبلغاً صفرياً في وضعي الإضافة/الطرح', () => {
    const { result, setTravelers } = setup()
    expect(result.current.submitDeposit(traveler, { mode: 'add', amount: 0, reason: '' })).toBe(false)
    expect(result.current.submitDeposit(traveler, { mode: 'subtract', amount: 0, reason: '' })).toBe(false)
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يرفض مبلغاً سالباً في وضع "تحديد القيمة"', () => {
    const { result, setTravelers } = setup()
    expect(result.current.submitDeposit(traveler, { mode: 'set', amount: -1, reason: '' })).toBe(false)
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يسمح بالقيمة 0 في وضع "تحديد القيمة" وحده', () => {
    const { result, setTravelers } = setup()
    expect(result.current.submitDeposit(traveler, { mode: 'set', amount: 0, reason: '' })).toBe(true)
    expect(setTravelers).toHaveBeenCalledTimes(1)
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(0)
  })

  it('محلياً: وضع الإضافة يزيد الرصيد الحالي', () => {
    const { result, setTravelers } = setup()
    result.current.submitDeposit(traveler, { mode: 'add', amount: 250, reason: '' })
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(1250)
  })

  it('محلياً: وضع الطرح لا ينزل تحت الصفر', () => {
    const { result, setTravelers } = setup()
    result.current.submitDeposit(traveler, { mode: 'subtract', amount: 5000, reason: '' })
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(0)
  })

  it('عبر Firestore: يحدّث رصيد المسافر ويكتب سجل تدقيق بالفرق الصحيح', () => {
    const { result } = setup({ user: fakeUser })
    result.current.submitDeposit(traveler, { mode: 'add', amount: 250, reason: '  مصاريف إضافية  ' })

    expect(mocks.batchUpdate).toHaveBeenCalledWith({ __travelerDoc: 7 }, { deposited: 1250 })
    expect(mocks.batchSet).toHaveBeenCalledTimes(1)
    const [logDocArg, logPayload] = mocks.batchSet.mock.calls[0]
    expect(logDocArg).toEqual({ __doc: { __depositLogsCol: 7 } })
    expect(logPayload).toMatchObject({
      travelerId: 7, previousDeposited: 1000, newDeposited: 1250, delta: 250,
      mode: 'add', reason: 'مصاريف إضافية', changedByEmail: 'admin@example.com', changedByUid: 'user-1',
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('سبب فارغ (بعد trim) يُسجَّل كـ null لا كنص فارغ', () => {
    const { result } = setup({ user: fakeUser })
    result.current.submitDeposit(traveler, { mode: 'add', amount: 100, reason: '   ' })
    const [, logPayload] = mocks.batchSet.mock.calls[0]
    expect(logPayload.reason).toBeNull()
  })

  it('فشل الكتابة يستدعي handleFirestoreError', async () => {
    mocks.batchCommit.mockRejectedValueOnce(new Error('boom'))
    const { result, handleFirestoreError } = setup({ user: fakeUser })
    result.current.submitDeposit(traveler, { mode: 'add', amount: 100, reason: '' })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'تعذر تحديث الرصيد.')
  })

  // ⚠️ حارس القاعدة ١٦: هذه الدالة تعيش في شريحة `actions` من المتجر، وثبات
  // مرجعها هو ما يمنع إعادة رسم كل بطاقة مسافر مع كل تغيّر في بيانات الرحلة.
  // إعادة الرسم **بنفس الاعتماديات حرفياً** يجب أن تُعيد نفس المرجع.
  it('مرجع submitDeposit ثابت عبر إعادة الرسم بنفس الاعتماديات', () => {
    const params: Params = {
      user: fakeUser, setTravelers: vi.fn(), showToast: vi.fn(), handleFirestoreError: vi.fn(),
    }
    const { result, rerender } = renderHook((p: Params) => useDepositActions(p), { initialProps: params })
    const first = result.current.submitDeposit
    rerender(params)
    expect(result.current.submitDeposit).toBe(first)
  })
})
