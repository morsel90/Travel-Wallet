import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { ToastMessage } from '../types'
import {
  useAuth, useAdminAuth, useModals, useExchangeRates, useExpenses, useTravelers, useBalances,
  useOnlineStatus, useExpenseActions, useTravelerActions, useDepositActions, useTripConfig,
  useTripAdminActions, useAllTrips, useMyTrips, useMyTripRole,
} from './index'
import { useFilteredExpenses } from './useFilteredExpenses'
import { calculateSettlements, calculateCategoryTotals, calculateSpendingTrend } from '../utils/calculations'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID } from '../utils/tripId'
import { acceptsExpenses, closedTripNotice } from '../utils/tripStatus'
import { describeWriteError, writeErrorCode } from '../utils/writeErrors'
import { onIdle, preloadAll } from '../utils/preload'
import { consumeUidChangedNotice } from '../utils/mergeNotice'
import { chartsImporters } from '../components/ChartsPanel'
import { modalImporters } from '../components/ModalManager'
import { authImporters } from '../components/AuthFlow'

// ─── منسّق التطبيق ────────────────────────────────────────────────────────────
//
// كل تركيب الخطافات وما يُشتق منها، في مكان واحد. App.tsx بعده تركيب مرئي خالص.
//
// ⚠️ ما لا يعيش هنا عمداً:
//   • قيم السياق الثلاث → components/AppProviders.tsx، لأن الفصل بينها حسب
//     التقلّب حِمل أداء يجب أن يُقرأ في ملف واحد بالعين المجرّدة.
//   • قرار أي شاشة تُعرض → App.tsx، فذلك توجيه لا تركيب.
//
// ⚠️ الترتيب داخل هذه الدالة ليس اعتباطياً: عدة خطافات تستهلك ناتج ما قبلها
// (hasAccess قبل useExpenses، activeTravelers قبل useExpenseActions...). لا
// تُعِد ترتيبها لأغراض تجميلية.

// 🆕 كل الأجزاء المؤجّلة في التطبيق، للتحميل المسبق الهادئ بعد أول عرض.
// كل مالك جزء مؤجّل يُصدّر مستورداته بنفسه، فمن يضيف جزءاً يضيفه في ملفه.
const LAZY_IMPORTERS = [...chartsImporters, ...modalImporters, ...authImporters]

