import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID, appHomeUrl } from './utils/tripId'
import { haptic } from './utils/haptics'
import { useAppCoordinator } from './hooks/useAppCoordinator'

import ErrorBoundary        from './components/ErrorBoundary'
import Header               from './components/Header'
import Toast                from './components/Toast'
import { ExpenseForm }      from './components/ExpenseSection'
import { BankDetailsCard }  from './components/Misc'
import UpdatePrompt         from './components/UpdatePrompt'
import OnboardingBanner     from './components/OnboardingBanner'
import AuthGate             from './components/AuthGate'
import NotAMemberScreen     from './components/NotAMemberScreen'
import InviteJoinScreen     from './components/InviteJoinScreen'
import TripPicker           from './components/TripPicker'
import ModalManager         from './components/ModalManager'
import ModalFallback        from './components/modals/ModalFallback'
import PullToRefresh        from './components/PullToRefresh'
import SmartInputBar        from './components/SmartInputBar'
import { TripStoreProvider } from './store/TripStoreProvider'
import { AppErrorFallback } from './components/AppErrorFallback'
import { StatusBanners }    from './components/StatusBanners'
import { TravelersPanel }   from './components/TravelersPanel'
import { SettlementsPanel } from './components/SettlementsPanel'
import { ExpensesPanel }    from './components/ExpensesPanel'
import { NextSegmentStrip } from './components/NextSegmentWidget'

// 🆕 بروفايل المستخدم العام — يُعرض هنا لا داخل ModalManager عمداً: مستقل عن
// أي رحلة، ويجب أن يبقى متاحاً حتى في شاشات لا يصل إليها ModalManager (مثل
// TripPicker لعضو بلا أي رحلة بعد — بالضبط من يحتاج تعبئة بروفايله قبل إنشاء
// أول رحلة ذاتياً). انظر docs/DECISIONS.md.
const UserProfileModal = lazy(() => import('./components/modals/UserProfileModal'))

