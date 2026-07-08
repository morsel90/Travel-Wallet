import { useState, useMemo, useRef, lazy, Suspense, FormEvent, useCallback } from 'react'
import { signInAnonymously, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth'
import { setDoc, updateDoc, doc, writeBatch } from 'firebase/firestore' // ✅ إزالة serverTimestamp
import { auth, db }                                             from './firebase'
import { travelerDoc, depositLogsCol }         from './firestore'
import { exportExpensesToCSV }                 from './utils/export'
import { calculateSettlements, calculateCategoryTotals, calculateSpendingTrend } from './utils/calculations'
import { Virtuoso }                            from 'react-virtuoso'
import { AnimatePresence }                     from 'framer-motion'
import type {
  Traveler,
  DepositMode, ToastMessage, SortOrder
} from './types'

import {
  useAuth, useExchangeRates, useExpenses, useTravelers, useBalances,
  useOnlineStatus, useCountdown, useExpenseActions, useTripConfig,
} from './hooks'
import { useFilteredExpenses } from './hooks/useFilteredExpenses'

import { DataContext } from './context/DataContext'
import { UIContext }   from './context/UIContext'

import ErrorBoundary                     from './components/ErrorBoundary'
import Header                            from './components/Header'
import Toast                             from './components/Toast'
import { ConfirmModal }                  from './components/Modal'
import { TravelerCard }                  from './components/TravelerSection'
import { ExpenseForm, ExpenseListItem }  from './components/ExpenseSection'
import { BankDetailsCard }               from './components/Misc'
import UpdatePrompt                      from './components/UpdatePrompt'
import OnboardingBanner                  from './components/OnboardingBanner'
import TripGate                          from './components/TripGate'
import PullToRefresh                     from './components/PullToRefresh'
import QuickAddFab                       from './components/QuickAddFab'
import ModalFallback                     from './components/modals/ModalFallback'
import { TravelerCardSkeleton, ExpenseListItemSkeleton, ChartsSectionSkeleton } from './components/Skeleton'
import { Users, Receipt, AlertTriangle, Download, Search, WifiOff } from './icons'

const AdminSignInModal   = lazy(() => import('./components/modals/AdminSignInModal'))
const DepositModal       = lazy(() => import('./components/modals/DepositModal'))
const TrashBinModal      = lazy(() => import('./components/modals/TrashBinModal'))
const DepositHistoryModal = lazy(() => import('./components/modals/DepositHistoryModal'))
// 🆕 مُحمَّل بتكاسل لأن Recharts تبعية كبيرة نسبياً — لا داعٍ لتضمينها بالحزمة الرئيسية
const ChartsSection       = lazy(() => import('./components/charts/ChartsSection'))

export default function App() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const { user, isAdmin, needsTripPin, pinCheckLoading, pinError, verifyTripPin } = useAuth()

  // 🆕 بانر "غير متصل" عام — Background Sync الفعلي (تخزين الكتابة أثناء
  // الانقطاع وإرسالها تلقائياً عند العودة) مُنفَّذ أصلاً عبر persistentLocalCache
  // في firebase.ts (طابور Firestore الداخلي)، وليس عبر Workbox (المتعمّد
  // تعطيله لطلبات Firebase في vite.config.js لتفادي تعارضه مع هذا الطابور).
  // هذا الـ hook مجرّد مؤشر واجهة يطمئن المستخدم أن ذلك يحدث تلقائياً.
  const isOnline = useOnlineStatus()

  // 🔒 لا تُنشئ اشتراكات Firestore الفعلية إلا بعد تأكيد الصلاحية (admin أو عضو
  // متحقق من رمز الرحلة). وإلا فالاشتراك يحاول القراءة فور تسجيل الدخول المجهول
  // (قبل إدخال الرمز) فيُرفض بصلاحيات "denied"، ولا يُعاد تلقائياً بعد نجاح
  // التحقق لاحقاً لأن مرجع user لا يتغيّر عند تحديث التوكن فقط.
  const hasAccess = isAdmin || (!pinCheckLoading && !needsTripPin)

  const { ratesUpdatedAt, CURRENCIES } = useExchangeRates()
  const { expenses,  setExpenses,  expensesLoaded,  refreshExpenses }  = useExpenses(hasAccess ? user : null, { setIsSyncing, setSyncError })
  const { travelers, setTravelers, travelersLoaded, refreshTravelers } = useTravelers(hasAccess ? user : null, setIsSyncing)

  // 🆕 دعم رحلات متعددة: تفاصيل الحساب البنكي أصبحت خاصة بكل رحلة (Firestore
  // بدل ثابت في constants.ts) — انظر hooks/useTripConfig.ts. نفس نمط hasAccess
  // المستخدم أعلاه مع useTravelers/useExpenses تماماً وبنفس السبب.
  const { bankDetails } = useTripConfig(hasAccess ? user : null)

  // 🆕 Skeleton Loading: يغطي فقط الفترة بين اجتياز TripGate ووصول أول رد فعلي
  // من Firestore (مرة واحدة لكل جلسة/تسجيل دخول) — لا يظهر مجدداً مع تحديثات
  // الـ listener اللاحقة (real-time) لأن expensesLoaded/travelersLoaded تبقى
  // true بعد أول رد. بدونه كانت تظهر فراغات أو رسالة "لا توجد مصاريف حتى الآن"
  // مضلِّلة أثناء التحميل الفعلي، لا بعد تأكيد عدم وجود بيانات.
  const isInitialLoading = !expensesLoaded || !travelersLoaded

  const activeExpenses = useMemo(() => expenses.filter(e => !e.deletedAt), [expenses])
  const activeTravelers = useMemo(() => travelers.filter(t => !t.deletedAt), [travelers])

  const deletedExpenses = useMemo(() => expenses.filter(e => e.deletedAt), [expenses])
  const deletedTravelers = useMemo(() => travelers.filter(t => t.deletedAt), [travelers])

  const { balances, totalSpent, totalDeposited, totalRemaining } = useBalances(activeTravelers, activeExpenses)

  // 🆕 بيانات مشتقة (derived) للرسوم البيانية — تُحسب فقط عند تغيّر balances/activeExpenses
  // الفعلي، ولا تُقرأ أو تُكتب لـ Firestore مباشرة. انظر utils/calculations.ts.
  const settlements    = useMemo(() => calculateSettlements(balances), [balances])
  const categoryTotals = useMemo(() => calculateCategoryTotals(activeExpenses), [activeExpenses])
  const spendingTrend  = useMemo(() => calculateSpendingTrend(activeExpenses), [activeExpenses])

  const {
    searchQuery, setSearchQuery,
    sortOrder, setSortOrder,
    filteredExpenses
  } = useFilteredExpenses(activeExpenses, activeTravelers)

  const [copiedIban, setCopiedIban] = useState(false)
  const [toast,      setToast]      = useState<ToastMessage | null>(null)
  // 🆕 يتتبّع مؤقّت إخفاء التوست الحالي لإلغائه عند ظهور توست جديد قبل انتهاء
  // مهلة القديم — بدون هذا، توست جديد (مثال: "تم استعادة") قد يُخفى قبل أوانه
  // بمؤقّت توست سابق كان لا يزال يعمل (مثال: توست حذف بمهلة 5 ثوانٍ للتراجع).
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const [showAdminSignIn, setShowAdminSignIn] = useState(false)
  const [showTrashBin,    setShowTrashBin]    = useState(false)
  const [adminEmail,      setAdminEmail]      = useState('')
  const [adminPassword,   setAdminPassword]   = useState('')
  const [authError,       setAuthError]       = useState<string | null>(null)

  // 🆕 استرداد كلمة المرور — حالة تحميل + عدّ تنازلي 60 ثانية قبل إتاحة إعادة
  // الإرسال (يمنع الإرسال المتكرر وإرهاق صندوق بريد المستخدم أو حدود Firebase)
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false)
  const [resetCooldownUntil,  setResetCooldownUntil]  = useState<number | null>(null)
  const resetCooldownSeconds = useCountdown(resetCooldownUntil)

  const [isAddingTraveler,   setIsAddingTraveler]   = useState(false)
  const [newTravelerName,    setNewTravelerName]    = useState('')
  const [newTravelerDeposit, setNewTravelerDeposit] = useState('')
  const [travelerToDelete,   setTravelerToDelete]   = useState<Traveler | null>(null)

  const [depositModalFor, setDepositModalFor] = useState<Traveler | null>(null)
  const [depositAmount,   setDepositAmount]   = useState('')
  const [depositMode,     setDepositMode]     = useState<DepositMode>('add')
  const [depositReason,   setDepositReason]   = useState('') // 🆕 سبب اختياري يُحفظ بسجل التدقيق
  const [depositHistoryFor, setDepositHistoryFor] = useState<Traveler | null>(null) // 🆕 مسافر عرض سجل تعديلاته

  // 🆕 durationMs اختياري (افتراضي 2.5 ثانية) — توستات الحذف القابلة للتراجع
  // تمرر 5 ثوانٍ لإعطاء وقت كافٍ للضغط على "تراجع". clearTimeout للمؤقّت
  // السابق يمنع تسابق التوستات (انظر تعليق toastTimeoutRef أعلاه).
  const showToast = useCallback((msg: ToastMessage, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    toastTimeoutRef.current = setTimeout(() => setToast(null), durationMs)
  }, [])

  const handleFirestoreError = useCallback((err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : ''
    setSyncError(msg.includes('permission') ? 'لا تملك الصلاحية لتنفيذ هذا الإجراء.' : fallback)
  }, [])

  // 🆕 Pull-to-Refresh: يُستدعى من PullToRefresh عند سحب الصفحة لأسفل من
  // قمّتها — يجلب المصاريف والمسافرين معاً من الخادم مباشرة متجاوزاً الكاش
  // المحلي تماماً (انظر refreshExpenses/refreshTravelers). عادةً هذا الجلب
  // زائد عن الحاجة تقنياً لأن onSnapshot يبقي كل شيء محدَّثاً لحظياً أصلاً، لكنه
  // إيماءة مطمئنة معتادة في تطبيقات الجوال، ومفيدة فعلياً في حال تعليق اتصال
  // الـ listener لأي سبب (نوم الجهاز الطويل مثلاً) دون أن يلاحظ المستخدم.
  const handlePullToRefresh = useCallback(async () => {
    try {
      await Promise.all([refreshExpenses(), refreshTravelers()])
    } catch (err) {
      handleFirestoreError(err, 'تعذر تحديث البيانات — تحقّق من اتصالك وحاول مجدداً.')
    }
  }, [refreshExpenses, refreshTravelers, handleFirestoreError])

  // 🆕 كل منطق نموذج/عمليات المصروف (إضافة/تعديل مع Rate Limiting، حذف ليّن مع
  // توست "تراجع"، استعادة، تبديل المشاركين) استُخرج إلى useExpenseActions
  // لتقليل حجم App.tsx — نفس السلوك تماماً، فقط منقول. انظر hooks/useExpenseActions.ts
  const {
    newExpense, setNewExpense, isAddingExpense, editingExpense, expenseToDelete, setExpenseToDelete,
    openExpenseForm, cancelExpenseForm, handleAddExpense, handleQuickAddExpense, startEditExpense, requestDeleteExpense,
    confirmDelete, handleRestoreExpense, toggleParticipant, toggleAllParticipants,
  } = useExpenseActions({
    activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError,
  })

  const handleRestoreTraveler = useCallback((id: number) => {
    if (!user) return
    showToast({ text: 'تم استعادة المسافر إلى القائمة النشطة', type: 'success' })
    updateDoc(travelerDoc(id), { deletedAt: null })
      .catch(err => handleFirestoreError(err, 'تعذر استعادة المسافر.'))
  }, [user, showToast, handleFirestoreError])

  const requestDeleteTraveler = useCallback((traveler: Traveler) => setTravelerToDelete(traveler), [])
  const openDeposit = useCallback((traveler: Traveler) => setDepositModalFor(traveler), [])
  const openDepositHistory = useCallback((traveler: Traveler) => setDepositHistoryFor(traveler), []) // 🆕
  
  const startAddTraveler = useCallback(() => setIsAddingTraveler(true), [])
  const cancelAddTraveler = useCallback(() => {
    setIsAddingTraveler(false)
    setNewTravelerName('')
    setNewTravelerDeposit('')
  }, [])
  const handleAddTraveler = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newTravelerName.trim()) return
    const shortName = newTravelerName.trim().split(' ')[0]
    if (activeTravelers.some(t => t.shortName === shortName)) {
      setSyncError(`يوجد مسافر بنفس الاسم المختصر "${shortName}"، استخدم اسمًا مختلفًا.`)
      return
    }
    const id = travelers.length ? Math.max(...travelers.map(t => t.id)) + 1 : 1
    // 🐛 إصلاح: useTravelers يستعلم بـ where('deletedAt', '==', null) — Firestore
    // لا يُطابق هذا الاستعلام مستنداً لا يملك الحقل إطلاقاً (مختلف عن "يساوي null"
    // في SQL)، فبدون تحديد deletedAt هنا صراحةً لن يظهر المسافر الجديد في القائمة
    // نهائياً بعد الإضافة (استُدرِك هذا الآن أثناء العمل على التحديثات المتفائلة).
    const traveler: Traveler = { id, name: newTravelerName.trim(), shortName, deposited: parseFloat(newTravelerDeposit) || 0, deletedAt: null }

    setNewTravelerName('')
    setNewTravelerDeposit('')
    setIsAddingTraveler(false)

    if (!user) {
      setTravelers(prev => [...prev, traveler])
      return
    }
    setDoc(travelerDoc(id), traveler)
      .catch(err => handleFirestoreError(err, 'تعذر إضافة المسافر.'))
  }, [newTravelerName, newTravelerDeposit, travelers, activeTravelers, user, setTravelers, handleFirestoreError])

  // ✅ التعديل هنا: استخدام Date.now() بدلاً من serverTimestamp للتوافق مع قواعد الأمان
  // 🆕 متفائل — انظر تعليق handleAddExpense أعلاه لشرح النمط والتراجع التلقائي
  // 🆕 Undo: نفس نمط confirmDelete أعلاه (توست 5 ثوانٍ + زر "تراجع" → handleRestoreTraveler)
  const confirmDeleteTraveler = useCallback((id: number) => {
    setTravelerToDelete(null)
    showToast(
      { text: 'تم نقل المسافر إلى سلة المهملات', type: 'success', onUndo: () => handleRestoreTraveler(id) },
      5000
    )
    if (!user) {
      setTravelers(prev => prev.filter(t => t.id !== id))
      return
    }
    updateDoc(travelerDoc(id), { deletedAt: Date.now() })
      .catch(err => handleFirestoreError(err, 'تعذر حذف المسافر.'))
  }, [user, setTravelers, handleFirestoreError, showToast, handleRestoreTraveler])

  const handleAddDeposit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!depositModalFor) return
    const amt = parseFloat(depositAmount)
    if (isNaN(amt) || (depositMode !== 'set' && amt <= 0) || (depositMode === 'set' && amt < 0)) return

    const previousDeposited = depositModalFor.deposited
    const travelerId = depositModalFor.id
    const newAmount =
      depositMode === 'set'      ? amt :
      depositMode === 'subtract' ? Math.max(0, previousDeposited - amt) :
                                   previousDeposited + amt

    // 🆕 متفائل: نغلق نافذة الإيداع ونعرض التوست فوراً — انظر تعليق handleAddExpense
    setDepositModalFor(null); setDepositAmount(''); setDepositMode('add'); setDepositReason('')
    showToast({ text: 'تم تحديث الرصيد', type: 'success' })

    if (!user) {
      setTravelers(prev => prev.map(t => t.id === travelerId ? { ...t, deposited: newAmount } : t))
      return
    }

    // تحديث الرصيد + تسجيل سجل تدقيق (من، متى، القيمة السابقة/الجديدة، السبب)
    // بعملية batch واحدة ذرّية — إما ينجح الاثنان معًا أو يفشل الاثنان معًا
    const batch = writeBatch(db)
    batch.update(travelerDoc(travelerId), { deposited: newAmount })
    batch.set(doc(depositLogsCol(travelerId)), {
      travelerId,
      previousDeposited,
      newDeposited:   newAmount,
      delta:          newAmount - previousDeposited,
      mode:           depositMode,
      reason:         depositReason.trim() || null,
      changedByEmail: user.email ?? '',
      changedByUid:   user.uid,
      createdAt:      Date.now(),
    })
    batch.commit().catch(err => handleFirestoreError(err, 'تعذر تحديث الرصيد.'))
  }, [depositAmount, depositMode, depositModalFor, depositReason, user, setTravelers, showToast, handleFirestoreError])

  const handleAdminSignIn = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
      setShowAdminSignIn(false); setAdminEmail(''); setAdminPassword('')
    } catch (err) {
      // 🆕 تمييز رسالة الخطأ حسب السبب الفعلي بدل رسالة عامة واحدة لكل الحالات —
      // نُبقي حالة "بيانات خاطئة" وحدها غامضة عمدًا (لا نفرّق بين بريد غير مسجّل
      // وكلمة مرور خاطئة) حفاظًا على الخصوصية ومنع اكتشاف الحسابات المسجّلة.
      const code = (err as { code?: string })?.code ?? ''
      const message =
        code === 'auth/invalid-email'         ? 'صيغة البريد الإلكتروني غير صحيحة.' :
        code === 'auth/user-disabled'          ? 'تم تعطيل هذا الحساب. تواصل مع الدعم الفني.' :
        code === 'auth/too-many-requests'      ? 'محاولات فاشلة كثيرة متتالية، تم إيقاف الدخول مؤقتًا. حاول بعد قليل.' :
        code === 'auth/network-request-failed' ? 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مجددًا.' :
        'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      setAuthError(message)
      setAdminPassword('')
    }
  }, [adminEmail, adminPassword])

  const handleAdminSignOut = useCallback(async () => {
    try { await signOut(auth) } catch (err) { console.error(err) }
    finally { signInAnonymously(auth).catch(console.error) }
  }, [])

  // 🆕 استرداد كلمة مرور المسؤول داخل التطبيق — يرسل رابط إعادة تعيين عبر
  // Firebase Auth للبريد المكتوب بنافذة تسجيل الدخول، بدون الحاجة لـ Firebase
  // Console. لا يكشف هل البريد مسجّل أو لا (رسالة موحّدة) حفاظًا على الخصوصية.
  // 🆕 UX: isSendingResetEmail يعرض حالة تحميل على الزر أثناء انتظار Firebase،
  // وresetCooldownUntil يمنع إعادة الإرسال لمدة 60 ثانية بعد كل محاولة —
  // نطبّق المهلة حتى لو فشل الإرسال فعلياً (شبكة/خطأ) حفاظاً على نفس الرسالة
  // الموحّدة لكل الحالات (لا نكشف هل الفشل بسبب بريد غير موجود أم غيره).
  const handleForgotPassword = useCallback(async () => {
    if (isSendingResetEmail || resetCooldownSeconds > 0) return
    if (!adminEmail.trim()) {
      setAuthError('أدخل بريدك الإلكتروني بالحقل أعلاه أولاً ثم اضغط "نسيت كلمة المرور؟".')
      return
    }
    setIsSendingResetEmail(true)
    try {
      await sendPasswordResetEmail(auth, adminEmail.trim())
    } catch {
      // نتجاهل تفاصيل الخطأ عمدًا (مثل عدم وجود الحساب) لتفادي كشف معلومات حساسة
    } finally {
      setAuthError(null)
      setIsSendingResetEmail(false)
      setResetCooldownUntil(Date.now() + 60_000)
      showToast({ text: 'إذا كان البريد صحيحًا ومسجّلاً، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.', type: 'success' })
    }
  }, [adminEmail, showToast, isSendingResetEmail, resetCooldownSeconds])

  const handleCopyIban = useCallback(() => {
    navigator.clipboard.writeText(bankDetails.iban)
      .then(() => { setCopiedIban(true); setTimeout(() => setCopiedIban(false), 2000) })
      .catch(() => {})
  }, [bankDetails])

  // 🆕 بناء/تنزيل ملف CSV استُخرج إلى utils/export.ts (exportExpensesToCSV) —
  // دالة بحتة لا حاجة لتغليفها بـ useCallback هنا أصلاً؛ الزر يستدعيها مباشرة.

  const hasUnsavedData = useCallback(() => {
    const hasExpenseData = isAddingExpense && (
      newExpense.description.trim() !== '' ||
      newExpense.amount !== '' ||
      newExpense.currency !== 'SAR' ||
      newExpense.exchangeRate !== '1'
    )
    const hasTravelerData = isAddingTraveler && (
      newTravelerName.trim() !== '' ||
      newTravelerDeposit !== ''
    )
    const hasDepositData = depositModalFor !== null && depositAmount !== ''
    return hasExpenseData || hasTravelerData || hasDepositData
  }, [isAddingExpense, newExpense, isAddingTraveler, newTravelerName, newTravelerDeposit, depositModalFor, depositAmount])

