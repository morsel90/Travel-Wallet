import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FormEvent } from 'react'
import { renderHook, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useExpenseActions } from './useExpenseActions'
import type { Traveler, Expense } from '../types'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
  haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn(), flash: vi.fn() },
}))

vi.mock('firebase/firestore', () => ({
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  doc: mocks.doc,
  writeBatch: vi.fn(() => ({ set: mocks.batchSet, commit: mocks.batchCommit })),
}))

vi.mock('../firebase', () => ({ db: {} }))

// expenseDoc/rateLimitDoc تُرجع علامات (markers) قابلة للمقارنة بدل استدعاء
// doc() الحقيقي — يكفي للتحقق من *أي* مستند كُتب إليه دون محاكاة Firestore كاملاً.
vi.mock('../firestore', () => ({
  expensesCol: vi.fn(() => 'expenses-collection'),
  expenseDoc: vi.fn((id: string) => ({ __expenseDoc: id })),
  rateLimitDoc: vi.fn((uid: string) => ({ __rateLimitDoc: uid })),
}))

vi.mock('../utils/haptics', () => ({ haptic: mocks.haptic }))

const traveler1: Traveler = { id: 1, name: 'محمد العاثم', shortName: 'محمد', deposited: 1000, deletedAt: null }
const traveler2: Traveler = { id: 2, name: 'عيسى آل شبير', shortName: 'عيسى', deposited: 500, deletedAt: null }
const activeTravelers = [traveler1, traveler2]
const fakeUser = { uid: 'user-1' } as User

const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>
const flushMicrotasks = () => new Promise<void>(resolve => setTimeout(resolve, 0))

type Params = Parameters<typeof useExpenseActions>[0]

function setup(overrides: Partial<Params> = {}) {
  const setExpenses = vi.fn()
  const showToast = vi.fn()
  const handleFirestoreError = vi.fn()
  const setSyncError = vi.fn()
  const params: Params = {
    activeTravelers,
    user: null,
    isAdmin: false,
    setExpenses,
    showToast,
    handleFirestoreError,
    setSyncError,
    isFirstExpense: false,
    ...overrides,
  }
  const view = renderHook((p: Params) => useExpenseActions(p), { initialProps: params })
  return { ...view, setExpenses, showToast, handleFirestoreError, setSyncError }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.batchCommit.mockResolvedValue(undefined)
  mocks.setDoc.mockResolvedValue(undefined)
  mocks.updateDoc.mockResolvedValue(undefined)
})

describe('useExpenseActions — النموذج والمشاركون', () => {
  it('النموذج الفارغ يبدأ بكل المسافرين النشطين محددين كمشاركين', () => {
    const { result } = setup()
    expect(result.current.newExpense.participants).toEqual([1, 2])
    expect(result.current.newExpense.splitMode).toBe('equal')
  })

  it('toggleParticipant يزيل مشاركاً محدداً ثم يعيد إضافته', () => {
    const { result } = setup()
    act(() => result.current.toggleParticipant(1))
    expect(result.current.newExpense.participants).toEqual([2])
    act(() => result.current.toggleParticipant(1))
    expect(result.current.newExpense.participants).toEqual([2, 1])
  })

  it('toggleAllParticipants يلغي التحديد الكامل ثم يعيده', () => {
    const { result } = setup()
    act(() => result.current.toggleAllParticipants())
    expect(result.current.newExpense.participants).toEqual([])
    act(() => result.current.toggleAllParticipants())
    expect(result.current.newExpense.participants).toEqual([1, 2])
  })

  it('startEditExpense يملأ النموذج من مصروف موجود بتقسيم مخصص', () => {
    const { result } = setup()
    const expense: Expense = {
      id: 'e1', date: '2026-08-01', description: 'إيجار', amount: 300, originalAmount: 300,
      currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1,
      shares: { '1': 2, '2': 1 }, category: 'مواصلات',
    }
    act(() => result.current.startEditExpense(expense))
    expect(result.current.editingExpense).toEqual(expense)
    expect(result.current.isAddingExpense).toBe(true)
    expect(result.current.newExpense).toMatchObject({
      description: 'إيجار', amount: '300', splitMode: 'custom', shares: { 1: 2, 2: 1 }, participants: [1, 2],
    })
  })

  it('cancelExpenseForm يعيد النموذج لحالته الفارغة ويلغي وضع التعديل', () => {
    const { result } = setup()
    act(() => result.current.startEditExpense({
      id: 'e1', date: '2026-08-01', description: 'إيجار', amount: 300, originalAmount: 300,
      currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 1,
    }))
    act(() => result.current.cancelExpenseForm())
    expect(result.current.editingExpense).toBeNull()
    expect(result.current.isAddingExpense).toBe(false)
    expect(result.current.newExpense.description).toBe('')
  })
})

