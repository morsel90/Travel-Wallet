import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { setDoc, updateDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { expensesCol, expenseDoc, rateLimitDoc } from '../firestore'
import { EXPENSE_CATEGORIES } from '../constants'
import { toIds } from '../utils/participants'
import type { Traveler, Expense, ExpenseFormData, ToastMessage } from '../types'

interface UseExpenseActionsParams {
  activeTravelers: Traveler[]
  user: User | null
  isAdmin: boolean
  setExpenses: Dispatch<SetStateAction<Expense[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
  setSyncError: Dispatch<SetStateAction<string | null>>
}

export interface UseExpenseActionsResult {
  newExpense: ExpenseFormData
  setNewExpense: Dispatch<SetStateAction<ExpenseFormData>>
  isAddingExpense: boolean
  editingExpense: Expense | null
  expenseToDelete: string | null
  setExpenseToDelete: Dispatch<SetStateAction<string | null>>
  openExpenseForm: () => void
  cancelExpenseForm: () => void
  handleAddExpense: (e: FormEvent<HTMLFormElement>) => void
  // 🆕 Quick Add (FAB): تُعيد نص خطأ إن تعذّر التنفيذ (ليعرضه المكوّن الطالب)،
  // أو null عند النجاح — انظر شرح كامل عند تعريفها أدناه
  handleQuickAddExpense: (description: string, amount: number) => string | null
  startEditExpense: (exp: Expense) => void
  requestDeleteExpense: (id: string) => void
  confirmDelete: (id: string) => void
  handleRestoreExpense: (id: string) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void
}

/**
 * 🆕 يجمّع كل منطق نموذج/عمليات المصروف (فتح/إلغاء النموذج، إضافة وتعديل عبر
 * batch واحد مع Rate Limiting، حذف ليّن مع توست "تراجع"، استعادة، تبديل
 * المشاركين) في مكان واحد بدل تضخيم App.tsx أكثر. استُخرج حرفياً من App.tsx
 * دون أي تغيير في السلوك — Optimistic Updates وRate Limiting وUndo كلها كما
 * كانت تماماً، فقط انتقلت إلى هنا.
 *
 * يأخذ كمدخلات فقط ما لا يملكه هو نفسه: المسافرون النشطون (لحساب المشاركين
 * الافتراضيين)، المستخدم وصلاحية المسؤول (للحذف/الحد من المعدّل)، ودوال عامة
 * مشتركة مع باقي App.tsx (setExpenses/showToast/handleFirestoreError/setSyncError).
 */
export function useExpenseActions({
  activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError,
}: UseExpenseActionsParams): UseExpenseActionsResult {
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [editingExpense,  setEditingExpense]  = useState<Expense | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null)

  // 🆕 حماية بسيطة ضد إرسال مصروف مكرر بسرعة — ref لا state (لا حاجة لإعادة رسم
  // أو نص/تعطيل مرئي على الزر؛ النموذج يُغلَق فوراً في نمط التحديث المتفائل أصلاً)
  const isSubmittingExpenseRef = useRef(false)

  // 🆕 Rate Limiting: فحص جانبي فوري (UX فقط) لآخر وقت إضافة مصروف جديد من هذا
  // الجهاز — يعطي رسالة صديقة فورية دون انتظار رفض الخادم. هذا ليس الحماية
  // الفعلية (أي عميل يستدعي Firestore SDK مباشرة يتجاوزه بسهولة)؛ الفرض الحقيقي
  // يقع في firestore.rules عبر withinExpenseRateLimit + مستند rateLimits/{uid}
  // (انظر handleAddExpense أدناه).
  const lastExpenseCreateAtRef = useRef(0)

  const emptyExpenseForm = useCallback((): ExpenseFormData => ({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    currency: 'SAR',
    exchangeRate: '1',
    participants: activeTravelers.map(t => t.id),
    category: EXPENSE_CATEGORIES[0],
    // 🆕 تقسيم غير متساوٍ: 'equal' افتراضياً دائماً عند فتح نموذج جديد
    splitMode: 'equal',
    shares: {},
  }), [activeTravelers])

  const [newExpense, setNewExpense] = useState<ExpenseFormData>(emptyExpenseForm)

  // 🆕 Optimistic Updates: لا ننتظر (await) تأكيد الخادم قبل إغلاق النموذج/عرض
  // التوست — نطبّقه فوراً. Firestore يكتب على الكاش المحلي فور استدعاء
  // setDoc/updateDoc/batch.commit (قبل رد الخادم بأي حال)، وonSnapshot في
  // useExpenses (بـ includeMetadataChanges) يعكس ذلك في القائمة شبه لحظياً مع
  // شارة "جارٍ المزامنة" (_pending) على العنصر ريثما يُؤكَّد. إن فشلت الكتابة
  // فعلياً (شبكة/صلاحيات) يتراجع Firestore عن التغيير في الكاش تلقائياً،
  // ونكتفي من جهتنا بعرض رسالة خطأ توضيحية عبر handleFirestoreError.
  const handleAddExpense = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // ✅ الحماية: منع تنفيذ الدالة إذا كان هناك إرسال قيد المعالجة
    if (isSubmittingExpenseRef.current) return
    if (!newExpense.description || !newExpense.amount || !newExpense.participants.length) return

    const wasEditing = !!editingExpense
    const now = Date.now()

    // 🆕 Rate Limiting (فحص جانب العميل فقط — راجع تعليق lastExpenseCreateAtRef
    // أعلاه): يطبَّق فقط على الإضافة الجديدة (لا التعديل)، والمسؤول معفى منه
    // بنفس منطق firestore.rules (withinExpenseRateLimit). لا يغلق النموذج ولا
    // يُصفّره — فقط رسالة تنبيه ليحاول المستخدم بعد لحظة.
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
      // 🆕 نحافظ على مالك المصروف الأصلي عند التعديل، أو نسجّل uid الجلسة الحالية
      // عند الإنشاء لأول مرة — يُستخدم لاحقاً للسماح لصاحبه بتصحيح خطأه بنفسه
      createdByUid:   editingExpense?.createdByUid ?? user?.uid,
    }

    // 🆕 تقسيم غير متساوٍ: لا نكتب shares إطلاقاً في وضع 'equal' (يبقى المصروف
    // مطابقاً تماماً لمصروف قديم بلا هذا الحقل — تقسيم بالتساوي التام). في وضع
    // 'custom' نكتب فقط أوزان المشاركين المختارين فعلياً (تجاهل أي وزن قديم
    // لمشارك أُزيل لاحقاً من القائمة).
    if (newExpense.splitMode === 'custom' && newExpense.participants.length > 0) {
      const shares: Record<string, number> = {}
      newExpense.participants.forEach(id => {
        shares[String(id)] = newExpense.shares[id] ?? 1
      })
      payload.shares = shares
    }
    const editingId = editingExpense?.id

    // إغلاق النموذج وتصفيره فوراً (متفائل) — قبل أي انتظار للشبكة
    setNewExpense(emptyExpenseForm())
    setEditingExpense(null)
    setIsAddingExpense(false)
    showToast({ text: wasEditing ? 'تم حفظ التعديلات' : 'تم تسجيل المصروف', type: wasEditing ? 'edit' : 'new' })

    if (!user) {
      // وضع محلي بلا Firebase — لا شبكة فعلية، فلا حاجة لتفاؤل أو تراجع
      if (wasEditing && editingId) setExpenses(prev => prev.map(x => x.id === editingId ? { id: editingId, ...payload } : x))
      else setExpenses(prev => [{ id: String(Date.now()), ...payload }, ...prev])
      isSubmittingExpenseRef.current = false
      return
    }

    if (wasEditing && editingId) {
      setDoc(expenseDoc(editingId), payload)
        .catch(err => handleFirestoreError(err, 'تعذر حفظ المصروف — تحقّق من اتصالك وحاول مجدداً.'))
        .finally(() => { isSubmittingExpenseRef.current = false })
    } else {
      // 🆕 batch بدل addDoc: نكتب المصروف الجديد ومستند rateLimits/{uid} معاً
      // بذرّية واحدة — القاعدة الأمنية تتحقق من withinExpenseRateLimit قبل
      // قبول أي منهما (فشل أحدهما يُسقط العملية كاملة، فلا يتحدّث سجل حد
      // المعدّل إن رُفض المصروف نفسه لأي سبب).
      lastExpenseCreateAtRef.current = now
      const batch = writeBatch(db)
      batch.set(doc(expensesCol()), payload)
      if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
      batch.commit()
        .catch(err => handleFirestoreError(err, 'تعذر حفظ المصروف — تحقّق من اتصالك وحاول مجدداً.'))
        .finally(() => { isSubmittingExpenseRef.current = false })
    }
  }, [newExpense, editingExpense, user, isAdmin, emptyExpenseForm, setExpenses, showToast, handleFirestoreError, setSyncError])

  // 🆕 Quick Add (FAB): نسخة مختصرة من handleAddExpense — وصف ومبلغ فقط، والباقي
  // افتراضي (تاريخ اليوم، ريال سعودي بلا تحويل عملة، كل المسافرين النشطين
  // بتقسيم متساوٍ بلا shares، فئة "أخرى" الافتراضية لأنها لا تُطلب هنا). تُستخدم
  // من زر FAB العائم الوحيد (components/QuickAddFab.tsx) بدل تكرار حقول
  // النموذج الكامل. نفس منطق الكتابة (batch + Rate Limiting + التحديث
  // المتفائل) المستخدَم في handleAddExpense تماماً، فقط بحمولة (payload) أبسط
  // مبنية مباشرة بدل الاعتماد على newExpense/الفورم — أُبقيت مستقلة (غير
  // مُستخلَصة كدالة مشتركة مع handleAddExpense) تفادياً لأي مخاطرة تعديل غير
  // مقصودة على مسار الإضافة الكامل المُختبَر أصلاً.
  const handleQuickAddExpense = useCallback((description: string, amount: number): string | null => {
    if (isSubmittingExpenseRef.current) return 'جارٍ معالجة طلب سابق، حاول بعد لحظة.'
    const trimmedDescription = description.trim()
    if (!trimmedDescription) return 'أدخل وصفاً للمصروف.'
    if (!Number.isFinite(amount) || amount <= 0) return 'أدخل مبلغاً صحيحاً أكبر من صفر.'
    if (activeTravelers.length === 0) return 'أضف مسافراً واحداً على الأقل قبل تسجيل مصروف.'

    const now = Date.now()
    // 🆕 نفس فحص الحد من المعدّل جانب العميل المستخدَم في handleAddExpense —
    // المسؤول معفى منه بنفس منطق firestore.rules (withinExpenseRateLimit)
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
      category:       EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1], // 'أخرى'
      createdAt:      now,
      createdByUid:   user?.uid,
    }

    // متفائل — نعرض التوست فوراً قبل انتظار الشبكة، تماماً كما في handleAddExpense
    showToast({ text: 'تم تسجيل المصروف', type: 'new' })

    if (!user) {
      setExpenses(prev => [{ id: String(now), ...payload }, ...prev])
      isSubmittingExpenseRef.current = false
      return null
    }

    lastExpenseCreateAtRef.current = now
    const batch = writeBatch(db)
    batch.set(doc(expensesCol()), payload)
    if (!isAdmin) batch.set(rateLimitDoc(user.uid), { lastExpenseCreatedAt: now })
    batch.commit()
      .catch(err => handleFirestoreError(err, 'تعذر حفظ المصروف — تحقّق من اتصالك وحاول مجدداً.'))
      .finally(() => { isSubmittingExpenseRef.current = false })

    return null
  }, [activeTravelers, isAdmin, user, setExpenses, showToast, handleFirestoreError])

  const startEditExpense = useCallback((exp: Expense) => {
    setEditingExpense(exp)
    // 🆕 نحوّل مفاتيح shares (نصوص كما تُخزَّن في Firestore) إلى أرقام كما
    // يتوقّعها النموذج، ونفتح وضع "تخصيص التقسيم" تلقائياً إن كان هذا المصروف
    // محفوظاً بتقسيم غير متساوٍ أصلاً — حتى لا يفقد المستخدم رؤية/تعديل الأوزان
    // الفعلية عند فتح مصروف سبق تخصيصه.
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
      // 🆕 المصاريف القديمة (قبل إضافة حقل category) تُعامَل كـ "أخرى" افتراضياً عند التعديل
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

  // 🆕 تُعرَّف هنا (قبل confirmDelete أدناه) لأنها تُستخدم كـ onUndo داخل توست
  // الحذف القابل للتراجع.
  const handleRestoreExpense = useCallback((id: string) => {
    if (!user) return
    showToast({ text: 'تم استعادة المصروف وتحديث الحسابات', type: 'success' })
    updateDoc(expenseDoc(id), { deletedAt: null })
      .catch(err => handleFirestoreError(err, 'تعذر استعادة المصروف.'))
  }, [user, showToast, handleFirestoreError])

  // ✅ التعديل هنا: استخدام Date.now() بدلاً من serverTimestamp للتوافق مع قواعد الأمان
  // 🆕 متفائل: نغلق نافذة التأكيد ونعرض التوست فوراً؛ التراجع التلقائي عند فشل
  // الكتابة فعلياً يأتي من كاش Firestore نفسه (انظر تعليق handleAddExpense أعلاه)
  // 🆕 Undo: التوست يبقى 5 ثوانٍ (بدل 2.5) ويحمل زر "تراجع" يستدعي
  // handleRestoreExpense لنفس المصروف مباشرةً — يقلّل خطأ الحذف بالخطأ دون
  // الحاجة لفتح سلة المهملات. إن انتهت المهلة دون ضغط "تراجع"، يبقى المصروف
  // بالسلة كالمعتاد (Soft Delete قابل للاستعادة من هناك في أي وقت لاحق).
  const confirmDelete = useCallback((id: string) => {
    setExpenseToDelete(null)
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

  const openExpenseForm = useCallback(() => {
    setEditingExpense(null)
    setNewExpense(emptyExpenseForm())
    setIsAddingExpense(true)
  }, [emptyExpenseForm])

  const toggleParticipant = useCallback((id: number) => {
    const cur = newExpense.participants
    const isSelected = cur.includes(id)
    // 🆕 نُبقي shares متزامنة مع participants: نحذف وزن أي مشارك أُزيل (حتى لا
    // يبقى وزن "يتيم" بلا مشارك فعلي)، ونمنح وزناً افتراضياً 1 لأي مشارك جديد
    // فقط إن كان وضع "تخصيص التقسيم" مفعّلاً أصلاً — بلا أثر في الوضع الافتراضي.
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
