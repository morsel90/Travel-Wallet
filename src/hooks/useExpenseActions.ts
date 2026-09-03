import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { setDoc, updateDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { expensesCol, expenseDoc, rateLimitDoc } from '../firestore'
import { EXPENSE_CATEGORIES } from '../constants'
import { toIds } from '../utils/participants'
import { haptic } from '../utils/haptics'
import { describeWriteError } from '../utils/writeErrors'
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
  // 🆕 انظر تعليق التعريف في الحالة الداخلية أعلاه — SmartInputBar تربط عليه
  expenseAddedSignal: number
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
  // 🆕 يتزايد فقط عند نجاح إضافة مصروف جديد فعلياً (لا عند التعديل ولا الإلغاء)
  // — SmartInputBar تراقبه لتفريغ حقولها بعد إرسال ناجح عبر نموذج التفاصيل
  // الكامل، دون أن تفقد مسودتها إن ألغى المستخدم النموذج بدل إرساله.
  const [expenseAddedSignal, setExpenseAddedSignal] = useState(0)

  const isSubmittingExpenseRef = useRef(false)

  /**
   * 🆕 يحرّر قفل الإرسال بمجرد *إصدار* الكتابة محلياً — لا عند تأكيد الخادم.
   *
   * ⚠️ كان يُحرَّر سابقاً داخل `.finally()` على وعد الكتابة، وهذا خطأ مباشر
   * بالنظر لسلوك Firestore الموثّق في CLAUDE.md: الكتابة دون اتصال تُطبَّق على
   * الكاش المحلي وتبقى معلّقة في IndexedDB بلا حسم — لا تُحلّ ولا تُرفض حتى
   * يعود الاتصال. فـ `.finally()` لا يُستدعى إطلاقاً طوال فترة الانقطاع، ويبقى
   * القفل مغلقاً، فيُرفض كل مصروف تالٍ عند `if (isSubmittingExpenseRef.current)
   * return` **بصمت تام**: النموذج لا يُغلق ولا تظهر أي رسالة.
   *
   * أي أن من يسجّل مصروفاً في الطائرة كان يستطيع تسجيل واحد فقط، ثم يجد النموذج
   * لا يستجيب دون تفسير. كشفه اختبار E2E في e2e/offline-optimistic-write.spec.ts.
   *
   * التحرير الفوري آمن: القفل يحمي من إرسال مزدوج داخل نفس النقرة، وبعد انتهاء
   * المعالج يكون النموذج قد أُغلق (setIsAddingExpense(false)) وأُفرغت حقوله،
   * فلا يبقى زر يُنقر مرتين أصلاً.
   */
  const releaseSubmitLock = useCallback(() => {
    isSubmittingExpenseRef.current = false
  }, [])
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
    paidBy: 'fund',
  }), [activeTravelers])

  const [newExpense, setNewExpense] = useState<ExpenseFormData>(emptyExpenseForm)

  const handleAddExpense = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isSubmittingExpenseRef.current) return
    if (!newExpense.description || !newExpense.amount || !newExpense.participants.length) return

    // 🆕 حارس القيم غير المنتهية — انظر «قاعدة ٤» في utils/calculations.invariants.test.ts
    //
    // الشرط أعلاه يفحص أن النص غير فارغ، لا أنه رقم صالح. و«سعر الصرف» لم يكن
    // مفحوصاً إطلاقاً. فكان يكفي إفراغ حقل سعر الصرف — أو كتابة نقطة وحدها في
    // حقل المبلغ، لأن التنقية في ExpenseSection تُزيل غير [0-9.] فتُبقي '.' وهي
    // نص صادق — ليصير parseFloat = NaN ويمضي المصروف بمبلغ NaN.
    //
    // وأثره ليس رسالة خطأ بل إفساد صامت: التحديث المتفائل يكتب NaN محلياً فوراً،
    // فتصير *كل* الأرصدة والتسويات NaN، ثم ترفض firestore.rules الكتابة
    // (amount >= 0 كاذبة مع NaN) فيتراجع Firestore وتظهر رسالة صلاحيات لا علاقة
    // لها بالسبب. ودون اتصال لا تُرفض أصلاً — تبقى معلّقة في IndexedDB وتبقى كل
    // الأرقام NaN حتى يعود الاتصال.
    //
    // handleQuickAddExpense كان يحرس بهذا الشرط نفسه منذ البداية؛ هذا المسار وحده
    // كان مكشوفاً.
    const amountValue  = parseFloat(newExpense.amount)
    const exchangeRate = parseFloat(newExpense.exchangeRate)
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      setSyncError('أدخل مبلغاً صحيحاً.')
      return
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setSyncError('سعر الصرف غير صالح — أدخل رقماً أكبر من صفر.')
      return
    }

    const wasEditing = !!editingExpense
    const now = Date.now()

    if (!wasEditing && !isAdmin && now - lastExpenseCreateAtRef.current < 1000) {
      setSyncError('تمهّل قليلاً — لا يمكن إضافة أكثر من مصروف واحد كل ثانية.')
      return
    }

    isSubmittingExpenseRef.current = true

    const amountSAR  = amountValue * exchangeRate
    const payload: Omit<Expense, 'id'> = {
      date:           newExpense.date,
      description:    newExpense.description,
      amount:         amountSAR,
      originalAmount: amountValue,
      currency:       newExpense.currency,
      exchangeRate:   exchangeRate,
      participants:   newExpense.participants,
      category:       newExpense.category,
      paidBy:         newExpense.paidBy,
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
    if (!wasEditing) setExpenseAddedSignal(s => s + 1)

    if (!user) {
      if (wasEditing && editingId) setExpenses(prev => prev.map(x => x.id === editingId ? { id: editingId, ...payload } : x))
      else setExpenses(prev => [{ id: String(Date.now()), ...payload }, ...prev])
      isSubmittingExpenseRef.current = false
      return
    }

    // 🆕 وصول الخطأ إلى هنا يعني رفض الخادم للكتابة، لا انقطاع الاتصال: الكتابة
    // دون اتصال تبقى معلّقة في IndexedDB ولا تُرفض (انظر utils/writeErrors.ts).
    // ولأن Firestore يتراجع عن التعديل المحلي عند الرفض، سيختفي الصف من القائمة
    // بعد لحظة — فالرسالة تذكر ذلك صراحةً بدل أن يبدو الاختفاء عطلاً عشوائياً.
    const retryWrite = () => {
      showToast({ text: 'جاري إعادة المحاولة...', type: 'new' }, 1000)
      const saved = lastExpensePayloadRef.current
      if (!saved || !user) return
      const onRetryFailed = (err: unknown) => {
        haptic.error()
        showToast({ ...describeWriteError(err, saved.wasEditing ? 'edit' : 'create'), type: 'error' }, 5000)
      }

      if (saved.wasEditing && saved.editingId) {
        setDoc(expenseDoc(saved.editingId), saved.payload).catch(onRetryFailed)
      } else {
        const batch = writeBatch(db)
        batch.set(doc(expensesCol()), saved.payload)
        if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: Date.now() })
        batch.commit().catch(onRetryFailed)
      }
      releaseSubmitLock()
    }

    const handleError = (err: unknown) => {
      haptic.error()
      const { text, retryable } = describeWriteError(err, wasEditing ? 'edit' : 'create')
      showToast(
        // زر إعادة المحاولة يظهر فقط حين يُجدي — عرضه على رفض منطقي (صلاحيات،
        // حد معدّل) يدعو المستخدم لتكرار عملية ستفشل بنفس الطريقة كل مرة.
        { text, type: 'error', ...(retryable ? { onRetry: retryWrite } : {}) },
        retryable ? Infinity : 6000
      )
    }

    if (wasEditing && editingId) {
      setDoc(expenseDoc(editingId), payload).catch(handleError)
    } else {
      lastExpenseCreateAtRef.current = now
      const batch = writeBatch(db)
      batch.set(doc(expensesCol()), payload)
      if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
      batch.commit().catch(handleError)
    }
    // الكتابة صدرت وطُبِّقت على الكاش المحلي — لا ننتظر تأكيد الخادم لتحرير القفل
    releaseSubmitLock()
  }, [newExpense, editingExpense, user, isAdmin, emptyExpenseForm, setExpenses, showToast, setSyncError, isFirstExpense, releaseSubmitLock])

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

    const handleQuickError = (err: unknown) => {
      haptic.error()
      const { text, retryable } = describeWriteError(err, 'create')
      showToast(
        {
          text,
          type: 'error',
          ...(retryable
            ? {
                onRetry: () => {
                  showToast({ text: 'جاري إعادة المحاولة...', type: 'new' }, 1000)
                  // إعادة المحاولة قد تُرفض بدورها (حد المعدّل، أو لا مسافرون) —
                  // نعرض السبب بدل ابتلاعه بصمت.
                  const retryError = handleQuickAddExpense(description, amount)
                  if (retryError) showToast({ text: retryError, type: 'error' }, 3000)
                },
              }
            : {}),
        },
        retryable ? Infinity : 6000
      )
    }

    lastExpenseCreateAtRef.current = now
    const batch = writeBatch(db)
    batch.set(doc(expensesCol()), payload)
    if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
    batch.commit().catch(handleQuickError)
    // كما في handleAddExpense: التحرير عند إصدار الكتابة لا عند تأكيدها
    releaseSubmitLock()

    return null
  }, [activeTravelers, isAdmin, user, setExpenses, showToast, isFirstExpense, releaseSubmitLock])

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
      paidBy:       exp.paidBy ?? 'fund',
    })
    setIsAddingExpense(true)
    // 🆕 انظر تعليق openExpenseForm أعلاه — نفس السبب.
    setExpenseToDelete(null)
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
    // 🆕 نافذتا التأكيد بالحذف ونموذج المصروف مستقلّتان بنيوياً (كلتاهما Modal
    // بملء الشاشة، z-[9999]) بلا أي إقصاء متبادل — فتح إحداهما بينما الأخرى ما
    // زالت في حركة الخروج (AnimatePresence exit) يُبقيهما مرسومتين معاً متراكبتين
    // فوق بعضهما بصرياً. إغلاقها هنا صريحاً يمنع ذلك بصرف النظر عن توقيت الحركة.
    setExpenseToDelete(null)
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
    expenseAddedSignal,
    openExpenseForm, cancelExpenseForm, handleAddExpense, handleQuickAddExpense, startEditExpense, requestDeleteExpense,
    confirmDelete, handleRestoreExpense, toggleParticipant, toggleAllParticipants,
  }
}