describe('useExpenseActions — الإضافة المحلية (بلا مستخدم)', () => {
  it('لا يرسل النموذج إذا كانت الحقول الإلزامية ناقصة', () => {
    const { result, setExpenses } = setup()
    act(() => result.current.handleAddExpense(fakeEvent()))
    expect(setExpenses).not.toHaveBeenCalled()
  })

  it('يضيف مصروفاً محلياً بتحويل العملة الصحيح ويعرض تنبيه النجاح', () => {
    const { result, setExpenses, showToast } = setup()
    act(() => result.current.setNewExpense({
      ...result.current.newExpense, description: 'عشاء', amount: '100', exchangeRate: '3.75',
    }))
    act(() => result.current.handleAddExpense(fakeEvent()))

    expect(setExpenses).toHaveBeenCalledTimes(1)
    const next = setExpenses.mock.calls[0][0]([])
    expect(next[0]).toMatchObject({ description: 'عشاء', amount: 375, originalAmount: 100, participants: [1, 2] })
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ text: 'تم تسجيل المصروف', type: 'new' }))
    expect(result.current.isAddingExpense).toBe(false)
  })

  it('handleQuickAddExpense يرفض وصفاً فارغاً دون لمس Firestore', () => {
    const { result, setExpenses } = setup()
    expect(result.current.handleQuickAddExpense('   ', 50)).toBe('أدخل وصفاً للمصروف.')
    expect(setExpenses).not.toHaveBeenCalled()
  })

  it('handleQuickAddExpense يرفض مبلغاً غير موجب أو غير محدود', () => {
    const { result } = setup()
    expect(result.current.handleQuickAddExpense('قهوة', 0)).toBe('أدخل مبلغاً صحيحاً أكبر من صفر.')
    expect(result.current.handleQuickAddExpense('قهوة', -5)).toBe('أدخل مبلغاً صحيحاً أكبر من صفر.')
    expect(result.current.handleQuickAddExpense('قهوة', NaN)).toBe('أدخل مبلغاً صحيحاً أكبر من صفر.')
  })

  it('handleQuickAddExpense يرفض عند عدم وجود مسافرين نشطين', () => {
    const { result } = setup({ activeTravelers: [] })
    expect(result.current.handleQuickAddExpense('قهوة', 20)).toBe('أضف مسافراً واحداً على الأقل قبل تسجيل مصروف.')
  })

  it('handleQuickAddExpense المحلي يضيف مصروفاً بفئة "أخرى" ومشاركة الجميع', () => {
    const { result, setExpenses } = setup()
    const error = result.current.handleQuickAddExpense('قهوة', 20)
    expect(error).toBeNull()
    const next = setExpenses.mock.calls[0][0]([])
    expect(next[0]).toMatchObject({ description: 'قهوة', amount: 20, category: 'أخرى', participants: [1, 2] })
  })

  it('confirmDelete المحلي يحذف من القائمة ويعرض تنبيهاً بزر تراجع', () => {
    const { result, setExpenses, showToast } = setup()
    act(() => result.current.requestDeleteExpense('e1'))
    expect(result.current.expenseToDelete).toBe('e1')

    act(() => result.current.confirmDelete('e1'))
    expect(result.current.expenseToDelete).toBeNull()
    const next = setExpenses.mock.calls[0][0]([{ id: 'e1' }, { id: 'e2' }])
    expect(next).toEqual([{ id: 'e2' }])
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'تم نقل المصروف إلى سلة المهملات', onUndo: expect.any(Function) }),
      5000
    )
  })
})

