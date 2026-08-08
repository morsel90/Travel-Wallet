import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FormEvent } from 'react'
import { renderHook, act } from '@testing-library/react'
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
const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>

type Params = Parameters<typeof useDepositActions>[0]

function setup(overrides: Partial<Params> = {}) {
  const setTravelers = vi.fn()
  const showToast = vi.fn()
  const handleFirestoreError = vi.fn()
  const closeModal = vi.fn()
  const params: Params = {
    depositTraveler: traveler,
    user: null,
    setTravelers,
    showToast,
    handleFirestoreError,
    closeModal,
    ...overrides,
  }
  const view = renderHook((p: Params) => useDepositActions(p), { initialProps: params })
  return { ...view, setTravelers, showToast, handleFirestoreError, closeModal }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.batchCommit.mockResolvedValue(undefined)
  mocks.doc.mockImplementation((col: unknown) => ({ __doc: col }))
})

describe('useDepositActions', () => {
  it('لا يفعل شيئاً بلا مسافر مستهدف', () => {
    const { result, setTravelers } = setup({ depositTraveler: null })
    act(() => result.current.setDepositAmount('100'))
    act(() => result.current.handleAddDeposit(fakeEvent()))
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يتجاهل مبلغاً غير رقمي', () => {
    const { result, setTravelers } = setup()
    act(() => result.current.setDepositAmount('ليس رقماً'))
    act(() => result.current.handleAddDeposit(fakeEvent()))
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يرفض مبلغاً صفرياً أو سالباً في وضعي الإضافة/الطرح', () => {
    const { result, setTravelers } = setup()
    act(() => { result.current.setDepositMode('add'); result.current.setDepositAmount('0') })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يسمح بالقيمة 0 في وضع "تعيين" (set) فقط', () => {
    const { result, setTravelers } = setup()
    act(() => { result.current.setDepositMode('set'); result.current.setDepositAmount('0') })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    expect(setTravelers).toHaveBeenCalledTimes(1)
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(0)
  })

  it('محلياً: وضع الإضافة يزيد الرصيد الحالي', () => {
    const { result, setTravelers } = setup()
    act(() => { result.current.setDepositMode('add'); result.current.setDepositAmount('250') })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(1250)
  })

  it('محلياً: وضع الطرح لا ينزل تحت الصفر', () => {
    const { result, setTravelers } = setup()
    act(() => { result.current.setDepositMode('subtract'); result.current.setDepositAmount('5000') })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    const next = setTravelers.mock.calls[0][0]([traveler])
    expect(next[0].deposited).toBe(0)
  })

  it('يغلق المودال ويصفّر النموذج بعد الإرسال', () => {
    const { result, closeModal } = setup()
    act(() => { result.current.setDepositAmount('100'); result.current.setDepositReason('سبب') })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    expect(closeModal).toHaveBeenCalled()
    expect(result.current.depositAmount).toBe('')
    expect(result.current.depositReason).toBe('')
    expect(result.current.depositMode).toBe('add')
  })

  it('عبر Firestore: يحدّث رصيد المسافر ويكتب سجل تدقيق بالفرق الصحيح', () => {
    const { result } = setup({ user: fakeUser })
    act(() => {
      result.current.setDepositMode('add')
      result.current.setDepositAmount('250')
      result.current.setDepositReason('  مصاريف إضافية  ')
    })
    act(() => result.current.handleAddDeposit(fakeEvent()))

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
    act(() => {
      result.current.setDepositAmount('100')
      result.current.setDepositReason('   ')
    })
    act(() => result.current.handleAddDeposit(fakeEvent()))
    const [, logPayload] = mocks.batchSet.mock.calls[0]
    expect(logPayload.reason).toBeNull()
  })

  it('فشل الكتابة يستدعي handleFirestoreError', async () => {
    mocks.batchCommit.mockRejectedValueOnce(new Error('boom'))
    const { result, handleFirestoreError } = setup({ user: fakeUser })
    act(() => result.current.setDepositAmount('100'))
    act(() => result.current.handleAddDeposit(fakeEvent()))
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'تعذر تحديث الرصيد.')
  })
})
