import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react'
import type { User } from 'firebase/auth'
import type { ToastMessage, Traveler, Settlement } from '../types'
import type { TripConfig } from './useTripConfig'
import {
  useExchangeRates, useExpenses, useTravelers, useBalances, useExpenseActions, useTravelerActions,
  useDepositActions, useSyncTravelerNameFromProfile, useLongTermActions, useSettlementActions,
  useRepayments, useRepaymentActions, useSyncRecovery, type useModals,
} from './index'
import { useFilteredExpenses } from './useFilteredExpenses'
import { calculateBalances, calculateSettlements, calculateCategoryTotals, calculateSpendingTrend } from '../utils/calculations'
import { TRIP_ID } from '../utils/tripId'
import { isLongTerm } from '../utils/tripType'
import { formatPeriodLabel, listPeriods } from '../utils/period'
import { planRollover, describeExitBlock, filterCycleExpenses, calculateCycleWallet } from '../utils/longTerm'

// ─── مساحة العمل: ما بداخل الرحلة المفتوحة ─────────────────────────────────────
//
// ثالثة المجموعات الثلاث في useAppCoordinator. الدفتر (مصاريف/مسافرون/سداد)،
// كل ما يُشتق منه من أرقام، مزامنته، وأفعال الكتابة عليه — ومنها الرحلة
// الطويلة، لأن كل أرقامها مشتقة من `balances` هنا.
//
// ⚠️ الترتيب داخل هذه الدالة ليس اعتباطياً: عدة خطافات تستهلك ناتج ما قبلها
// (activeTravelers قبل useExpenseActions، describeExitBlockFor قبل
// useTravelerActions...). لا تُعِد ترتيبها لأغراض تجميلية.

interface UseTripWorkspaceArgs {
  user: User | null
  isAdmin: boolean
  hasAccess: boolean
  /** من useAppSession — اسم البروفايل الذي يُزامَن إلى بطاقة مسافري. */
  profileDisplayName: string | undefined
  /** من useAppTrip. */
  config: Pick<TripConfig, 'tripType' | 'currentPeriod' | 'lastClosedPeriod' | 'organizerUid'>
  isOrganizer: boolean
  modals: ReturnType<typeof useModals>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
  setSyncError: Dispatch<SetStateAction<string | null>>
}

