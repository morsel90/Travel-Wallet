import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import * as Sentry from '@sentry/react'
import type { ToastMessage, Traveler } from '../types'
import {
  useAuth, useAdminAuth, useModals, useExchangeRates, useExpenses, useTravelers, useBalances,
  useOnlineStatus, useExpenseActions, useTravelerActions, useDepositActions, useTripConfig,
  useTripAdminActions, useAllTrips, useMyTrips, useMyTripRole, useInviteJoin, useUserProfile,
  useOrganizerBankDetails, useSyncTravelerNameFromProfile, useLongTermActions,
} from './index'
import { useFilteredExpenses } from './useFilteredExpenses'
import { calculateSettlements, calculateCategoryTotals, calculateSpendingTrend } from '../utils/calculations'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID } from '../utils/tripId'
import { acceptsExpenses, closedTripNotice } from '../utils/tripStatus'
import { isLongTerm } from '../utils/tripType'
import { isInPeriod } from '../utils/period'
import { planRollover, describeExitBlock } from '../utils/longTerm'
import { describeWriteError, writeErrorCode } from '../utils/writeErrors'
import { onIdle, preloadAll } from '../utils/preload'
import { chartsImporters } from '../components/ChartsPanel'
import { modalImporters } from '../components/ModalManager'
import { authImporters } from '../components/AuthFlow'
import { tripPickerImporters } from '../components/TripPicker'

// ─── منسّق التطبيق ────────────────────────────────────────────────────────────
//
// كل تركيب الخطافات وما يُشتق منها، في مكان واحد. App.tsx بعده تركيب مرئي خالص.
//
// ⚠️ ما لا يعيش هنا عمداً:
//   • مخزن الرحلة (data/actions/form) → store/TripStoreProvider.tsx، لأن
//     الفصل بينها حسب التقلّب حِمل أداء يجب أن يُقرأ في ملف واحد بالعين
//     المجرّدة.
//   • قرار أي شاشة تُعرض → App.tsx، فذلك توجيه لا تركيب.
//
// ⚠️ الترتيب داخل هذه الدالة ليس اعتباطياً: عدة خطافات تستهلك ناتج ما قبلها
// (hasAccess قبل useExpenses، activeTravelers قبل useExpenseActions...). لا
// تُعِد ترتيبها لأغراض تجميلية.

// 🆕 كل الأجزاء المؤجّلة في التطبيق، للتحميل المسبق الهادئ بعد أول عرض.
// كل مالك جزء مؤجّل يُصدّر مستورداته بنفسه، فمن يضيف جزءاً يضيفه في ملفه.
const LAZY_IMPORTERS = [...chartsImporters, ...modalImporters, ...authImporters, ...tripPickerImporters]