const dataContextValue = useMemo(() => ({
    travelers: activeTravelers,
    expenses: activeExpenses,
    user,
    isAdmin,
    currencies: CURRENCIES,
    ratesUpdatedAt
  }), [activeTravelers, activeExpenses, user, isAdmin, CURRENCIES, ratesUpdatedAt])

  const uiContextValue = useMemo(() => ({
    expenseForm: newExpense,
    setExpenseForm: setNewExpense,
    isExpenseFormOpen: isAddingExpense,
    isEditingExpense: !!editingExpense,
    openExpenseForm,
    cancelExpenseForm,
    submitExpense: handleAddExpense,
    toggleParticipant,
    toggleAllParticipants,
    startEditExpense,
    requestDeleteExpense,
    isAddingTraveler,
    startAddTraveler,
    cancelAddTraveler,
    newTravelerName,
    setNewTravelerName,
    newTravelerDeposit,
    setNewTravelerDeposit,
    submitTraveler: handleAddTraveler,
    openDeposit,
    requestDeleteTraveler,
    openDepositHistory, // 🆕
  }), [
    newExpense, isAddingExpense, editingExpense, isAddingTraveler,
    newTravelerName, newTravelerDeposit,
    openExpenseForm, cancelExpenseForm, handleAddExpense, toggleParticipant, toggleAllParticipants,
    startEditExpense, requestDeleteExpense, startAddTraveler, cancelAddTraveler, handleAddTraveler,
    openDeposit, requestDeleteTraveler, openDepositHistory
  ])

  // 🔒 بوابة رمز الرحلة: تُعرض بدل اللوحة كاملةً حتى تُمنح عضوية الرحلة (أو لمن هو
  // مسؤول أصلاً). لا تُمنع استدعاءات الـ hooks أعلاه — فقط ما يُعرض من JSX.
  if (!isAdmin && (pinCheckLoading || needsTripPin)) {
    return <TripGate loading={pinCheckLoading} error={pinError} onSubmit={verifyTripPin} />
  }

  return (
    <DataContext.Provider value={dataContextValue}>
      <UIContext.Provider value={uiContextValue}>
        <ErrorBoundary
          fallback={
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md">
                <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                <h1 className="text-xl font-bold text-slate-800 mb-2">عذراً، حدث خطأ غير متوقع في النظام!</h1>
                <p className="text-sm text-slate-500 mb-6">يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً.</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
                >
                  إعادة تحميل الصفحة
                </button>
              </div>
            </div>
          }
        >
          <div className="min-h-screen pb-20 md:pb-8">
            <Header
              isSyncing={isSyncing} isAdmin={isAdmin}
              onToggleAdmin={() => isAdmin ? handleAdminSignOut() : setShowAdminSignIn(true)}
              stats={isInitialLoading ? null : { totalDeposited, totalSpent, totalRemaining }}
            />

            {/* 🆕 Pull-to-Refresh: سحب لأسفل عند قمة الصفحة يفرض إعادة جلب
                expenses/travelers من الخادم متجاوزاً الكاش — انظر التعليق الكامل
                في components/PullToRefresh.tsx وhandlePullToRefresh أعلاه. */}
            <PullToRefresh onRefresh={handlePullToRefresh}>
            <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

              <OnboardingBanner />

              {/* 🆕 بانر انقطاع الاتصال — يظهر طوال فترة الانقطاع (لا يُخفى تلقائياً
                  كالتوست، بل يختفي فوراً مع عودة الاتصال). التخزين والإرسال
                  التلقائي فعليان أصلاً عبر Firestore SDK — انظر تعليق useOnlineStatus أعلاه. */}
              {!isOnline && (
                <div className="bg-amber-100 text-amber-800 p-4 rounded-xl text-sm border border-amber-200 shadow-sm flex items-start gap-2">
                  <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
                  أنت غير متصل بالإنترنت حالياً. أي إضافة أو تعديل أو حذف ستقوم به سيُحفظ محلياً تلقائياً ويُرسل بمجرد عودة الاتصال.
                </div>
              )}

              {syncError && (
                <div className="bg-rose-100 text-rose-800 p-4 rounded-xl text-sm border border-rose-200 shadow-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {syncError}
                </div>
              )}

              {/* 🆕 تصغير StatBox: شبكة 2×2 المستقلة السابقة أُزيلت من هنا نهائياً —
                  نفس الأرقام (المبلغ الإجمالي/إجمالي المصروفات/الرصيد المتبقي +
                  عدد المسافرين) انتقلت إلى Header نفسه (انظر prop: stats أدناه
                  وcomponents/Header.tsx) بدل أخذ مساحة عمودية منفصلة أعلى الصفحة. */}

              <section>
                <h2 className="text-lg font-bold text-slate-800 mb-4 px-1 flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-500" /> موقف المسافرين
                  {/* 🆕 عدد المسافرين انتقل من حبّة في Header (كان stat رابعاً) إلى
                      شارة صغيرة هنا بجانب العنوان مباشرة — أقرب لسياقه الفعلي
                      (بطاقات المسافرين تحته)، ويقلّل عدد الحبّات في الصفّ
                      المتقلِّص للهيدر (تفادي تجاوز عرض الشاشات الضيقة جداً). */}
                  {!isInitialLoading && (
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full tabular-nums">
                      {activeTravelers.length}
                    </span>
                  )}
                </h2>
                {/* 🆕 تحسين بطاقات المسافرين: سطر واحد على الجوال دائماً (grid-cols-1) لمنع البتر، 
                    ويتوسع تلقائياً لعمودين أو أكثر على الشاشات الأكبر. */}
                <div className={`grid gap-3 sm:gap-4 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                  {isInitialLoading
                    ? Array.from({ length: 4 }, (_, i) => <TravelerCardSkeleton key={i} />)
                    : balances.map(traveler => (
                        <TravelerCard key={traveler.id} traveler={traveler} />
                      ))
                  }
                </div>
               
              </section>

              {/* 🆕 تصوّر بياني للأرصدة — من يدفع لمن (Sankey)، توزيع حسب الفئة (Pie)،
                  تطوّر الإجمالي عبر الزمن (Bar + Line). لا يظهر أثناء التحميل الأول
                  (Skeleton) ولا إن لم يكن هناك أي مصروف بعد فرصد فارغ لكل رسم لا فائدة منه. */}
              {!isInitialLoading && activeExpenses.length > 0 && (
                <Suspense fallback={<ChartsSectionSkeleton />}>
                  <ChartsSection
                    settlements={settlements}
                    categoryTotals={categoryTotals}
                    spendingTrend={spendingTrend}
                  />
                </Suspense>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6 lg:col-span-1">
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <ExpenseForm />
                  </section>
                  <BankDetailsCard bankDetails={bankDetails} copied={copiedIban} onCopy={handleCopyIban} />
                </div>

                <div className="lg:col-span-2">
                  <section>
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-4 px-1">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-slate-500" /> سجل المصاريف
                      </h2>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => setShowTrashBin(true)}
                            className="flex items-center gap-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            سلة المهملات
                          </button>
                        )}
                        <button
                          onClick={() => exportExpensesToCSV(activeExpenses, activeTravelers)} disabled={!activeExpenses.length}
                          className="flex items-center gap-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                        >
                          <Download className="w-3.5 h-3.5" /> تصدير CSV
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="بحث بالوصف أو المشارك أو التاريخ..."
                          className="w-full border border-slate-200 rounded-xl pr-8 ps-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as unknown as SortOrder)}
                        className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      >
                        <option value="date_desc">الأحدث أولاً</option>
                        <option value="date_asc">الأقدم أولاً</option>
                        <option value="amount_desc">الأعلى مبلغاً</option>
                        <option value="amount_asc">الأقل مبلغاً</option>
                      </select>
                    </div>

                    <ErrorBoundary
                      fallback={
                        <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-2xl border border-rose-100 font-medium text-sm flex items-center justify-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          حدث خطأ غير متوقع أثناء عرض قائمة المصاريف، يرجى المحاولة لاحقاً.
                        </div>
                      }
                    >
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        {isInitialLoading ? (
                          <div>{Array.from({ length: 5 }, (_, i) => <ExpenseListItemSkeleton key={i} />)}</div>
                        ) : activeExpenses.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 font-medium">لا توجد مصاريف حتى الآن</div>
                        ) : filteredExpenses.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 font-medium">لا توجد نتائج لـ "{searchQuery}"</div>
                        ) : (
                          <Virtuoso
                            useWindowScroll
                            data={filteredExpenses}
                            itemContent={(_index, exp) => (
                              <div className="border-b border-slate-100 last:border-none">
                                <ExpenseListItem expense={exp} />
                              </div>
                            )}
                            // 🆕 أثناء التمرير السريع (fling)، تُستبدل العناصر الفعلية بعناصر
                            // Skeleton نائبة بدل عرض مساحات فارغة/فراغ DOM مُعاد تدويره — انظر
                            // توثيق react-virtuoso لـ scrollSeekConfiguration. enter تُفعَّل عند
                            // سرعة تمرير عالية، وexit تُلغي التنشيط بمجرد تباطؤ التمرير تقريباً للتوقف.
                            scrollSeekConfiguration={{
                              enter: velocity => Math.abs(velocity) > 900,
                              exit: velocity => Math.abs(velocity) < 30,
                            }}
                            components={{
                              ScrollSeekPlaceholder: () => <ExpenseListItemSkeleton />,
                            }}
                          />
                        )}
                      </div>
                    </ErrorBoundary>

                    {searchQuery && filteredExpenses.length > 0 && (
                      <p className="text-xs text-slate-400 mt-2 px-1">
                        {filteredExpenses.length} من {activeExpenses.length} مصروف
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </main>
            </PullToRefresh>

            {/* 🆕 Quick Add (FAB): عنصر خارج <PullToRefresh> عمداً — الأخير يطبّق
                CSS transform دائماً على محتواه (حتى بقيمة translateY(0px))، وأي
                transform على عنصر أب يُنشئ "containing block" جديداً لأي عنصر
                position:fixed بداخله، فيكسر ثباته الفعلي أثناء التمرير. لذا يجب
                أن يبقى FAB (وكل عناصر fixed الأخرى كالنوافذ والتوست) خارج تلك
                الشجرة تماماً كما هو هنا. */}
            <QuickAddFab
              visible={!isInitialLoading && !isAddingExpense}
              onQuickAdd={handleQuickAddExpense}
            />

            {/* 🆕 Bottom Sheet: كل النوافذ أدناه (Modal/ConfirmModal المشترك) تنبثق
                الآن من الأسفل على الجوال بحركة framer-motion — كل نافذة مُحاطة
                بـ <AnimatePresence> الخاص بها حتى تُشغَّل حركة الخروج (سحب لأسفل
                واختفاء الخلفية) قبل إزالتها من الشجرة، بدل اختفاء فوري بلا حركة.
                انظر التعليق التوضيحي الكامل في components/Modal.tsx. */}
            <AnimatePresence>
              {expenseToDelete !== null && (
                <ConfirmModal
                  key="confirm-delete-expense"
                  title="تأكيد الحذف?"
                  onConfirm={() => confirmDelete(expenseToDelete)}
                  onCancel={() => setExpenseToDelete(null)}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {travelerToDelete !== null && (
                <ConfirmModal
                  key="confirm-delete-traveler"
                  title={`حذف ${travelerToDelete.name}؟`}
                  message="سيتم نقل هذا المسافر إلى سلة المحذوفات لحماية سجل مصاريفه وحساباته السابقة."
                  onConfirm={() => confirmDeleteTraveler(travelerToDelete.id)}
                  onCancel={() => setTravelerToDelete(null)}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showAdminSignIn && (
                <Suspense key="admin-sign-in" fallback={<ModalFallback />}>
                  <AdminSignInModal
                    email={adminEmail} setEmail={setAdminEmail}
                    password={adminPassword} setPassword={setAdminPassword}
                    authError={authError} onSubmit={handleAdminSignIn}
                    onClose={() => { setShowAdminSignIn(false); setAuthError(null) }}
                    onForgotPassword={handleForgotPassword}
                    isSendingResetEmail={isSendingResetEmail}
                    resetCooldownSeconds={resetCooldownSeconds}
                  />
                </Suspense>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {depositModalFor && (
                <Suspense key="deposit" fallback={<ModalFallback />}>
                  <DepositModal
                    traveler={depositModalFor} amount={depositAmount} setAmount={setDepositAmount}
                    mode={depositMode} setMode={setDepositMode}
                    reason={depositReason} setReason={setDepositReason}
                    onSubmit={handleAddDeposit}
                    onClose={() => { setDepositModalFor(null); setDepositAmount(''); setDepositMode('add'); setDepositReason('') }}
                  />
                </Suspense>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {depositHistoryFor && (
                <Suspense key="deposit-history" fallback={<ModalFallback />}>
                  <DepositHistoryModal
                    travelerId={depositHistoryFor.id}
                    travelerName={depositHistoryFor.name}
                    onClose={() => setDepositHistoryFor(null)}
                  />
                </Suspense>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showTrashBin && (
                <Suspense key="trash-bin" fallback={<ModalFallback />}>
                  <TrashBinModal
                    deletedExpenses={deletedExpenses}
                    deletedTravelers={deletedTravelers}
                    onRestoreExpense={handleRestoreExpense}
                    onRestoreTraveler={handleRestoreTraveler}
                    onClose={() => setShowTrashBin(false)}
                  />
                </Suspense>
              )}
            </AnimatePresence>

            {toast && <Toast message={toast} />}
            <UpdatePrompt hasUnsavedData={hasUnsavedData} />
          </div>
        </ErrorBoundary>
      </UIContext.Provider>
    </DataContext.Provider>
  )
}