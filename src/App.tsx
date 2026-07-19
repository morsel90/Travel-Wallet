import { useState, useMemo, useRef, lazy, Suspense, FormEvent, useCallback } from 'react'
import { signInAnonymously, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth'
import { setDoc, updateDoc, doc, writeBatch } from 'firebase/firestore' 
import { auth, db }                                             from './firebase'
import { travelerDoc, depositLogsCol }         from './firestore'
import { exportTripToExcel }                   from './utils/reports'
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
import { TravelerCard, AddTravelerForm } from './components/TravelerSection'
import { ExpenseForm, ExpenseListItem }  from './components/ExpenseSection'
import { BankDetailsCard }               from './components/Misc'
import UpdatePrompt                      from './components/UpdatePrompt'
import OnboardingBanner                  from './components/OnboardingBanner'
import TripGate                          from './components/TripGate'
import PullToRefresh                     from './components/PullToRefresh'
import SmartInputBar                       from './components/SmartInputBar'
import EmptyState                         from './components/EmptyState'
import ModalFallback                     from './components/modals/ModalFallback'
import { TravelerCardSkeleton, ExpenseListItemSkeleton, ChartsSectionSkeleton } from './components/Skeleton'
import { haptic }                         from './utils/haptics'
// ✅ تم التصحيح: إضافة Plus إلى سطر استيراد الأيقونات هنا
import { Users, Receipt, AlertTriangle, Download, Search, WifiOff, Plus, BarChart3 } from './icons'

const AdminSignInModal   = lazy(() => import('./components/modals/AdminSignInModal'))
const DepositModal       = lazy(() => import('./components/modals/DepositModal'))
const TrashBinModal      = lazy(() => import('./components/modals/TrashBinModal'))
const DepositHistoryModal = lazy(() => import('./components/modals/DepositHistoryModal'))
const ChartsSection       = lazy(() => import('./components/charts/ChartsSection'))
const ReportsView         = lazy(() => import('./components/reports/ReportsView'))

export default function App() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const { user, isAdmin, needsTripPin, pinCheckLoading, pinError, rateLimitSeconds, verifyTripPin } = useAuth()
  const isOnline = useOnlineStatus()
  const hasAccess = isAdmin || (!pinCheckLoading && !needsTripPin)

  const { ratesUpdatedAt, CURRENCIES } = useExchangeRates()
  const { expenses,  setExpenses,  expensesLoaded,  refreshExpenses }  = useExpenses(hasAccess ? user : null, { setIsSyncing, setSyncError })
  const { travelers, setTravelers, travelersLoaded, refreshTravelers } = useTravelers(hasAccess ? user : null, setIsSyncing)
  const { bankDetails } = useTripConfig(hasAccess ? user : null)

  const isInitialLoading = !expensesLoaded || !travelersLoaded

  const activeExpenses = useMemo(() => expenses.filter(e => !e.deletedAt), [expenses])
  const activeTravelers = useMemo(() => travelers.filter(t => !t.deletedAt), [travelers])

  const deletedExpenses = useMemo(() => expenses.filter(e => e.deletedAt), [expenses])
  const deletedTravelers = useMemo(() => travelers.filter(t => t.deletedAt), [travelers])

  const { balances, totalSpent, totalDeposited, totalRemaining } = useBalances(activeTravelers, activeExpenses)

  const settlements    = useMemo(() => calculateSettlements(balances), [balances])
  const categoryTotals = useMemo(() => calculateCategoryTotals(activeExpenses), [activeExpenses])
  const spendingTrend  = useMemo(() => calculateSpendingTrend(activeExpenses), [activeExpenses])

  const {
    searchQuery, setSearchQuery,
    sortOrder, setSortOrder,
    filteredExpenses
  } = useFilteredExpenses(activeExpenses, activeTravelers)

  const [toast,      setToast]      = useState<ToastMessage | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const [showAdminSignIn, setShowAdminSignIn] = useState(false)
  const [showTrashBin,    setShowTrashBin]    = useState(false)
  const [showReports,     setShowReports]     = useState(false)
  const [adminEmail,      setAdminEmail]      = useState('')
  const [adminPassword,   setAdminPassword]   = useState('')
  const [authError,       setAuthError]       = useState<string | null>(null)

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
  const [depositReason,   setDepositReason]   = useState('') 
  const [depositHistoryFor, setDepositHistoryFor] = useState<Traveler | null>(null) 

  const showToast = useCallback((msg: ToastMessage, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    if (durationMs !== Infinity) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), durationMs)
    }
  }, [])

  const handleFirestoreError = useCallback((err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : ''
    setSyncError(msg.includes('permission') ? 'لا تملك الصلاحية لتنفيذ هذا الإجراء.' : fallback)
  }, [])

  const handlePullToRefresh = useCallback(async () => {
    try {
      await Promise.all([refreshExpenses(), refreshTravelers()])
    } catch (err) {
      handleFirestoreError(err, 'تعذر تحديث البيانات — تحقّق من اتصالك وحاول مجدداً.')
    }
  }, [refreshExpenses, refreshTravelers, handleFirestoreError])

  const {
    newExpense, setNewExpense, isAddingExpense, editingExpense, expenseToDelete, setExpenseToDelete,
    openExpenseForm, cancelExpenseForm, handleAddExpense, handleQuickAddExpense, startEditExpense, requestDeleteExpense,
    confirmDelete, handleRestoreExpense, toggleParticipant, toggleAllParticipants,
  } = useExpenseActions({
    activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError,
    isFirstExpense: activeExpenses.length === 0,
  })

  const handleRestoreTraveler = useCallback((id: number) => {
    if (!user) return
    showToast({ text: 'تم استعادة المسافر إلى القائمة النشطة', type: 'success' })
    updateDoc(travelerDoc(id), { deletedAt: null })
      .catch(err => handleFirestoreError(err, 'تعذر استعادة المسافر.'))
  }, [user, showToast, handleFirestoreError])

  const requestDeleteTraveler = useCallback((traveler: Traveler) => setTravelerToDelete(traveler), [])
  const openDeposit = useCallback((traveler: Traveler) => setDepositModalFor(traveler), [])
  const openDepositHistory = useCallback((traveler: Traveler) => setDepositHistoryFor(traveler), []) 
  
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
      haptic.error()
      setSyncError(`يوجد مسافر بنفس الاسم المختصر "${shortName}"، استخدم اسمًا مختلفًا.`)
      return
    }
    const id = travelers.length ? Math.max(...travelers.map(t => t.id)) + 1 : 1
    const traveler: Traveler = { id, name: newTravelerName.trim(), shortName, deposited: parseFloat(newTravelerDeposit) || 0, deletedAt: null }

    setNewTravelerName('')
    setNewTravelerDeposit('')
    setIsAddingTraveler(false)
    haptic.success()

    if (!user) {
      setTravelers(prev => [...prev, traveler])
      return
    }
    setDoc(travelerDoc(id), traveler)
      .catch(err => handleFirestoreError(err, 'تعذر إضافة المسافر.'))
  }, [newTravelerName, newTravelerDeposit, travelers, activeTravelers, user, setTravelers, handleFirestoreError])

  const confirmDeleteTraveler = useCallback((id: number) => {
    setTravelerToDelete(null)
    haptic.medium()
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

    setDepositModalFor(null); setDepositAmount(''); setDepositMode('add'); setDepositReason('')
    showToast({ text: 'تم تحديث الرصيد', type: 'success' })
    haptic.success()

    if (!user) {
      setTravelers(prev => prev.map(t => t.id === travelerId ? { ...t, deposited: newAmount } : t))
      return
    }

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
    } finally {
      setAuthError(null)
      setIsSendingResetEmail(false)
      setResetCooldownUntil(Date.now() + 60_000)
      showToast({ text: 'إذا كان البريد صحيحًا ومسجّلاً، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.', type: 'success' })
    }
  }, [adminEmail, showToast, isSendingResetEmail, resetCooldownSeconds])

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
    openDepositHistory, 
  }), [
    newExpense, isAddingExpense, editingExpense, isAddingTraveler,
    newTravelerName, newTravelerDeposit,
    openExpenseForm, cancelExpenseForm, handleAddExpense, toggleParticipant, toggleAllParticipants,
    startEditExpense, requestDeleteExpense, startAddTraveler, cancelAddTraveler, handleAddTraveler,
    openDeposit, requestDeleteTraveler, openDepositHistory
  ])

  if (!isAdmin && (pinCheckLoading || needsTripPin)) {
    return <TripGate loading={pinCheckLoading} error={pinError} rateLimitSeconds={rateLimitSeconds} onSubmit={verifyTripPin} />
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
              isOnline={isOnline}
              onStatClick={(stat) => {
                haptic.light()
                const id =
                  stat === 'deposited' ? 'travelers-section' :
                  stat === 'spent'     ? 'expenses-section'  :
                                         'charts-section'
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />

            <PullToRefresh onRefresh={handlePullToRefresh}>
            <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

              <OnboardingBanner />

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

              {/* قسم الأرصدة: زر الإضافة مدمج بالداخل ككارت تزامني منقط بأسفل القائمة */}
              <section id="travelers-section" className="scroll-mt-24">
                <div className="flex justify-between items-center mb-4 px-1">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-slate-500" /> أرصدة المسافرين
                    {!isInitialLoading && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full tabular-nums">
                        {activeTravelers.length}
                      </span>
                    )}
                  </h2>
                </div>

                {!isInitialLoading && activeTravelers.length === 0 && !isAddingTraveler ? (
                  <EmptyState
                    Icon={Users}
                    title="لا يوجد مسافرون بعد"
                    description="أضف المسافرين المشاركين في الرحلة لتتمكّن من توزيع المصاريف وحساب من يدين لمن."
                    actionLabel={isAdmin ? 'إضافة أول مسافر' : undefined}
                    onAction={isAdmin ? startAddTraveler : undefined}
                    ActionIcon={isAdmin ? Plus : undefined}
                  />
                ) : (
                <div className={`grid gap-3 sm:gap-4 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                  {isInitialLoading
                    ? Array.from({ length: 4 }, (_, i) => <TravelerCardSkeleton key={i} />)
                    : balances.map(traveler => (
                        <TravelerCard key={traveler.id} traveler={traveler} />
                      ))
                  }
                  
                  {/* البطاقة المكملة المنقطة بأسفل شبكة كروت المسافرين مع الإصلاح التام للـ Plus */}
                  {isAdmin && !isAddingTraveler && !isInitialLoading && (
                    <button
                      type="button"
                      onClick={startAddTraveler}
                      className="border-2 border-dashed border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 rounded-xl p-4 flex flex-row sm:flex-col items-center justify-center gap-3 text-slate-500 hover:text-teal-600 transition-all shadow-sm bg-slate-50/10 group cursor-pointer min-h-[76px] sm:min-h-[120px]"
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-teal-100 flex items-center justify-center text-slate-600 group-hover:text-teal-700 transition-colors shrink-0 shadow-sm">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold">إضافة مسافر جديد</span>
                    </button>
                  )}
                </div>
                )}

                {/* ظهور نموذج استقبال البيانات المطور تحت الكروت مباشرة عند فتح ميزة الإضافة */}
                {isAddingTraveler && (
                  <AddTravelerForm
                    newTravelerName={newTravelerName}
                    setNewTravelerName={setNewTravelerName}
                    newTravelerDeposit={newTravelerDeposit}
                    setNewTravelerDeposit={setNewTravelerDeposit}
                    onSubmit={handleAddTraveler}
                    cancelAddTraveler={cancelAddTraveler}
                  />
                )}
              </section>

              <div id="charts-section" className="scroll-mt-24">
                {!isInitialLoading && activeExpenses.length > 0 && (
                  <Suspense fallback={<ChartsSectionSkeleton />}>
                    <ChartsSection
                      settlements={settlements}
                      categoryTotals={categoryTotals}
                      spendingTrend={spendingTrend}
                    />
                  </Suspense>
                )}

                {/* حالة فارغة للإحصائيات: بعد إضافة المسافرين وقبل تسجيل أي مصروف */}
                {!isInitialLoading && activeTravelers.length > 0 && activeExpenses.length === 0 && (
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <EmptyState
                      Icon={BarChart3}
                      title="لا توجد إحصائيات بعد"
                      description="سجّل أول مصروف للرحلة لعرض ملخص التسويات وتوزيع المصاريف حسب الفئة وتطوّرها الزمني."
                    />
                  </section>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6 lg:col-span-1">
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <ExpenseForm />
                  </section>
                  <BankDetailsCard bankDetails={bankDetails} />
                </div>

                <div className="lg:col-span-2">
                  <section id="expenses-section" className="scroll-mt-24">
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-4 px-1">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-slate-500" /> سجل المصاريف
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { haptic.light(); setShowReports(true) }}
                          className="flex items-center gap-1.5 text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> التقارير
                        </button>
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
                          onClick={() => exportTripToExcel({ expenses: activeExpenses, travelers: activeTravelers, balances, settlements })} disabled={!activeExpenses.length}
                          className="flex items-center gap-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                        >
                          <Download className="w-3.5 h-3.5" /> تصدير Excel
                        </button>
                      </div>
                    </div>

                   <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                       <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="بحث بالوصف أو المشارك..."
                          className="w-full border border-slate-200 rounded-xl pr-9 ps-3 py-2 text-base focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as unknown as SortOrder)}
                        className="border border-slate-200 rounded-xl px-2 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none"
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
                          <EmptyState
                            Icon={Receipt}
                            title="لا توجد مصاريف بعد"
                            description="ابدأ بتسجيل أول مصروف للرحلة، وسيتولّى التطبيق حساب حصة كل مسافر تلقائياً."
                            actionLabel="سجّل أول مصروف"
                            onAction={() => openExpenseForm()}
                            ActionIcon={Plus}
                          />
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

            <SmartInputBar
                 visible={!isInitialLoading && !isAddingExpense}
                 onQuickAdd={handleQuickAddExpense}
                 onExpand={openExpenseForm} 
             />

            <AnimatePresence>
              {showReports && (
                <Suspense key="reports" fallback={<ModalFallback />}>
                  <ReportsView
                    travelers={activeTravelers}
                    expenses={activeExpenses}
                    balances={balances}
                    settlements={settlements}
                    categoryTotals={categoryTotals}
                    onClose={() => setShowReports(false)}
                  />
                </Suspense>
              )}
            </AnimatePresence>

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