export function useAppCoordinator() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const {
    user, isAdmin, authLoading, joinedTripIds,
    signInError, isSigningIn, signInWithGoogle, signInWithEmail,
  } = useAuth()
  const isOnline = useOnlineStatus()
  // 🆕 بروفايل المستخدم العام (اسم/بنك) — يُدار من شاشة بروفايل منفصلة
  // (ModalManager). هو المصدر الوحيد لبيانات بنك أي رحلة ينظّمها هذا المستخدم
  // (انظر useOrganizerBankDetails أدناه). لا يحتاج hasAccess: مستقل عن أي
  // رحلة، ومتاح لأي مستخدم مسجّل دخوله حتى قبل الانضمام لأي رحلة.
  const profile = useUserProfile(user)
  // 🆕 لا رمز رحلة بعد الآن — الوصول عضوية مباشرة (claim) أو صلاحية مسؤول
  // عالمية، بلا خطوة تحقّق وسيطة. انظر docs/DECISIONS.md.
  const hasAccess = isAdmin || (!authLoading && joinedTripIds.includes(TRIP_ID))

  // 🆕 شاشة «رحلاتي» — تُعرض حين يُفتح التطبيق بلا `?trip=`، أي بلا رحلة مقصودة.
  const [showTripPicker, setShowTripPicker] = useState(false)
  const { trips: myTrips, loading: myTripsLoading, error: myTripsError } = useMyTrips(joinedTripIds, user)

  const { ratesUpdatedAt, CURRENCIES } = useExchangeRates()
  const { expenses,  setExpenses,  expensesLoaded,  refreshExpenses }  = useExpenses(hasAccess ? user : null, { setIsSyncing, setSyncError })
  const { travelers, setTravelers, travelersLoaded, refreshTravelers } = useTravelers(hasAccess ? user : null, setIsSyncing)
  // organizerUid للبطاقة البنكية، والمسار للويدجت والتقارير. 🆕 tripName وبقية
  // الحقول تُستهلك أيضاً في pickerTrips أدناه — صفّ الرحلة المفتوحة حالياً في
  // «رحلاتي» يعرض هذه النسخة الحيّة بدل لقطة myTrips الثابتة.
  const {
    tripName, organizerUid, itinerary, status: tripStatus, statusChangedAt,
    tripType, currentPeriod, lastClosedPeriod,
  } = useTripConfig(hasAccess ? user : null)
  // 🆕 قراءة حيّة لبيانات بنك منظّم *هذه* الرحلة — المصدر الوحيد المعروض في
  // BankDetailsCard. organizerUid قد يكون undefined (رحلة قديمة بلا منظّم
  // معروف)، وuseOrganizerBankDetails تتعامل مع ذلك بحالة فارغة فوراً بلا اشتراك.
  const organizerBank = useOrganizerBankDetails(organizerUid)

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

  // 🆕 يُصلح اسم مسافري تلقائياً إن اختلف عن بروفايلي — بديل ربط حيّ (كبيانات
  // البنك) اخترناه لتفادي اشتراك منفصل لكل مسافر مربوط بحساب في كل مكان يُعرض
  // فيه اسمه. انظر تعليق الملف. لا شيء يُعرض بسببه — صامت بالكامل.
  useSyncTravelerNameFromProfile(TRIP_ID, hasAccess ? user : null, activeTravelers, profile.profile.displayName)

  const { balances, totalSpent, totalDeposited, totalRemaining } = useBalances(activeTravelers, activeExpenses)

  // 🆕 نموذج الهوية الهجين — بطاقة المستخدم نفسه (إن وُجدت) أولاً في قائمة
  // العرض. ⚠️ لا تُعاد ترتيب `balances` نفسها: تُستهلك في حساب التسويات
  // (calculateSettlements لا يهمّها الترتيب) وتصدير Excel وطباعة تقرير الرحلة
  // (ترتيبها هناك تاريخي/حسب Firestore، وإعادة ترتيبه أثر جانبي غير مقصود على
  // مسارات لا علاقة لها بهذه الميزة). القائمة المُعاد ترتيبها لعرض
  // TravelersPanel وحدها.
  const myBalance = useMemo(
    () => (user ? balances.find(b => b.uid === user.uid) ?? null : null),
    [balances, user],
  )
  const travelersPanelBalances = useMemo(
    () => (myBalance ? [myBalance, ...balances.filter(b => b !== myBalance)] : balances),
    [balances, myBalance],
  )

  // ─── 🆕 الرحلات طويلة المدى ───────────────────────────────────────────────
  //
  // ⚠️ كل ما يلي **مشتق من `balances` القائمة أصلاً** — لا حساب مالي جديد على
  // العميل، ولا مصدر رقم ثانٍ يمكن أن ينحرف عن الأول. وهذا ممكن لأن الدفتر
  // تراكمي: الإغلاق يُصفّر الشهر ويعيد فتحه بنفس القيمة، فالرصيد التراكمي *هو*
  // رصيد الشهر الجاري في رحلة تُغلق شهورها بانتظام (انظر utils/longTerm.ts).
  const isLongTermTrip = isLongTerm(tripType)

  // منظّم الرحلة أو المسؤول — نفس الحدّ الذي تفرضه callerManagesTrip خادمياً.
  const canManageLongTerm = isLongTermTrip && (isAdmin || isOrganizer)

  const periodExpenses = useMemo(
    () => (isLongTermTrip ? activeExpenses.filter(e => isInPeriod(e.date, currentPeriod)) : []),
    [isLongTermTrip, activeExpenses, currentPeriod],
  )
  const periodTotal = useMemo(
    () => periodExpenses.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0),
    [periodExpenses],
  )
  const rolloverPlan = useMemo(
    () => (isLongTermTrip ? planRollover(balances) : []),
    [isLongTermTrip, balances],
  )

  /**
   * 🆕 حارس خروج العضو — يُمرَّر إلى useTravelerActions **فقط في الرحلة
   * الطويلة**، فمسار الرحلة القياسية لا يستقبل شيئاً ولا يتغيّر بحرف.
   */
  const describeExitBlockFor = useMemo(() => {
    if (!isLongTermTrip) return undefined
    return (travelerId: number): string | null => {
      const target = balances.find(b => b.id === travelerId)
      if (!target) return null
      return describeExitBlock(tripType, target.name, target.remaining)
    }
  }, [isLongTermTrip, balances, tripType])

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

  // 🆕 رابط دعوة بنقرة واحدة (?invite=TOKEN) — يُستهلك مرة واحدة عند تحميل
  // الصفحة، قبل أي شيء آخر. النجاح إعادة توجيه كاملة (لا حالة تُستهلك هنا)،
  // والفشل يُنظّف الرابط ويعرض توستاً ثم يُكمل التدفّق المعتاد (رحلاتي/بوابة الرمز).
  const inviteJoin = useInviteJoin(user, showToast)

  const admin = useAdminAuth({ showToast })

  // 🆕 يعتمد على كود خطأ Firestore لا على البحث في نص الرسالة: النص غير موثوق
  // (يتغيّر بين إصدارات SDK وقد يكون مترجَماً)، والكود ثابت ومحدَّد.
  // fallback يُستخدم فقط حين لا يكون الخطأ من Firestore أصلاً — انظر utils/writeErrors.ts.
  const handleFirestoreError = useCallback((err: unknown, fallback: string) => {
    const code = writeErrorCode(err)
    Sentry.captureException(err, { tags: { source: 'firestore-write' } })
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
    describeExitBlockFor,
  })

  const deposit = useDepositActions({
    depositTraveler, user, setTravelers, showToast, handleFirestoreError,
    closeModal: modals.closeModal,
  })

  // إدارة الرحلات — لا نشترك في قائمة الرحلات إلا للمسؤول: استعلام القائمة على
  // trips/ يرضيه isAdmin() وحده، فطلبه لعضو عادي مجرّد خطأ صلاحيات في الكونسول.
  const { trips, loading: tripsLoading, error: tripsError } = useAllTrips(isAdmin)

  // منظّم لا يستطيع استعلام trips/ (isAdmin() وحده يرضيه)، فبدل ذلك نبني
  // ملخّص رحلته الوحيدة من useTripConfig — وهو أصلاً حيّ (onSnapshot) ومسموح
  // له بقراءته (isMember). 🆕 يُستهلك الآن من قِبل المسؤول أيضاً — كلاهما يعدّل
  // فقط عبر اسم الرحلة في الهيدر (Header.tsx)، أي الرحلة المفتوحة حالياً حصراً
  // (انظر tripEdit أدناه وcomponents/modals/EditTripModal.tsx).
  const organizerTripId = isOrganizer ? TRIP_ID : null
  const currentTripSummary = useMemo(() => ({
    id: TRIP_ID,
    name: tripName ?? TRIP_ID,
    organizerUid,
    itinerary: itinerary ?? [],
    status: tripStatus,
    statusChangedAt,
  }), [tripName, organizerUid, itinerary, tripStatus, statusChangedAt])

  const tripAdmin = useTripAdminActions({ isAdmin, organizerTripId, showToast, handleFirestoreError })

  // 🆕 استدعاءات الرحلة الطويلة (closeMonth/exitTraveler) — لا كتابة Firestore
  // هنا إطلاقاً؛ انظر تعليق الملف في hooks/useLongTermActions.ts.
  const longTermActions = useLongTermActions({ showToast, handleFirestoreError })

  const confirmRollover = useCallback(async () => {
    const result = await longTermActions.closeMonth(TRIP_ID, currentPeriod)
    // المودال يُغلق عند النجاح وحده: الفشل يترك المنظّم أمام نفس الشاشة مع
    // رسالة السبب، بدل أن تختفي الشاشة ويبقى هو في حيرة مما جرى.
    if (result) modals.closeModal()
  }, [longTermActions, currentPeriod, modals])

  /**
   * 🆕 نقطة دخول واحدة لإخراج عضو، تتفرّع بحسب نوع الرحلة.
   *
   * ⚠️ وُجدت هذه الدالة لأن أول تنفيذ ترك **طريقاً مسدوداً**: بطاقة المسافر
   * (المكان الذي يقصده المستخدم بالعادة) كانت تفتح تأكيد الحذف المعتاد، فيمنعه
   * الحارس برسالة «سوِّ حسابه أولاً» تشير إلى زرّ في قسم آخر — رسالة تقول «لا»
   * ولا تأخذك إلى «نعم». رصده المالك فوراً بسؤاله «أين حذف مسافر أراد المغادرة؟».
   *
   * الآن نفس البطاقة تفتح نافذة «تسوية وخروج» مباشرةً في الرحلة الطويلة. وحارس
   * describeExitBlockFor يبقى في useTravelerActions كشبكة أمان لأي مسار آخر
   * يستدعي confirmDeleteTraveler — لم يُحذف، لأنه لم يكن خطأً، بل ناقصاً.
   */
  const requestDeleteTraveler = useCallback((target: Traveler) => {
    if (!isLongTermTrip) {
      modals.openDeleteTraveler(target)
      return
    }
    // الرصيد لازم لنافذة الخروج (تعرض المبلغ والاتجاه). غيابه من balances
    // يعني مسافراً لم يُحسب بعد — نمرّره برصيد صفر فتتصرّف النافذة كحساب مسوّى،
    // والخادم يبقى الحكم الفعلي على أي حال.
    const withBalance = balances.find(b => b.id === target.id)
    modals.openExitTraveler(withBalance ?? { ...target, totalExpenses: 0, remaining: 0 })
  }, [isLongTermTrip, balances, modals])

  const confirmExitTraveler = useCallback(async (travelerId: number, settle: boolean) => {
    const ok = await longTermActions.exitTraveler(TRIP_ID, travelerId, settle)
    if (ok) modals.closeModal()
  }, [longTermActions, modals])

  // ─── شاشة «رحلاتي» ────────────────────────────────────────────────────────
  // 🆕 المسؤول يرى كل الرحلات (استعلام القائمة يرضيه isAdmin وحده)، والعضو
  // العادي يرى ما انضم له فقط. بدون هذا التفريق كانت الشاشة تختفي عن المسؤول
  // تماماً: هو يتجاوز رمز الرحلة أصلاً فقد لا يملك خريطة trips في توكنه إطلاقاً.
  // 🆕 المؤرشفة تُخفى من القائمة — هذا هو الفرق العملي الوحيد بينها وبين
  // المنتهية. تبقى الرحلة المفتوحة حالياً ظاهرة دائماً ولو كانت مؤرشفة، وإلا
  // اختفت من تحت المستخدم بينما هو داخلها.
  //
  // ⚠️ للتنقّل المحض فقط (فتح/إنشاء/استعادة) — لا تعديل من هنا. تعديل أي رحلة
  // يمرّ عبر اسمها في الهيدر بعد فتحها (انظر tripEdit أدناه).
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
  // ⚠️ لا نشترط عضوية الرحلة الافتراضية هنا: كان ذلك يخفي الشاشة عن كل عضو في
  // الرحلة الافتراضية (وهم الأغلبية)، فلا يراها أحد عملياً — القاعدة ١٧.
  //
  // 🆕 ولا نشترط pickerTrips.length > 0 بعد الآن: قبل الإنشاء الذاتي كانت
  // شاشة فارغة عديمة الفائدة لعضو بلا أي رحلة (0 عناصر، لا فعل ممكن)، فسقط
  // للمسار الأعمّ (NotAMemberScreen). أما الآن فحالتها الفارغة نفسها تحمل زرّ
  // «إنشاء رحلة جديدة» — وهذا بالضبط أول مكان يحتاجه عضو جديد لا رحلة له
  // إطلاقاً، فإخفاؤها عنه بالذات كان يقفل الباب الوحيد الذي فتحته هذه الميزة.
  const isPickerVisible =
    showTripPicker ||
    (!HAS_EXPLICIT_TRIP_ID && !authLoading && !pickerLoading)

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

  return {
    /** 🆕 رابط دعوة بنقرة واحدة — App.tsx يعرض InviteJoinScreen طالما 'joining' أو 'needsName'. */
    invite: inviteJoin,
    /** المصادقة والوصول وحالة الشبكة. */
    session: {
      user, isAdmin, hasAccess, isOnline,
      authLoading, joinedTripIds,
      // 🆕 لا PIN بعد الآن — تسجيل الدخول (AuthGate) هو الحارس الوحيد المتبقي.
      signInError, isSigningIn, signInWithGoogle, signInWithEmail,
      // 🆕 منظّم الرحلة الحالية (لا مسؤول عالمي) — يُستهلك في canManageLongTerm
      // أدناه، وفي AccountMenu لإخفاء زرّ «تسجيل الدخول كمسؤول» عمّن لا يحتاجه
      // أصلاً (منظّم يدير رحلته من «رحلاتي» مباشرة، لا من حساب مسؤول منفصل).
      isOrganizer,
    },
    /** الأرقام المشتقّة — مدخلات كل ما يُعرض ويُصدَّر. */
    ledger: {
      isInitialLoading,
      activeExpenses, activeTravelers, deletedExpenses, deletedTravelers,
      balances, totalSpent, totalDeposited, totalRemaining,
      settlements, categoryTotals, spendingTrend,
      // 🆕 نموذج الهوية الهجين — بطاقتك مثبَّتة أولاً هنا (انظر myBalance
      // وتعليقه أعلاه) — هذا وحده كافٍ الآن، بلا بطاقة ملخّص منفصلة فوقها
      // (MyBalanceBanner، حُذفت — كانت تكرر نفس الرقم بلا معلومة جديدة).
      travelersPanelBalances,
    },
    /** إعدادات الرحلة الحالية ودورة حياتها. */
    // 🆕 `name` مكشوف هنا الآن — الهيدر يعرض اسم الرحلة المفتوحة بدل اسم
    // التطبيق الثابت. القيمة نفسها المستخدَمة في صفّ الرحلة المفتوحة داخل
    // pickerTrips أعلاه، لا مصدر ثانٍ يمكن أن ينحرف عنه.
    trip: { name: tripName ?? TRIP_ID, itinerary, canAddExpenses, tripClosedNotice, tripType },
    /**
     * 🆕 كل ما تحتاجه واجهة الرحلة الطويلة — **null في الرحلة القياسية**.
     * قيمة واحدة تُفحص في App.tsx (`longTerm && …`) بدل شروط متفرّقة، وهو ما
     * يجعل «الرحلة القياسية لا تتأثر» حقيقةً بنيوية لا وعداً في تعليق.
     */
    longTerm: isLongTermTrip ? {
      period: currentPeriod,
      lastClosedPeriod,
      periodTotal,
      periodCount: periodExpenses.length,
      movements: rolloverPlan,
      canManage: canManageLongTerm,
      isClosingMonth: longTermActions.isClosingMonth,
      isExitingTraveler: longTermActions.isExitingTraveler,
      organizerUid,
      openRollover: modals.openMonthlyRollover,
      onConfirmRollover: confirmRollover,
      onConfirmExit: confirmExitTraveler,
    } : null,
    /** 🆕 بيانات بنك منظّم الرحلة الحالية — حيّة من users/{organizerUid}. */
    organizerBank,
    /** أسعار الصرف الحيّة — تُقرأ من DataContext في نموذج المصروف. */
    rates: { currencies: CURRENCIES, ratesUpdatedAt },
    /** حالة المزامنة والتنبيهات. */
    status: {
      isSyncing, syncError, toast, handlePullToRefresh, hasUnsavedData,
      // 🆕 مُصدَّرة لاستخدامها خارج هذا الملف عند الحاجة إلى توست من مكوّن لا
      // يملك مساراً خادمياً خاصاً به يُطلقه بنفسه (مثال: نسخ رابط دعوة احتياطياً
      // حين لا يدعم الجهاز Web Share API — انظر TripDetailPanel.tsx).
      showToast,
    },
    /** شاشة «رحلاتي» — تنقّل بحت (فتح/إنشاء/استعادة)، بلا تعديل من القائمة. */
    picker: {
      trips: pickerTrips, loading: pickerLoading, error: pickerError,
      isVisible: isPickerVisible,
      show: () => setShowTripPicker(true),
      // 🆕 الإنشاء الذاتي (نموذج واتساب) — أي مستخدم مسجّل دخوله، لا المسؤول
      // فقط. نفس دالة tripAdmin.createTrip المستخدمة في تعديل الرحلة؛ الحدّ
      // الحقيقي (جلسة حقيقية، حدّ زمني) خادمي بالكامل في manageTrip.
      onCreateTrip: tripAdmin.createTrip,
      // 🆕 يظهر معرّف كل رحلة تحت اسمها (المسؤول يتصفّح رحلات لا يعرفها
      // بالاسم فقط)، ويتيح تبويب «استعادة من نسخة احتياطية» عند الإنشاء.
      isAdmin,
      isSaving: tripAdmin.isSaving,
      onRestoreTrip: tripAdmin.restoreTrip,
    },
    /**
     * 🆕 تعديل الرحلة *المفتوحة حالياً* — يُفتح بالضغط على اسمها في الهيدر
     * (Header.tsx)، لا من قائمة «رحلاتي». لتعديل رحلة أخرى يفتحها المستخدم
     * أولاً من «رحلاتي» (المسؤول يرى كل الرحلات هناك ويمكنه الدخول لأيّ منها)
     * ثم يعدّلها من هنا بعد أن تصبح هي المفتوحة. انظر docs/DECISIONS.md.
     */
    tripEdit: {
      canEdit: isAdmin || isOrganizer,
      trip: currentTripSummary,
      viewerRole: isAdmin ? 'admin' as const : 'organizer' as const,
      isSaving: tripAdmin.isSaving,
      onSaveTripName: tripAdmin.saveTripName,
      onSaveItinerary: tripAdmin.saveItinerary,
      onSaveTripStatus: tripAdmin.saveTripStatus,
      onDeleteTrip: tripAdmin.deleteTrip,
      onRemoveMember: tripAdmin.removeMember,
      onSetMemberRole: tripAdmin.setMemberRole,
      onLinkTravelerAccount: tripAdmin.linkTravelerAccount,
      onExportBackup: tripAdmin.exportBackup,
      onCreateInvite: tripAdmin.createInvite,
      onRevokeInvite: tripAdmin.revokeInvite,
    },
    /** 🆕 بروفايل المستخدم العام — لشاشة البروفايل، وهو مصدر بيانات البنك
     * الوحيد لأي رحلة ينظّمها هذا المستخدم (انظر organizerBank أعلاه). */
    profile: profile.profile,
    isSavingProfile: profile.isSaving,
    saveProfile: profile.saveProfile,
    filter,
    modals,
    /**
     * 🆕 يُمرَّر إلى TripStoreProvider بدل modals.openDeleteTraveler مباشرةً —
     * انظر تعليق الدالة أعلاه. الرحلة القياسية تصل لنفس المودال السابق حرفياً.
     */
    requestDeleteTraveler,
    expense,
    traveler,
    deposit,
    admin,
  }
}
