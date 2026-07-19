import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { setDoc, updateDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { expensesCol, expenseDoc, rateLimitDoc } from '../firestore'
import { EXPENSE_CATEGORIES } from '../constants'
import { toIds } from '../utils/participants'
import { haptic } from '../utils/haptics'
import type { Traveler, Expense, ExpenseFormData, ToastMessage } from '../types'

interface UseExpenseActionsParams {
  activeTravelers: Traveler[]
  user: User | null
  isAdmin: boolean
  setExpenses: Dispatch<SetStateAction<Expense[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
  setSyncError: Dispatch<SetStateAction<string | null>>
  // 🆕 صحيح فقط عندما لا توجد أي مصاريف نشطة بعد — يُستخدم لإطلاق ومضة haptic
  // احتفالية عند تسجيل أول مصروف في الرحلة (وليس مع كل إضافة روتينية لاحقاً).
  isFirstExpense: boolean
}

export interface UseExpenseActionsResult {
  newExpense: ExpenseFormData
  setNewExpense: Dispatch<SetStateAction<ExpenseFormData>>
  isAddingExpense: boolean
  editingExpense: Expense | null
  expenseToDelete: string | null
  setExpenseToDelete: Dispatch<SetStateAction<string | null>>
  // تم التعديل هنا لتقبل الدالة النصوص الممررة من الشريط السريع
  openExpenseForm: (initialDesc?: string, initialAmount?: string) => void
  cancelExpenseForm: () => void
  handleAddExpense: (e: FormEvent<HTMLFormElement>) => void
  handleQuickAddExpense: (description: string, amount: number) => string | null
  startEditExpense: (exp: Expense) => void
  requestDeleteExpense: (id: string) => void
  confirmDelete: (id: string) => void
  handleRestoreExpense: (id: string) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void
}

export function useExpenseActions({
  activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError, isFirstExpense,
}: UseExpenseActionsParams): UseExpenseActionsResult {
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [editingExpense,  setEditingExpense]  = useState<Expense | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null)

  const isSubmittingExpenseRef = useRef(false)
  const lastExpenseCreateAtRef = useRef(0)
  // 🆕 يخزّن بيانات آخر مصروف قبل مسح النموذج لإعادة المحاولة عند فشل الكتابة
  // دون الاعتماد على newExpense التي تُمسح فوراً بعد الإرسال.
  const lastExpensePayloadRef = useRef<{ payload: Omit<Expense, 'id'>; editingId?: string; wasEditing: boolean } | null>(null)

  const emptyExpenseForm = useCallback((): ExpenseFormData => ({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    currency: 'SAR',
    exchangeRate: '1',
    participants: activeTravelers.map(t => t.id),
    category: EXPENSE_CATEGORIES[0],
    splitMode: 'equal',
    shares: {},
  }), [activeTravelers])

  const [newExpense, setNewExpense] = useState<ExpenseFormData>(emptyExpenseForm)

  const handleAddExpense = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isSubmittingExpenseRef.current) return
    if (!newExpense.description || !newExpense.amount || !newExpense.participants.length) return

    const wasEditing = !!editingExpense
    const now = Date.now()

    if (!wasEditing && !isAdmin && now - lastExpenseCreateAtRef.current < 1000) {
      setSyncError('تمهّل قليلاً — لا يمكن إضافة أكثر من مصروف واحد كل ثانية.')
      return
    }

    isSubmittingExpenseRef.current = true

    const amountSAR  = parseFloat(newExpense.amount) * parseFloat(newExpense.exchangeRate)
    const payload: Omit<Expense, 'id'> = {
      date:           newExpense.date,
      description:    newExpense.description,
      amount:         amountSAR,
      originalAmount: parseFloat(newExpense.amount),
      currency:       newExpense.currency,
      exchangeRate:   parseFloat(newExpense.exchangeRate),
      participants:   newExpense.participants,
      category:       newExpense.category,
      createdAt:      editingExpense?.createdAt ?? now,
      createdByUid:   editingExpense?.createdByUid ?? user?.uid,
    }

    if (newExpense.splitMode === 'custom' && newExpense.participants.length > 0) {
      const shares: Record<string, number> = {}
      newExpense.participants.forEach(id => {
        shares[String(id)] = newExpense.shares[id] ?? 1
      })
      payload.shares = shares
    }
    const editingId = editingExpense?.id

    // 🆕 حفظ الحمولة قبل مسح النموذج لاستخدامها في إعادة المحاولة
    lastExpensePayloadRef.current = { payload, editingId, wasEditing }
    setNewExpense(emptyExpenseForm())
    setEditingExpense(null)
    setIsAddingExpense(false)
    showToast({ text: wasEditing ? 'تم حفظ التعديلات' : 'تم تسجيل المصروف', type: wasEditing ? 'edit' : 'new' })
    haptic.success()
    // 🆕 ومضة احتفالية فقط عند أول مصروف فعلي يُسجَّل في الرحلة (وليس عند تعديل)
    if (!wasEditing && isFirstExpense) haptic.flash()

    if (!user) {
      if (wasEditing && editingId) setExpenses(prev => prev.map(x => x.id === editingId ? { id: editingId, ...payload } : x))
      else setExpenses(prev => [{ id: String(Date.now()), ...payload }, ...prev])
      isSubmittingExpenseRef.current = false
      return
    }

    const handleError = () => {
      haptic.error()
      showToast({
        text: 'فشل الحفظ، يبدو أنك غير متصل بالإنترنت',
        type: 'error',
        onRetry: () => {
          showToast({ text: 'جاري إعادة المحاولة...', type: 'new' }, 1000)
          // 🆕 إعادة المحاولة باستخدام الحمولة المحفوظة (بدل newExpense الممسوحة)
          const saved = lastExpensePayloadRef.current
          if (!saved || !user) return
          if (saved.wasEditing && saved.editingId) {
            setDoc(expenseDoc(saved.editingId), saved.payload)
              .catch(() => {}).finally(() => { isSubmittingExpenseRef.current = false })
          } else {
            const batch = writeBatch(db)
            batch.set(doc(expensesCol()), saved.payload)
            if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: Date.now() })
            batch.commit()
              .catch(() => {}).finally(() => { isSubmittingExpenseRef.current = false })
          }
        }
      }, Infinity)
    }

    if (wasEditing && editingId) {
      setDoc(expenseDoc(editingId), payload)
        .catch(handleError)
        .finally(() => { isSubmittingExpenseRef.current = false })
    } else {
      lastExpenseCreateAtRef.current = now
      const batch = writeBatch(db)
      batch.set(doc(expensesCol()), payload)
      if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
      batch.commit()
        .catch(handleError)
        .finally(() => { isSubmittingExpenseRef.current = false })
    }
  }, [newExpense, editingExpense, user, isAdmin, emptyExpenseForm, setExpenses, showToast, handleFirestoreError, setSyncError, isFirstExpense])

  const handleQuickAddExpense = useCallback((description: string, amount: number): string | null => {
    if (isSubmittingExpenseRef.current) return 'جارٍ معالجة طلب سابق، حاول بعد لحظة.'
    const trimmedDescription = description.trim()
    if (!trimmedDescription) return 'أدخل وصفاً للمصروف.'
    if (!Number.isFinite(amount) || amount <= 0) return 'أدخل مبلغاً صحيحاً أكبر من صفر.'
    if (activeTravelers.length === 0) return 'أضف مسافراً واحداً على الأقل قبل تسجيل مصروف.'

    const now = Date.now()
    if (!isAdmin && now - lastExpenseCreateAtRef.current < 1000) {
      return 'تمهّل قليلاً — لا يمكن إضافة أكثر من مصروف واحد كل ثانية.'
    }

    isSubmittingExpenseRef.current = true

    const payload: Omit<Expense, 'id'> = {
      date:           new Date().toISOString().split('T')[0],
      description:    trimmedDescription,
      amount,
      originalAmount: amount,
      currency:       'SAR',
      exchangeRate:   1,
      participants:   activeTravelers.map(t => t.id),
      category:       EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1],
      createdAt:      now,
      createdByUid:   user?.uid,
    }

    showToast({ text: 'تم تسجيل المصروف', type: 'new' })
    haptic.success()
    // 🆕 الإضافة السريعة دائماً مصروف جديد (لا يوجد تعديل عبر هذا المسار)
    if (isFirstExpense) haptic.flash()

    if (!user) {
      setExpenses(prev => [{ id: String(now), ...payload }, ...prev])
      isSubmittingExpenseRef.current = false
      return null
    }

    const handleQuickError = () => {
      haptic.error()
      showToast({
        text: "فشل الحفظ، يبدو أنك غير متصل بالإنترنت", 
        type: "error", 
        onRetry: () => {
          showToast({ text: 'جاري إعادة المحاولة...', type: 'new' }, 1000);
          handleQuickAddExpense(description, amount);
        }
      }, Infinity);
    }

    lastExpenseCreateAtRef.current = now
    const batch = writeBatch(db)
    batch.set(doc(expensesCol()), payload)
    if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
    batch.commit()
      .catch(handleQuickError)
      .finally(() => { isSubmittingExpenseRef.current = false })

    return null
  }, [activeTravelers, isAdmin, user, setExpenses, showToast, handleFirestoreError, isFirstExpense])

  const startEditExpense = useCallback((exp: Expense) => {
    setEditingExpense(exp)
    const shares: Record<number, number> = {}
    if (exp.shares) {
      Object.entries(exp.shares).forEach(([id, w]) => { shares[Number(id)] = w })
    }
    setNewExpense({
      date:         exp.date,
      description:  exp.description,
      amount:       String(exp.originalAmount),
      currency:     exp.currency,
      exchangeRate: String(exp.exchangeRate),
      participants: toIds(exp.participants, activeTravelers),
      category:     exp.category ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1],
      splitMode:    exp.shares ? 'custom' : 'equal',
      shares,
    })
    setIsAddingExpense(true)
  }, [activeTravelers])

  const cancelExpenseForm = useCallback(() => {
    setNewExpense(emptyExpenseForm())
    setEditingExpense(null)
    setIsAddingExpense(false)
  }, [emptyExpenseForm])

  const handleRestoreExpense = useCallback((id: string) => {
    if (!user) return
    showToast({ text: 'تم استعادة المصروف وتحديث الحسابات', type: 'success' })
    updateDoc(expenseDoc(id), { deletedAt: null })
      .catch(err => handleFirestoreError(err, 'تعذر استعادة المصروف.'))
  }, [user, showToast, handleFirestoreError])

  const confirmDelete = useCallback((id: string) => {
    setExpenseToDelete(null)
    haptic.medium()
    showToast(
      { text: 'تم نقل المصروف إلى سلة المهملات', type: 'success', onUndo: () => handleRestoreExpense(id) },
      5000
    )
    if (!user) {
      setExpenses(prev => prev.filter(e => e.id !== id))
      return
    }
    updateDoc(expenseDoc(id), { deletedAt: Date.now() })
      .catch(err => handleFirestoreError(err, 'تعذر حذف المصروف.'))
  }, [user, setExpenses, handleFirestoreError, showToast, handleRestoreExpense])

  const requestDeleteExpense = useCallback((id: string) => setExpenseToDelete(id), [])

  // تم التعديل هنا لاستقبال البيانات ونقلها للنموذج الكامل
  const openExpenseForm = useCallback((initialDesc = '', initialAmount = '') => {
    setEditingExpense(null)
    setNewExpense({
      ...emptyExpenseForm(),
      description: initialDesc,
      amount: initialAmount,
    })
    setIsAddingExpense(true)
  }, [emptyExpenseForm])

  const toggleParticipant = useCallback((id: number) => {
    const cur = newExpense.participants
    const isSelected = cur.includes(id)
    const shares = { ...newExpense.shares }
    if (isSelected) {
      delete shares[id]
    } else if (newExpense.splitMode === 'custom') {
      shares[id] = shares[id] ?? 1
    }
    setNewExpense({
      ...newExpense,
      participants: isSelected ? cur.filter(n => n !== id) : [...cur, id],
      shares,
    })
  }, [newExpense])

  const toggleAllParticipants = useCallback(() => {
    const allSelected = newExpense.participants.length === activeTravelers.length
    if (allSelected) {
      setNewExpense({ ...newExpense, participants: [], shares: {} })
      return
    }
    const participants = activeTravelers.map(t => t.id)
    const shares = { ...newExpense.shares }
    if (newExpense.splitMode === 'custom') {
      participants.forEach(id => { shares[id] = shares[id] ?? 1 })
    }
    setNewExpense({ ...newExpense, participants, shares })
  }, [newExpense, activeTravelers])

  return {
    newExpense, setNewExpense, isAddingExpense, editingExpense, expenseToDelete, setExpenseToDelete,
    openExpenseForm, cancelExpenseForm, handleAddExpense, handleQuickAddExpense, startEditExpense, requestDeleteExpense,
    confirmDelete, handleRestoreExpense, toggleParticipant, toggleAllParticipants,
  }
}