export function useAppCoordinator() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const { user, isAdmin, needsTripPin, pinCheckLoading, pinError, rateLimitSeconds, verifyTripPin, joinedTripIds } = useAuth()
  const isOnline = useOnlineStatus()
  const hasAccess = isAdmin || (!pinCheckLoading && !needsTripPin)

  // 🆕 شاشة «رحلاتي» — تُعرض حين يُفتح التطبيق بلا `?trip=`، أي بلا رحلة مقصودة.
  const [showTripPicker, setShowTripPicker] = useState(false)
  const { trips: myTrips, loading: myTripsLoading, error: myTripsError } = useMyTrips(joinedTripIds, user)

  const { ratesUpdatedAt, CURRENCIES } = useExchangeRates()
  const { expenses,  setExpenses,  expensesLoaded,  refreshExpenses }  = useExpenses(hasAccess ? user : null, { setIsSyncing, setSyncError })
  const { travelers, setTravelers, travelersLoaded, refreshTravelers } = useTravelers(hasAccess ? user : null, setIsSyncing)
  // اسم الرحلة يُحرَّر من واجهة إدارة الرحلات (التي تقرأه من useAllTrips)، فلا
  // تحتاجه هذه الشاشة — تفاصيل البنك للبطاقة، والمسار للويدجت والتقارير.
  // 🆕 tripName يُقرأ هنا أيضاً الآن — منظّم الرحلة (المرحلة ٣) يحتاجه لبناء
  // ملخّص رحلته الوحيدة بلا استعلام قائمة (انظر organizerTripSummary أدناه).
  const { tripName, bankDetails, itinerary, status: tripStatus } = useTripConfig(hasAccess ? user : null)

  // 🆕 المرحلة ٣ — «هل أنا منظّم هذه الرحلة؟» قراءة ذاتية واحدة، لا تُستهلك
  // إلا حين لا يكون المستخدم مسؤولاً عالمياً أصلاً (المسؤول يرى كل شيء بلا هذا).
  const isOrganizer = useMyTripRole(TRIP_ID, !isAdmin && hasAccess ? user : null)

  // 🆕 دورة حياة الرحلة. ⚠️ هذه إخفاء وتفسير فقط — الحماية الحقيقية في
  // firestore.rules (tripAcceptsExpenses/tripAcceptsWrites). الغرض ألا يضغط
  // المستخدم زراً سترفضه القواعد بخطأ صلاحيات غامض.
  const canAddExpenses = acceptsExpenses(tripStatus)
  const tripClosedNotice = closedTripNotice(tripStatus)

  const isInitialLoading = !expensesLoaded || !travelersLoaded

  const activeExpenses = useMemo(() => expenses.filter(e => !e.deletedAt), [expenses])
  const activeTravelers = useMemo(() => travelers.filter(t => !t.deletedAt), [travelers])

  const deletedExpenses = useMemo(() => expenses.filter(e => e.deletedAt), [expenses])
  const deletedTravelers = useMemo(() => travelers.filter(t => t.deletedAt), [travelers])

  const { balances, totalSpent, totalDeposited, totalRemaining } = useBalances(activeTravelers, activeExpenses)

  const settlements    = useMemo(() => calculateSettlements(balances), [balances])
  const categoryTotals = useMemo(() => calculateCategoryTotals(activeExpenses), [activeExpenses])
  const spendingTrend  = useMemo(() => calculateSpendingTrend(activeExpenses), [activeExpenses])

  const filter = useFilteredExpenses(activeExpenses, activeTravelers)

  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const modals = useModals()
  const depositTraveler = modals.modal.type === 'deposit' ? modals.modal.traveler : null

  const showToast = useCallback((msg: ToastMessage, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    if (durationMs !== Infinity) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), durationMs)
    }
  }, [])

  const admin = useAdminAuth({ showToast })

  // 🆕 يعتمد على كود خطأ Firestore لا على البحث في نص الرسالة: النص غير موثوق
  // (يتغيّر بين إصدارات SDK وقد يكون مترجَماً)، والكود ثابت ومحدَّد.
  // fallback يُستخدم فقط حين لا يكون الخطأ من Firestore أصلاً — انظر utils/writeErrors.ts.
  const handleFirestoreError = useCallback((err: unknown, fallback: string) => {
    const code = writeErrorCode(err)
    setSyncError(code ? describeWriteError(err, 'generic').text : fallback)
  }, [])

  const handlePullToRefresh = useCallback(async () => {
    try {
      await Promise.all([refreshExpenses(), refreshTravelers()])
    } catch (err) {
      handleFirestoreError(err, 'تعذر تحديث البيانات — تحقّق من اتصالك وحاول مجدداً.')
    }
  }, [refreshExpenses, refreshTravelers, handleFirestoreError])

  const expense = useExpenseActions({
    activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError,
    isFirstExpense: activeExpenses.length === 0,
  })

  const traveler = useTravelerActions({
    travelers, activeTravelers, user, setTravelers, showToast, handleFirestoreError, setSyncError,
    closeModal: modals.closeModal,
  })

  const deposit = useDepositActions({
    depositTraveler, user, setTravelers, showToast, handleFirestoreError,
    closeModal: modals.closeModal,
  })

  // إدارة الرحلات — لا نشترك في قائمة الرحلات إلا للمسؤول: استعلام القائمة على
  // trips/ يرضيه isAdmin() وحده، فطلبه لعضو عادي مجرّد خطأ صلاحيات في الكونسول.
  const { trips, loading: tripsLoading, error: tripsError } = useAllTrips(isAdmin)

  // 🆕 المرحلة ٣: منظّم لا يستطيع استعلام trips/ (isAdmin() وحده يرضيه)، فبدل
  // ذلك نبني ملخّص رحلته الوحيدة من useTripConfig — وهو أصلاً حيّ (onSnapshot)
  // ومسموح له بقراءته (isMember). هذا ما يضمن ألا يرى منظّم رحلة أخرى إطلاقاً:
  // القائمة التي تفتحها TripAdminView تحوي عنصراً واحداً بنيوياً، لا بفلترة.
  const organizerTripId = isOrganizer ? TRIP_ID : null
  const organizerTripSummary = useMemo(() => ({
    id: TRIP_ID,
    name: tripName ?? TRIP_ID,
    bankDetails,
    itinerary: itinerary ?? [],
    status: tripStatus,
  }), [tripName, bankDetails, itinerary, tripStatus])

  const tripAdmin = useTripAdminActions({ isAdmin, organizerTripId, showToast, handleFirestoreError })

  // ─── شاشة «رحلاتي» ────────────────────────────────────────────────────────
  // 🆕 المسؤول يرى كل الرحلات (استعلام القائمة يرضيه isAdmin وحده)، والعضو
  // العادي يرى ما انضم له فقط. بدون هذا التفريق كانت الشاشة تختفي عن المسؤول
  // تماماً: هو يتجاوز رمز الرحلة أصلاً فقد لا يملك خريطة trips في توكنه إطلاقاً.
  // 🆕 المؤرشفة تُخفى من القائمة — هذا هو الفرق العملي الوحيد بينها وبين
  // المنتهية. تبقى الرحلة المفتوحة حالياً ظاهرة دائماً ولو كانت مؤرشفة، وإلا
  // اختفت من تحت المستخدم بينما هو داخلها.
  const pickerTrips = useMemo(() => {
    const source = isAdmin ? trips.map(t => ({ id: t.id, name: t.name, status: t.status })) : myTrips
    return source.filter(t => t.status !== 'archived' || t.id === TRIP_ID)
  }, [isAdmin, trips, myTrips])
  const pickerLoading = isAdmin ? tripsLoading : myTripsLoading
  const pickerError   = isAdmin ? tripsError   : myTripsError

  // تُعرض حين فُتح التطبيق بلا `?trip=` — أي بلا رحلة مقصودة — أو حين طلبها
  // المستخدم صراحةً من الهيدر. اختيار رحلة ينقل إلى `?trip=X` فيصبح المعرّف
  // صريحاً ولا تظهر الشاشة مجدداً.
  //
  // ⚠️ لا نشترط needsTripPin هنا: كان ذلك يخفي الشاشة عن كل عضو في الرحلة
  // الافتراضية (وهم الأغلبية) لأنه لا يُطالَب برمز أصلاً، فلا يراها أحد عملياً.
  const isPickerVisible =
    showTripPicker ||
    (!HAS_EXPLICIT_TRIP_ID && !pinCheckLoading && !pickerLoading && pickerTrips.length > 0)

  const hasUnsavedData = useCallback(() => {
    const hasExpenseData = expense.isAddingExpense && (
      expense.newExpense.description.trim() !== '' ||
      expense.newExpense.amount !== '' ||
      expense.newExpense.currency !== 'SAR' ||
      expense.newExpense.exchangeRate !== '1'
    )
    const hasTravelerData = traveler.isAddingTraveler && (
      traveler.newTravelerName.trim() !== '' ||
      traveler.newTravelerDeposit !== ''
    )
    const hasDepositData = depositTraveler !== null && deposit.depositAmount !== ''
    return hasExpenseData || hasTravelerData || hasDepositData
  }, [
    expense.isAddingExpense, expense.newExpense,
    traveler.isAddingTraveler, traveler.newTravelerName, traveler.newTravelerDeposit,
    depositTraveler, deposit.depositAmount,
  ])

  // 🆕 سحب الأجزاء المؤجّلة بهدوء بعد أن يصبح التطبيق تفاعلياً، حتى تكون حاضرة
  // إن انقطع الاتصال لاحقاً. لولا هذا، أول مصروف يُسجَّل في رحلة أثناء الانقطاع
  // يستدعي ChartsSection لأول مرة فيفشل استيرادها وتنهار الواجهة إلى
  // ErrorBoundary (كشفه اختبار E2E فعلياً — انظر utils/preload.ts).
  //
  // ⚠️ موضعه هنا يضمن أنه يسبق أي `return` مشروط في App (قواعد الـ Hooks) —
  // وهذا سبب إضافي لبقاء التوجيه في App والتركيب هنا.
  // ولا نسحب شيئاً قبل ثبوت الوصول: لا معنى لتحميل مودالات لمن لم يجتز البوابة.
  useEffect(() => {
    if (!hasAccess) return
    return onIdle(() => preloadAll(LAZY_IMPORTERS))
  }, [hasAccess])

  // 🆕 إعادة التحميل التي يفرضها useAccountLink بعد دمج حساب لا تترك وقتاً
  // لعرض توست هناك (الصفحة تُعاد فوراً) — فنقرأ العلم هنا بعد التحميل التالي.
  // consumeUidChangedNotice تُعيد true مرة واحدة فقط ثم تحذف العلم، فتكرار هذا
  // الأثر عند كل إعادة رسم غير ضار (المرات اللاحقة تُعيد false بصمت).
  useEffect(() => {
    if (!hasAccess) return
    if (consumeUidChangedNotice()) {
      showToast({
        text: 'تم ربط حسابك ونُقلت رحلاتك. مصاريف سجّلتَها قبل الربط ستبقى ظاهرة، لكن لن تستطيع تعديلها أو حذفها بنفسك بعد الآن — المسؤول وحده يستطيع ذلك.',
        type: 'success',
      }, 8000)
    }
  }, [hasAccess, showToast])

  return {
    /** المصادقة والوصول وحالة الشبكة. */
    session: {
      user, isAdmin, hasAccess, isOnline,
      needsTripPin, pinCheckLoading, pinError, rateLimitSeconds, verifyTripPin, joinedTripIds,
      // 🆕 جلسة مجهولة = العضويات مرتبطة بهذا المتصفح وحده. تُستهلك في
      // TripPicker لعرض شريط ترقية الحساب. المسؤول ليس مجهولاً أصلاً.
      isAnonymous: user?.isAnonymous === true,
      // 🆕 المرحلة ٣: منظّم الرحلة الحالية (لا رحلة أخرى — انظر organizerTripId
      // أعلاه). يُستهلك لإظهار زر «إدارة الرحلة» في ExpensesPanel لمن ليس
      // مسؤولاً عالمياً لكنه منظّم.
      isOrganizer,
    },
    /** الأرقام المشتقّة — مدخلات كل ما يُعرض ويُصدَّر. */
    ledger: {
      isInitialLoading,
      activeExpenses, activeTravelers, deletedExpenses, deletedTravelers,
      balances, totalSpent, totalDeposited, totalRemaining,
      settlements, categoryTotals, spendingTrend,
    },
    /** إعدادات الرحلة الحالية ودورة حياتها. */
    trip: { bankDetails, itinerary, canAddExpenses, tripClosedNotice },
    /** أسعار الصرف الحيّة — تُقرأ من DataContext في نموذج المصروف. */
    rates: { currencies: CURRENCIES, ratesUpdatedAt },
    /** حالة المزامنة والتنبيهات. */
    status: { isSyncing, syncError, toast, handlePullToRefresh, hasUnsavedData },
    /** شاشة «رحلاتي». */
    picker: {
      trips: pickerTrips, loading: pickerLoading, error: pickerError,
      isVisible: isPickerVisible, wasOpenedManually: showTripPicker,
      show: () => setShowTripPicker(true),
      hide: () => setShowTripPicker(false),
    },
    /**
     * 🆕 قائمة الرحلات القابلة للإدارة + كتاباتها. للمسؤول: كل الرحلات
     * (useAllTrips، استعلام قائمة). لمنظّم: رحلته الوحيدة بنيوياً — لا فلترة
     * على قائمة أكبر، فلا سبيل له لرؤية رحلة أخرى من هنا أصلاً.
     */
    tripAdminPanel: {
      trips: isAdmin ? trips : (isOrganizer ? [organizerTripSummary] : []),
      loading: isAdmin ? tripsLoading : false,
      error: isAdmin ? tripsError : null,
      viewerRole: isAdmin ? 'admin' as const : 'organizer' as const,
      ...tripAdmin,
    },
    filter,
    modals,
    expense,
    traveler,
    deposit,
    admin,
  }
}