export function useTripWorkspace({
  user, isAdmin, hasAccess, profileDisplayName, config, isOrganizer, modals,
  showToast, handleFirestoreError, setSyncError,
}: UseTripWorkspaceArgs) {
  const { tripType, currentPeriod, lastClosedPeriod, organizerUid } = config

  // 🆕 علم مستقل لكل مستمع بدل علم واحد مشترك بينهما. المشترك كان يكذب: كلاهما
  // يرفعه عند الاشتراك ويُنزله في معالج لقطته، فأيّ المجموعتين وصلت أولاً
  // تُطفئ الشارة بينما الأخرى ما زالت في قراءتها الأولى — ولأن كليهما يستخدم
  // includeMetadataChanges، كان أي حدث بيانات-وصفية من إحداهما يُطفئها أيضاً.
  // فتقول الواجهة "تمّت المزامنة" والبيانات قديمة فعلاً، وهو ما يجعل أي تأخّر
  // حقيقي يبدو عطلاً عشوائياً بلا تفسير.
  const [isExpensesSyncing, setIsExpensesSyncing] = useState(false)
  const [isTravelersSyncing, setIsTravelersSyncing] = useState(false)
  const isSyncing = isExpensesSyncing || isTravelersSyncing

  const { ratesUpdatedAt, CURRENCIES } = useExchangeRates()
  const { expenses,  setExpenses,  expensesLoaded,  refreshExpenses }  = useExpenses(hasAccess ? user : null, { setIsSyncing: setIsExpensesSyncing, setSyncError })
  const { travelers, setTravelers, travelersLoaded, refreshTravelers } = useTravelers(hasAccess ? user : null, setIsTravelersSyncing)
  // 🆕 قيود السداد — القيد الثالث في الدفتر (انظر Repayment في types.ts).
  const { repayments, setRepayments, repaymentsLoaded, refreshRepayments } = useRepayments(hasAccess ? user : null)

  // 🆕 repaymentsLoaded أيضاً: بلاه تُحسب الأرصدة لحظةً بلا السداد، فتومض
  // تسويةٌ سُدّدت فعلاً ثم تختفي.
  const isInitialLoading = !expensesLoaded || !travelersLoaded || !repaymentsLoaded

  const activeExpenses = useMemo(() => expenses.filter(e => !e.deletedAt), [expenses])
  const activeTravelers = useMemo(() => travelers.filter(t => !t.deletedAt), [travelers])

  const deletedExpenses = useMemo(() => expenses.filter(e => e.deletedAt), [expenses])
  const deletedTravelers = useMemo(() => travelers.filter(t => t.deletedAt), [travelers])
  const activeRepayments = useMemo(() => repayments.filter(r => !r.deletedAt), [repayments])
  const deletedRepayments = useMemo(() => repayments.filter(r => r.deletedAt), [repayments])

  // 🆕 يُصلح اسم مسافري تلقائياً إن اختلف عن بروفايلي — بديل ربط حيّ (كبيانات
  // البنك) اخترناه لتفادي اشتراك منفصل لكل مسافر مربوط بحساب في كل مكان يُعرض
  // فيه اسمه. انظر تعليق الملف. لا شيء يُعرض بسببه — صامت بالكامل.
  useSyncTravelerNameFromProfile(TRIP_ID, hasAccess ? user : null, activeTravelers, profileDisplayName)

  const { balances, totalSpent, totalDeposited, totalRemaining } = useBalances(activeTravelers, activeExpenses, activeRepayments)

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
    () => (isLongTermTrip ? filterCycleExpenses(activeExpenses, currentPeriod) : []),
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
  // 🆕 قائمة الفترات لمُصفّي الدورة في التقارير/كشف الحساب — تصاعدياً، من أول
  // نشاط حتى الشهر المفتوح حالياً (انظر listPeriods في utils/period.ts).
  const periods = useMemo(
    () => (isLongTermTrip ? listPeriods(activeExpenses, currentPeriod) : []),
    [isLongTermTrip, activeExpenses, currentPeriod],
  )

  // 🆕 محفظة الدورة الحالية — للهيدر ولبطاقة كل مسافر. **لا حساب مالي جديد**:
  // حصة كل مسافر من مصاريف الدورة (periodExpenses، مُصفّاة أصلاً من مصاريف
  // الترحيل) تُشتق بإعادة استدعاء calculateBalances نفسها على مسافرين
  // بـ deposited=0 — فتصير totalExpenses حصته من هذا الشهر وحده بنفس منطق
  // splitByShares/paidBy المستخدَم في كل مكان آخر، لا نسخة مكرَّرة منه.
  const cycleShareBalances = useMemo(
    () => (isLongTermTrip
      ? calculateBalances(activeTravelers.map(t => ({ ...t, deposited: 0 })), periodExpenses)
      : []),
    [isLongTermTrip, activeTravelers, periodExpenses],
  )
  const cycleWallet = useMemo(
    () => (isLongTermTrip ? calculateCycleWallet(totalRemaining, periodTotal) : 0),
    [isLongTermTrip, totalRemaining, periodTotal],
  )
  const cycleWallets = useMemo(() => {
    if (!isLongTermTrip) return {}
    const map: Record<number, number> = {}
    balances.forEach(b => {
      const share = cycleShareBalances.find(c => c.id === b.id)?.totalExpenses ?? 0
      map[b.id] = calculateCycleWallet(b.remaining, share)
    })
    return map
  }, [isLongTermTrip, balances, cycleShareBalances])

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

  // جلب طازج من الخادم متجاوزاً الكاش — مشترك بين طريقين مختلفَي النية:
  // سحب-للتحديث اليدوي (يُبلغ عن الفشل، فالمستخدم طلبه وينتظره) والتعافي
  // التلقائي في useSyncRecovery (يصمت عند الفشل، فالمستخدم لم يطلب شيئاً).
  const refreshFromServer = useCallback(async () => {
    await Promise.all([refreshExpenses(), refreshTravelers(), refreshRepayments()])
  }, [refreshExpenses, refreshTravelers, refreshRepayments])

  const handlePullToRefresh = useCallback(async () => {
    try {
      await refreshFromServer()
    } catch (err) {
      handleFirestoreError(err, 'تعذر تحديث البيانات — تحقّق من اتصالك وحاول مجدداً.')
    }
  }, [refreshFromServer, handleFirestoreError])

  // 🆕 كتابات محلية لم يؤكّدها الخادم بعد (`_pending` مشتقّ من
  // hasPendingWrites في المستمعَين). القراءة من الخادم أثناءها **تمحوها من
  // الشاشة**: getDocsFromServer يتجاوز الكاش المحلي، فيعود بحالة الخادم التي
  // لا تتضمّنها بعد، وsetExpenses/setTravelers يستبدلان القائمة بها — فيختفي
  // مصروف أُضيف للتوّ ويظهر رصيد خاطئ حتى تصل لقطة onSnapshot التالية.
  //
  // سحب-للتحديث يحمل نفس الخطر أصلاً، لكنه إجراء يطلبه المستخدم في لحظة
  // يختارها هو وينتظر نتيجته؛ أما التعافي فتلقائي وقد يقع في منتصف إدخال
  // سريع للبيانات. لذا نمتنع عنه ما دامت هناك كتابة معلّقة — ووجودها دليل
  // بذاته على أن الاتصال حيّ، أي أن لا شيء نتعافى منه أصلاً.
  const hasUnconfirmedWrites = expenses.some(e => e._pending) || travelers.some(t => t._pending)

  // 🆕 التعافي من المزامنة الصامتة: onSnapshot فوريّ ما دام الاتصال حيّاً، لكن
  // الجوال يجمّد تبويب PWA في الخلفية أو يتخلّص منه بلا أي حدث يعرفه المتصفح —
  // فيبقى ما تراه قديماً بلا مؤشر. هذا يفرض قراءة طازجة عند العودة. انظر
  // التعليق الكامل والقياسات في useSyncRecovery.ts.
  //
  // ⚠️ سحب-للتحديث لا يغني عنه: إيماءة لمس بحتة (onTouchStart في
  // PullToRefresh.tsx) ولا تعمل إلا عند قمة الصفحة — فلا وجود لها على سطح
  // المكتب أصلاً، وتتطلب أن يشكّ المستخدم في البيانات ليسحبها.
  useSyncRecovery(hasAccess && !hasUnconfirmedWrites, refreshFromServer)

  const expense = useExpenseActions({
    activeTravelers, user, isAdmin, setExpenses, showToast, handleFirestoreError, setSyncError,
    isFirstExpense: activeExpenses.length === 0,
  })

  const traveler = useTravelerActions({
    travelers, activeTravelers, user, setTravelers, showToast, handleFirestoreError, setSyncError,
    closeModal: modals.closeModal,
    describeExitBlockFor,
  })

  const deposit = useDepositActions({ user, setTravelers, showToast, handleFirestoreError })

  // 🆕 استدعاءات الرحلة الطويلة (closeMonth/exitTraveler) — لا كتابة Firestore
  // هنا إطلاقاً؛ انظر تعليق الملف في hooks/useLongTermActions.ts.
  const longTermActions = useLongTermActions({ showToast, handleFirestoreError })

  // 🆕 تسجيل التحويلات — نفس السبب ونفس الحدّ: الدفتر لا يُكتب من المتصفح،
  // والفعل متاح لمنظّم الرحلة أو المسؤول وحدهما (callerManagesTrip خادمياً).
  const settlementActions = useSettlementActions({ showToast, handleFirestoreError })
  const repaymentActions = useRepaymentActions({ setRepayments, showToast, handleFirestoreError })
  const canRecordSettlements = isAdmin || isOrganizer
  const recordTransfer = useCallback((settlement: Settlement) => {
    void settlementActions.recordSettlement(
      TRIP_ID, settlement.fromId, settlement.toId, settlement.amount, settlement.toName,
    )
  }, [settlementActions])

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
   *
   * 🆕 وما كان في الرحلة القياسية نافذة تأكيد صار حذفاً مباشراً — الفرق الوحيد
   * في هذه الدالة منذ كُتبت. التفرّع نفسه لم يتغيّر: القياسية تحذف، والطويلة
   * تفتح نافذة الخروج (تسوية مالية حقيقية لا تراجع عنها بتنبيه).
   */
  // ⚠️ مُفكَّكة لا `traveler.confirmDeleteTraveler`: مرجع هذه الدالة وحده ثابت
  // (useCallback)، بينما كائن `traveler` يُعاد بناؤه كل رسمة — ووضعه في قائمة
  // الاعتماديات كان يُفقد `requestDeleteTraveler` ثباتها، وهي تعيش في شريحة
  // `actions` من المتجر حيث الثبات هو الشرط (القاعدة ١٦).
  const { confirmDeleteTraveler } = traveler
  const requestDeleteTraveler = useCallback((target: Traveler) => {
    if (!isLongTermTrip) {
      // 🆕 حذف مباشر بلا نافذة تأكيد: ليّن، ويحمل تنبيهُه «تراجع»، ويبقى في
      // سلة المهملات بعدها — انظر confirmDeleteTraveler في useTravelerActions.
      confirmDeleteTraveler(target.id)
      return
    }
    // الرصيد لازم لنافذة الخروج (تعرض المبلغ والاتجاه). غيابه من balances
    // يعني مسافراً لم يُحسب بعد — نمرّره برصيد صفر فتتصرّف النافذة كحساب مسوّى،
    // والخادم يبقى الحكم الفعلي على أي حال.
    const withBalance = balances.find(b => b.id === target.id)
    modals.openExitTraveler(withBalance ?? { ...target, totalExpenses: 0, remaining: 0 })
  }, [isLongTermTrip, balances, modals, confirmDeleteTraveler])

  const confirmExitTraveler = useCallback(async (travelerId: number, settle: boolean) => {
    const ok = await longTermActions.exitTraveler(TRIP_ID, travelerId, settle)
    if (ok) modals.closeModal()
  }, [longTermActions, modals])

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
    // ⚠️ **لا فرع ثالث لتعديل الرصيد بعد الآن، وهذا ليس سهواً.** كان حقل
    // المبلغ يعيش هنا فيُقاس، وصار يعيش في `DepositEditor` داخل ملف المسافر
    // (انظر useDepositActions.ts). ومسوّدة نصف مكتوبة في حقل *مضمَّن* داخل
    // نافذة مفتوحة لا تُقارَن بنموذج قائم بذاته: تحديث التطبيق سيُغلق النافذة
    // بأكملها على أي حال. المقياس هنا لنماذج الإدخال المستقلّة وحدها.
    return hasExpenseData || hasTravelerData
  }, [
    expense.isAddingExpense, expense.newExpense,
    traveler.isAddingTraveler, traveler.newTravelerName, traveler.newTravelerDeposit,
  ])

  return {
    isSyncing, handlePullToRefresh, hasUnsavedData,
    /** الأرقام المشتقّة — مدخلات كل ما يُعرض ويُصدَّر. */
    ledger: {
      isInitialLoading,
      activeExpenses, activeTravelers, deletedExpenses, deletedTravelers,
      balances, totalSpent, totalDeposited, totalRemaining,
      settlements, categoryTotals, spendingTrend,
      // 🆕 تسجيل التحويل — undefined لغير المنظّم/المسؤول، فيُخفي الزرّ نفسه.
      onRecordTransfer: canRecordSettlements ? recordTransfer : undefined,
      recordingSettlementKey: settlementActions.recordingKey,
      // 🆕 قيود السداد المسجّلة — تُعرض تحت التسويات، ويحذفها من يسجّلها.
      activeRepayments, deletedRepayments,
      onDeleteRepayment: canRecordSettlements ? repaymentActions.deleteRepayment : undefined,
      onRestoreRepayment: repaymentActions.restoreRepayment,
      // 🆕 نموذج الهوية الهجين — بطاقتك مثبَّتة أولاً هنا (انظر myBalance
      // وتعليقه أعلاه) — هذا وحده كافٍ الآن، بلا بطاقة ملخّص منفصلة فوقها
      // (MyBalanceBanner، حُذفت — كانت تكرر نفس الرقم بلا معلومة جديدة).
      travelersPanelBalances,
    },
    /**
     * 🆕 كل ما تحتاجه واجهة الرحلة الطويلة — **null في الرحلة القياسية**.
     * قيمة واحدة تُفحص في App.tsx (`longTerm && …`) بدل شروط متفرّقة، وهو ما
     * يجعل «الرحلة القياسية لا تتأثر» حقيقةً بنيوية لا وعداً في تعليق.
     */
    longTerm: isLongTermTrip ? {
      period: currentPeriod,
      periodLabel: formatPeriodLabel(currentPeriod),
      lastClosedPeriod,
      periodTotal,
      periodCount: periodExpenses.length,
      // 🆕 محفظة الدورة الحالية — إجمالية (الهيدر) وبِحسب كل مسافر (بطاقته).
      // انظر تعليق useMemo أعلاه لماذا هي اشتقاق لا حساب مالي جديد.
      cycleWallet,
      cycleWallets,
      // 🆕 لمُصفّي الدورة في التقارير/كشف الحساب — انظر ReportsView.tsx وTravelerProfileModal.tsx.
      periods,
      movements: rolloverPlan,
      canManage: canManageLongTerm,
      isClosingMonth: longTermActions.isClosingMonth,
      isExitingTraveler: longTermActions.isExitingTraveler,
      organizerUid,
      openRollover: modals.openMonthlyRollover,
      onConfirmRollover: confirmRollover,
      onConfirmExit: confirmExitTraveler,
    } : null,
    /** أسعار الصرف الحيّة — تُقرأ من DataContext في نموذج المصروف. */
    rates: { currencies: CURRENCIES, ratesUpdatedAt },
    filter,
    /**
     * 🆕 يُمرَّر إلى TripStoreProvider — انظر تعليق الدالة أعلاه. الرحلة
     * القياسية تحذف مباشرةً (تنبيه «تراجع»)، والطويلة تفتح نافذة الخروج.
     */
    requestDeleteTraveler,
    expense,
    traveler,
    deposit,
  }
}