// ─── App ──────────────────────────────────────────────────────────────────────
// مسؤوليتان اثنتان لا ثالث لهما:
//   ١. التوجيه — أي شاشة تُعرض (رحلاتي ← بوابة الرمز ← التطبيق). الترتيب مقصود.
//   ٢. التركيب — توصيل ناتج useAppCoordinator بالأقسام المرئية.
//
// كل ما عدا ذلك انتقل: التركيب إلى hooks/useAppCoordinator.ts، ومخزن الحالة إلى
// store/TripStoreProvider.tsx، والتخطيط إلى أقسام components/*Panel.tsx.
export default function App() {
  const {
    session, ledger, trip, rates, status, picker, tripEdit, filter, modals, expense, traveler, deposit, invite,
    profile, isSavingProfile, saveProfile, organizerBank, longTerm, requestDeleteTraveler, passwordReset,
  } = useAppCoordinator()

  // 🆕 لا رمز رحلة/PIN بعد الآن — تسجيل الدخول (Google/بريد) هو الحارس الوحيد
  // المتبقي، ويسبق كل توجيه آخر بما فيه شاشة رابط الدعوة (انظر docs/DECISIONS.md).
  //
  // ⚠️ الترتيب هنا: أولاً استعادة الجلسة المحفوظة (authLoading — نافذة قصيرة
  // عند كل تحميل)، ثم غياب المستخدم كلياً. من دونهما بهذا الترتيب، زائر بلا
  // جلسة محفوظة يفتح رابط دعوة كان سيرى شاشة "جارٍ الانضمام..." للأبد بلا أي
  // زر لتسجيل الدخول — useInviteJoin لا يستدعي الخادم أصلاً قبل وجود مستخدم.
  //
  // ⚠️ screen (لا return مباشر من كل فرع): Toast يُعرض مرة واحدة أسفل هذه
  // الدالة بصرف النظر عن أي شاشة معروضة — رابط دعوة فاشل مثلاً ينتهي بالمستخدم
  // على TripPicker أو NotAMemberScreen لا داخل التطبيق الكامل، وToast كان
  // يُعرَض فقط داخل فرع التطبيق الكامل فيختفي الخطأ صامتاً في كل الفروع الأخرى.
  let screen: React.JSX.Element
  if (session.authLoading || !session.user) {
    screen = (
      <AuthGate
        loading={session.authLoading}
        isSigningIn={session.isSigningIn}
        signInError={session.signInError}
        onSignInGoogle={session.signInWithGoogle}
        onSignInEmail={session.signInWithEmail}
        passwordReset={passwordReset}
      />
    )
  } else if (invite.status === 'joining' || invite.status === 'needsName') {
    // 🆕 رابط دعوة بنقرة واحدة (?invite=TOKEN) — نجاحه إعادة توجيه كاملة، وفشله
    // ينظّف الرابط ويُكمل للتدفّق المعتاد أدناه (رحلاتي/الرحلة المطلوبة).
    screen = (
      <InviteJoinScreen
        status={invite.status}
        onSubmitName={invite.submitName}
        onSkipName={invite.skipName}
        isSubmittingName={invite.isSubmittingName}
      />
    )
  } else if (picker.isVisible) {
    // 🆕 من فتح التطبيق بلا `?trip=` لا رحلة مقصودة لديه — نعرض رحلاته بدلاً من
    // افتراض الرحلة الافتراضية. أما من فتح رابط رحلة بعينها فيُتحقَّق من عضويته
    // فيها مباشرةً أدناه (مع منفذ للعودة لقائمته إن كان عضواً في رحلات أخرى).
    screen = (
      <TripPicker
        trips={picker.trips}
        archivedTrips={picker.archivedTrips}
        stats={picker.stats}
        loading={picker.loading}
        error={picker.error}
        currentTripId={HAS_EXPLICIT_TRIP_ID && session.hasAccess ? TRIP_ID : undefined}
        onCreateTrip={picker.onCreateTrip}
        isCreatingTrip={picker.isSaving}
        onShowProfile={modals.openUserProfile}
        isAdmin={picker.isAdmin}
        isSaving={picker.isSaving}
        onRestoreTrip={picker.onRestoreTrip}
      />
    )
  } else if (!session.isAdmin && !session.joinedTripIds.includes(TRIP_ID)) {
    // 🆕 مستخدم مسجَّل دخوله لكنه ليس عضواً في هذه الرحلة تحديداً — لا رمز رحلة
    // يمكنه تجربته للانضمام ذاتياً، فالمسار الوحيد رابط دعوة من المنظّم.
    screen = (
      <NotAMemberScreen
        onShowMyTrips={session.joinedTripIds.length > 0 ? picker.show : undefined}
      />
    )
  } else {
    screen = (
      <TripStoreProvider
        travelers={ledger.activeTravelers}
        expenses={ledger.activeExpenses}
        user={session.user}
        isAdmin={session.isAdmin}
        isOrganizer={session.isOrganizer}
        currencies={rates.currencies}
        ratesUpdatedAt={rates.ratesUpdatedAt}
        cancelExpenseForm={expense.cancelExpenseForm}
        startEditExpense={expense.startEditExpense}
        requestDeleteExpense={expense.requestDeleteExpense}
        submitDeposit={deposit.submitDeposit}
        requestDeleteTraveler={requestDeleteTraveler}
        expenseForm={expense.newExpense}
        setExpenseForm={expense.setNewExpense}
        isExpenseFormOpen={expense.isAddingExpense}
        isEditingExpense={!!expense.editingExpense}
        submitExpense={expense.handleAddExpense}
        toggleParticipant={expense.toggleParticipant}
        toggleAllParticipants={expense.toggleAllParticipants}
      >
        <ErrorBoundary fallback={<AppErrorFallback />}>
          {/* ⚠️ pb-24 في كل العروض — لا `md:pb-8`. شريط الإدخال السريع
              (SmartInputBar) ثابت أسفل الشاشة عند *كل* عرض، لكن الحشو كان
              ينكمش إلى 32px عند md فيختفي آخر محتوى الصفحة خلفه. قِيس فعلياً
              على 768×1024: تداخل 22 بكسل (آخر بطاقة مسافر تحت الشريط). القيمة
              96px تُغطّي ارتفاع الشريط (~60px) وإزاحته السفلية
              (max(1rem, safe-area)) بهامش واضح. */}
          <div className="min-h-screen pb-24">
            <Header
              isSyncing={status.isSyncing}
              // 🆕 اسم الرحلة يحلّ محلّ «مصاريف السفر» الثابت في العنوان —
              // وهو نفسه زرّ فتح ورقة «المزيد» (انظر Header.tsx/MoreMenu.tsx).
              // «إدارة الرحلة» صارت بنداً داخلها لا زرّاً منفصلاً هنا.
              tripName={trip.name}
              displayName={profile.displayName || session.user?.displayName || null}
              email={session.user?.email ?? null}
              stats={ledger.isInitialLoading ? null : {
                totalDeposited: ledger.totalDeposited,
                totalSpent: ledger.totalSpent,
                totalRemaining: ledger.totalRemaining,
              }}
              // 🆕 أرقام الشهر الجاري — الرحلة الطويلة فقط (longTerm غير null).
              // بلا periodLabel: السطر الموجز يقول «هذا الشهر» لا اسم الشهر،
              // انظر HeaderCycleStats في Header.tsx.
              cycleStats={ledger.isInitialLoading || !longTerm ? null : {
                totalDeposited: longTerm.cycleWallet,
                totalSpent: longTerm.periodTotal,
                totalRemaining: ledger.totalRemaining,
              }}
              isOnline={session.isOnline}
              // زر التبديل يظهر متى وُجدت رحلة أخرى غير المفتوحة حالياً (نشطة
              // أو مؤرشفة)، أو للمسؤول دائماً (يتصفّح كل الرحلات ويُنشئ/يستعيد
              // من «رحلاتي»).
              onShowMyTrips={
                picker.trips.length > 1 || picker.archivedTrips.length > 0 || session.isAdmin
                  ? picker.show : undefined
              }
              onShowProfile={modals.openUserProfile}
              onSignOut={session.signOut}
              // 🆕 كل ما ليس من الأقسام الثلاثة الرئيسية. اختيارية كل بند هي
              // حارس صلاحيته/سياقه — لا شرط `isAdmin` داخل MoreMenu نفسه.
              more={{
                onOpenReports:   modals.openReports,
                onOpenCharts:    modals.openCharts,
                onOpenItinerary: modals.openItinerary,
                onOpenLongTerm:  longTerm ? modals.openLongTermPanel : undefined,
                onOpenTripAdmin: tripEdit.canEdit ? modals.openEditTrip : undefined,
                // المسؤول العالمي وحده — نفس حارس القسم داخل TripDetailPanel،
                // فلا يظهر بند لمنظّم سيصطدم بمنع من القواعد بعد ضغطه.
                onExportBackup: session.isAdmin
                  ? () => { void tripEdit.onExportBackup(tripEdit.trip) }
                  : undefined,
                onOpenTrashBin: session.isAdmin ? modals.openTrashBin : undefined,
              }}
              onStatClick={(stat) => {
                haptic.light()
                const id =
                  stat === 'deposited' ? 'travelers-section' :
                  stat === 'spent'     ? 'expenses-section'  :
                  // 🆕 «المتبقي» يقود إلى «الأرصدة» — قسم الشاشة الذي يجيب عن
                  // «ولمن أُحوِّل؟». كان يقود إلى الإحصائيات، وهي خلف «المزيد» الآن.
                                         'settlements-section'
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
  
            <PullToRefresh onRefresh={status.handlePullToRefresh}>
              <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
  
                <OnboardingBanner />

                {/* 🆕 رحلة منتهية أو مؤرشفة: نشرح سبب اختفاء أزرار الإدخال بدل
                    تركها تختفي بلا تفسير. القواعد هي التي تمنع فعلاً، وهذا إعلام. */}
                <StatusBanners
                  tripClosedNotice={trip.tripClosedNotice}
                  isOnline={session.isOnline}
                  syncError={status.syncError}
                />

                {/* ─── الشاشة الرئيسية: ثلاثة أقسام لا أكثر ───────────────────
                    المصاريف ← الأرصدة ← المسافرون، بهذا الترتيب تحديداً: ما
                    يُفعل يومياً، ثم ما يُسأل عنه عند التصفية، ثم من يخصّهم.
                    ⚠️ كل ما عداها خلف اسم الرحلة في الهيدر («المزيد») — المسار
                    كاملاً، والإحصائيات، والشهر المحاسبي، والتقارير، وسلة
                    المهملات، وإدارة الرحلة والنسخة الاحتياطية. طلب صاحب
                    الحساب صراحةً تقليل الحمل البصري؛ انظر MoreMenu.tsx
                    وdocs/DECISIONS.md.
                    🆕 والاستثناء الوحيد شريطُ المقطع القادم أدناه: سطرٌ واحد
                    لا قسم، ولا يفتح شيئاً إلا صفحة المسار نفسها. */}

                {/* نموذج المصروف يختفي كلياً في الرحلة المنتهية/المؤرشفة.
                    🆕 Modal (Bottom Sheet) لا قسم داخل تدفّق الصفحة —
                    انظر تعليق ExpenseForm في ExpenseSection.tsx وdocs/DECISIONS.md.
                    الشرط الخارجي (isAddingExpense) صريح هنا لا داخل ExpenseForm
                    وحدها: AnimatePresence يحتاج التبديل عند نقطة العرض الشرطي
                    نفسها ليكتشف الإزالة ويُشغّل حركة الخروج — نفس نمط ModalManager.tsx. */}
                {trip.canAddExpenses && (
                  <AnimatePresence>
                    {expense.isAddingExpense && <ExpenseForm />}
                  </AnimatePresence>
                )}

                {/* 🆕 الاستثناء الوحيد لقاعدة «ثلاثة أقسام لا أكثر»: سطر واحد
                    لا قسم. غرضه المحدَّد — أن يُعرف كم تبقّى وإلى أين بنظرة
                    عابرة أثناء تسجيل مصروف — لا يتحقّق خلف نقرتين في «المزيد»،
                    وكل ما عداه (وقت الانطلاق، رقم الرحلة، PNR، بقية المقاطع)
                    يبقى في صفحة المسار التي يفتحها الضغط عليه. طلب صاحب الحساب
                    ذلك صراحةً بعد نقل المسار كاملاً خلف «المزيد» — انظر
                    docs/DECISIONS.md وNextSegmentWidget.tsx. */}
                <NextSegmentStrip itinerary={trip.itinerary} onOpen={modals.openItinerary} />

                <ExpensesPanel
                  isInitialLoading={ledger.isInitialLoading}
                  canAddExpenses={trip.canAddExpenses}
                  activeExpenses={ledger.activeExpenses}
                  filteredExpenses={filter.filteredExpenses}
                  searchQuery={filter.searchQuery}
                  setSearchQuery={filter.setSearchQuery}
                  sortOrder={filter.sortOrder}
                  setSortOrder={filter.setSortOrder}
                  onOpenExpenseForm={expense.openExpenseForm}
                  // 🆕 يُمرِّر الصفحة إلى السجلّ بعد كل تسجيل ناجح — نفس
                  // الإشارة التي تُفرِّغ شريط الإدخال السريع. انظر ExpensesPanel.tsx.
                  scrollToSignal={expense.expenseAddedSignal}
                />

                <SettlementsPanel
                  isInitialLoading={ledger.isInitialLoading}
                  settlements={ledger.settlements}
                  travelers={ledger.activeTravelers}
                  hasExpenses={ledger.activeExpenses.length > 0}
                />

                {/* 🆕 تفاصيل حساب المنظّم مباشرة تحت «الأرصدة» لا في عمود جانبي
                    منفصل: هي الخطوة التالية حرفياً بعد قراءة «كم أدين ولمن». */}
                <BankDetailsCard bankDetails={organizerBank.bankDetails} isLoading={organizerBank.loading} />

                <TravelersPanel
                  isInitialLoading={ledger.isInitialLoading}
                  isAdmin={session.isAdmin}
                  activeTravelers={ledger.activeTravelers}
                  balances={ledger.travelersPanelBalances}
                  isAddingTraveler={traveler.isAddingTraveler}
                  onStartAddTraveler={traveler.startAddTraveler}
                  travelerForm={{
                    name: traveler.newTravelerName, setName: traveler.setNewTravelerName,
                    deposit: traveler.newTravelerDeposit, setDeposit: traveler.setNewTravelerDeposit,
                    onSubmit: traveler.handleAddTraveler, onCancel: traveler.cancelAddTraveler,
                  }}
                  longTermExit={longTerm ? {
                    canManage: longTerm.canManage,
                    isBusy: longTerm.isClosingMonth || longTerm.isExitingTraveler,
                  } : undefined}
                  cycleWallets={longTerm?.cycleWallets}
                  periods={longTerm?.periods}
                />
              </main>
            </PullToRefresh>
  
            <SmartInputBar
              visible={!ledger.isInitialLoading && !expense.isAddingExpense && trip.canAddExpenses}
              onQuickAdd={expense.handleQuickAddExpense}
              onExpand={expense.openExpenseForm}
              clearSignal={expense.expenseAddedSignal}
            />
  
            <ModalManager
              modal={modals.modal}
              closeModal={modals.closeModal}
              reports={{
                travelers: ledger.activeTravelers,
                expenses: ledger.activeExpenses,
                balances: ledger.balances,
                settlements: ledger.settlements,
                categoryTotals: ledger.categoryTotals,
                itinerary: trip.itinerary,
                periods: longTerm?.periods,
              }}
              // 🆕 أقسام انتقلت من تدفّق الشاشة إلى نوافذ خلف «المزيد».
              charts={{
                categoryTotals: ledger.categoryTotals,
                spendingTrend: ledger.spendingTrend,
                hasExpenses: ledger.activeExpenses.length > 0,
              }}
              itinerary={{
                itinerary: trip.itinerary,
                onEditItinerary: tripEdit.canEdit ? modals.openEditTrip : undefined,
              }}
              longTermPanel={longTerm ? {
                period: longTerm.period,
                lastClosedPeriod: longTerm.lastClosedPeriod,
                periodTotal: longTerm.periodTotal,
                periodCount: longTerm.periodCount,
                canManage: longTerm.canManage,
                isBusy: longTerm.isClosingMonth || longTerm.isExitingTraveler,
                hasActiveTravelers: ledger.activeTravelers.length > 0,
                onCloseMonth: longTerm.openRollover,
              } : undefined}
              trash={{
                deletedExpenses: ledger.deletedExpenses,
                deletedTravelers: ledger.deletedTravelers,
                onRestoreExpense: expense.handleRestoreExpense,
                onRestoreTraveler: traveler.handleRestoreTraveler,
              }}
              // 🆕 undefined لمن لا يملك صلاحية التعديل أصلاً — لا مسؤول ولا
              // منظّم لهذه الرحلة (تطابق الحارس نفسه في Header/AccountMenu).
              editTrip={tripEdit.canEdit ? {
                trip: tripEdit.trip,
                viewerRole: tripEdit.viewerRole,
                isSaving: tripEdit.isSaving,
                onSaveTripName: tripEdit.onSaveTripName,
                onSaveItinerary: tripEdit.onSaveItinerary,
                onSaveTripStatus: tripEdit.onSaveTripStatus,
                onSaveTripType: tripEdit.onSaveTripType,
                onDeleteTrip: tripEdit.onDeleteTrip,
                onRemoveMember: tripEdit.onRemoveMember,
                onSetMemberRole: tripEdit.onSetMemberRole,
                onLinkTravelerAccount: tripEdit.onLinkTravelerAccount,
                onExportBackup: tripEdit.onExportBackup,
                onCreateInvite: tripEdit.onCreateInvite,
                onRevokeInvite: tripEdit.onRevokeInvite,
                showToast: status.showToast,
                // الرحلة المفتوحة حذفت نفسها — إعادة توجيه كاملة بلا `?trip=`
                // بدل إبقاء المستخدم على شاشة تشير لمستند لم يعد موجوداً.
                onDeleted: () => { window.location.href = appHomeUrl() },
              } : undefined}
              // 🆕 غير مُمرَّرة إطلاقاً في الرحلة القياسية — وهو ما يجعل
              // مودالَي الترحيل/الخروج غير قابلين للعرض فيها بنيوياً، لا بشرط.
              longTerm={longTerm ? {
                period: longTerm.period,
                movements: longTerm.movements,
                isClosingMonth: longTerm.isClosingMonth,
                isExitingTraveler: longTerm.isExitingTraveler,
                organizerUid: longTerm.organizerUid,
                onConfirmRollover: longTerm.onConfirmRollover,
                onConfirmExit: longTerm.onConfirmExit,
              } : undefined}
            />
  
            <UpdatePrompt hasUnsavedData={status.hasUnsavedData} />
          </div>
        </ErrorBoundary>
      </TripStoreProvider>
    )
  }

  return (
    <>
      {screen}
      <AnimatePresence>
        {modals.modal.type === 'userProfile' && (
          <Suspense fallback={<ModalFallback />}>
            <UserProfileModal profile={profile} isSaving={isSavingProfile} onSave={saveProfile} onClose={modals.closeModal} />
          </Suspense>
        )}
      </AnimatePresence>
      {status.toast && <Toast message={status.toast} />}
    </>
  )
}