describe('useExpenseActions — الكتابة عبر Firestore (مستخدم مسجّل)', () => {
  it('يكتب دفعة تتضمن المصروف ومستند حدّ المعدّل لغير المسؤول', async () => {
    const { result, setExpenses } = setup({ user: fakeUser, isAdmin: false })
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'عشاء', amount: '100' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })

    expect(mocks.batchSet).toHaveBeenCalledTimes(2) // المصروف + rateLimitDoc
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
    expect(setExpenses).not.toHaveBeenCalled() // لا تحديث محلي مباشر عند وجود مستخدم
  })

  it('المسؤول لا يُكتب له مستند حدّ المعدّل', async () => {
    const { result } = setup({ user: fakeUser, isAdmin: true })
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'عشاء', amount: '100' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })
    expect(mocks.batchSet).toHaveBeenCalledTimes(1) // المصروف فقط
  })

  it('تعديل مصروف موجود يستخدم setDoc على مستنده لا دفعة جديدة', async () => {
    const { result } = setup({ user: fakeUser })
    const existing: Expense = {
      id: 'e1', date: '2026-08-01', description: 'قديم', amount: 100, originalAmount: 100,
      currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 500,
    }
    act(() => result.current.startEditExpense(existing))
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'محدّث' }))

    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const [docArg, payloadArg] = mocks.setDoc.mock.calls[0]
    expect(docArg).toEqual({ __expenseDoc: 'e1' })
    expect(payloadArg).toMatchObject({ description: 'محدّث', createdAt: 500 })
    expect(mocks.batchCommit).not.toHaveBeenCalled()
  })

  it('يمنع إضافة مصروف ثانٍ خلال أقل من ثانية لغير المسؤول، ويسمح بعد مرورها', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const { result, setSyncError } = setup({ user: fakeUser, isAdmin: false })

    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'قهوة', amount: '20' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)

    nowSpy.mockReturnValue(1_700_000_000_500) // 500ms لاحقاً — أقل من ثانية
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'قهوة ثانية', amount: '15' }))
    act(() => result.current.handleAddExpense(fakeEvent()))
    expect(setSyncError).toHaveBeenCalledWith('تمهّل قليلاً — لا يمكن إضافة أكثر من مصروف واحد كل ثانية.')
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1) // لم تُرسَل دفعة ثانية

    nowSpy.mockReturnValue(1_700_000_001_600) // بعد أكثر من ثانية من أول إضافة
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'قهوة ثالثة', amount: '10' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it('حذف عبر Firestore يستدعي updateDoc بـ deletedAt، والاستعادة تعيده لـ null', () => {
    const { result } = setup({ user: fakeUser })
    act(() => result.current.confirmDelete('e1'))
    expect(mocks.updateDoc).toHaveBeenCalledWith({ __expenseDoc: 'e1' }, { deletedAt: expect.any(Number) })

    act(() => result.current.handleRestoreExpense('e1'))
    expect(mocks.updateDoc).toHaveBeenCalledWith({ __expenseDoc: 'e1' }, { deletedAt: null })
  })

  it('فشل حذف عبر Firestore يستدعي handleFirestoreError برسالة واضحة', async () => {
    mocks.updateDoc.mockRejectedValueOnce(new Error('boom'))
    const { result, handleFirestoreError } = setup({ user: fakeUser })
    await act(async () => {
      result.current.confirmDelete('e1')
      await flushMicrotasks()
    })
    expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'تعذر حذف المصروف.')
  })

  it('كتابة معلّقة بلا حسم (وضع عدم الاتصال) لا تمنع تسجيل مصروف تالٍ', async () => {
    // ⚠️ اختبار انحدار (regression) لخلل حقيقي كشفه E2E: قفل الإرسال كان يُحرَّر
    // في .finally على وعد الكتابة، ووعد Firestore دون اتصال لا يُحسم إطلاقاً —
    // فيبقى القفل مغلقاً ويُرفض كل مصروف تالٍ بصمت. نحاكي ذلك بوعد لا يُحسم أبداً.
    mocks.batchCommit.mockReturnValue(new Promise(() => {})) // معلّق للأبد
    const { result } = setup({ user: fakeUser, isAdmin: true })

    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'أول', amount: '10' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)

    // المصروف الثاني يجب أن يُرسل رغم أن الأول لم يُؤكَّد بعد
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'ثانٍ', amount: '20' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2)
  })

  it('الإضافة السريعة أيضاً لا تُحجب بكتابة سابقة معلّقة بلا حسم', async () => {
    mocks.batchCommit.mockReturnValue(new Promise(() => {}))
    const { result } = setup({ user: fakeUser, isAdmin: true })

    let firstError: string | null = null
    let secondError: string | null = null
    await act(async () => {
      firstError = result.current.handleQuickAddExpense('قهوة', 10)
      await flushMicrotasks()
    })
    await act(async () => {
      secondError = result.current.handleQuickAddExpense('شاي', 12)
      await flushMicrotasks()
    })

    expect(firstError).toBeNull()
    expect(secondError).toBeNull() // لا «جارٍ معالجة طلب سابق»
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2)
  })

  it('خطأ غير قابل لإعادة المحاولة (permission-denied) لا يعرض زر إعادة محاولة', async () => {
    const permissionError = Object.assign(new Error('nope'), { code: 'permission-denied' })
    mocks.batchCommit.mockRejectedValueOnce(permissionError)
    const { result, showToast } = setup({ user: fakeUser, isAdmin: true })
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'قهوة', amount: '20' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })

    const errorToast = showToast.mock.calls.find(([msg]) => msg.type === 'error')
    expect(errorToast?.[0]).toMatchObject({ type: 'error' })
    expect(errorToast?.[0].text).toContain('لا تملك الصلاحية')
    expect(errorToast?.[0].onRetry).toBeUndefined()
  })

  it('خطأ مؤقّت (unavailable) يعرض زر إعادة محاولة وينجح عند الاستدعاء', async () => {
    const transientError = Object.assign(new Error('down'), { code: 'unavailable' })
    mocks.batchCommit.mockRejectedValueOnce(transientError)
    mocks.batchCommit.mockResolvedValueOnce(undefined) // إعادة المحاولة تنجح
    const { result, showToast } = setup({ user: fakeUser, isAdmin: true })
    act(() => result.current.setNewExpense({ ...result.current.newExpense, description: 'قهوة', amount: '20' }))
    await act(async () => {
      result.current.handleAddExpense(fakeEvent())
      await flushMicrotasks()
    })

    const errorToast = showToast.mock.calls.find(([msg]) => msg.type === 'error')
    expect(errorToast?.[0].onRetry).toBeInstanceOf(Function)

    await act(async () => {
      errorToast?.[0].onRetry?.()
      await flushMicrotasks()
    })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2)
  })
})
