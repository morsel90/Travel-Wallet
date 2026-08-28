import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID } from './utils/tripId'
import { haptic } from './utils/haptics'
import { useAppCoordinator } from './hooks/useAppCoordinator'

import ErrorBoundary        from './components/ErrorBoundary'
import Header               from './components/Header'
import Toast                from './components/Toast'
import { ConfirmModal }     from './components/Modal'
import { ExpenseForm }      from './components/ExpenseSection'
import { BankDetailsCard }  from './components/Misc'
import { NextSegmentWidget } from './components/NextSegmentWidget'
import UpdatePrompt         from './components/UpdatePrompt'
import OnboardingBanner     from './components/OnboardingBanner'
import AuthGate             from './components/AuthGate'
import NotAMemberScreen     from './components/NotAMemberScreen'
import InviteJoinScreen     from './components/InviteJoinScreen'
import TripPicker           from './components/TripPicker'
import AuthFlow             from './components/AuthFlow'
import ModalManager         from './components/ModalManager'
import ModalFallback        from './components/modals/ModalFallback'
import PullToRefresh        from './components/PullToRefresh'
import SmartInputBar        from './components/SmartInputBar'
import { TripStoreProvider } from './store/TripStoreProvider'
import { AppErrorFallback } from './components/AppErrorFallback'
import { StatusBanners }    from './components/StatusBanners'
import { TravelersPanel }   from './components/TravelersPanel'
import { ChartsPanel }      from './components/ChartsPanel'
import { ExpensesPanel }    from './components/ExpensesPanel'
import { LongTermPanel }    from './components/longterm/LongTermPanel'

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
    session, ledger, trip, rates, status, picker, tripAdminPanel, filter, modals, expense, traveler, deposit, admin, invite,
    profile, isSavingProfile, saveProfile, organizerBank, longTerm, requestDeleteTraveler,
  } = useAppCoordinator()

  // نسخة محلية ليضيّق TypeScript نوعها: الوصول عبر `expense.expenseToDelete`
  // لا يُضيَّق عبر حدّ JSX، فكان سيتطلّب تأكيداً بـ `!` بلا داعٍ.
  const { expenseToDelete } = expense

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
  let screen: JSX.Element
  if (session.authLoading || !session.user) {
    screen = (
      <AuthGate
        loading={session.authLoading}
        isSigningIn={session.isSigningIn}
        signInError={session.signInError}
        onSignInGoogle={session.signInWithGoogle}
        onSignInEmail={session.signInWithEmail}
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
        loading={picker.loading}
        error={picker.error}
        currentTripId={HAS_EXPLICIT_TRIP_ID && session.hasAccess ? TRIP_ID : undefined}
        // الرجوع متاح فقط حين فُتحت الشاشة اختيارياً من داخل التطبيق — أما حين
        // كانت شاشة البداية (لا رحلة مقصودة) فلا يوجد ما يُرجع إليه أصلاً.
        onBack={picker.wasOpenedManually ? picker.hide : undefined}
        onCreateTrip={picker.onCreateTrip}
        isCreatingTrip={tripAdminPanel.isSaving}
        onShowProfile={modals.openUserProfile}
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
        currencies={rates.currencies}
        ratesUpdatedAt={rates.ratesUpdatedAt}
        cancelExpenseForm={expense.cancelExpenseForm}
        startEditExpense={expense.startEditExpense}
        requestDeleteExpense={expense.requestDeleteExpense}
        openDeposit={modals.openDeposit}
        requestDeleteTraveler={requestDeleteTraveler}
        openDepositHistory={modals.openDepositHistory}
        expenseForm={expense.newExpense}
        setExpenseForm={expense.setNewExpense}
        isExpenseFormOpen={expense.isAddingExpense}
        isEditingExpense={!!expense.editingExpense}
        submitExpense={expense.handleAddExpense}
        toggleParticipant={expense.toggleParticipant}
        toggleAllParticipants={expense.toggleAllParticipants}
      >
        <ErrorBoundary fallback={<AppErrorFallback />}>
          <div className="min-h-screen pb-20 md:pb-8">
            <Header
              isSyncing={status.isSyncing} isAdmin={session.isAdmin} isOrganizer={session.isOrganizer}
              // 🆕 اسم الرحلة يحلّ محلّ «مصاريف السفر» الثابت في العنوان.
              tripName={trip.name}
              displayName={profile.displayName || session.user?.displayName || null}
              email={session.user?.email ?? null}
              stats={ledger.isInitialLoading ? null : {
                totalDeposited: ledger.totalDeposited,
                totalSpent: ledger.totalSpent,
                totalRemaining: ledger.totalRemaining,
              }}
              isOnline={session.isOnline}
              // زر التبديل يظهر متى وُجدت رحلة أخرى غير المفتوحة حالياً
              onShowMyTrips={picker.trips.length > 1 ? picker.show : undefined}
              onShowProfile={modals.openUserProfile}
              onOpenAdminPanel={modals.openTripAdmin}
              onAdminSignIn={admin.openAdminSignIn}
              onSignOut={admin.handleAdminSignOut}
              onStatClick={(stat) => {
                haptic.light()
                const id =
                  stat === 'deposited' ? 'travelers-section' :
                  stat === 'spent'     ? 'expenses-section'  :
                                         'charts-section'
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
  
            <PullToRefresh onRefresh={status.handlePullToRefresh}>
              <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
  
                <OnboardingBanner />
  
                {!ledger.isInitialLoading && (
                  <NextSegmentWidget itinerary={trip.itinerary} />
                )}
  
                {/* 🆕 رحلة منتهية أو مؤرشفة: نشرح سبب اختفاء أزرار الإدخال بدل
                    تركها تختفي بلا تفسير. القواعد هي التي تمنع فعلاً، وهذا إعلام. */}
                <StatusBanners
                  tripClosedNotice={trip.tripClosedNotice}
                  isOnline={session.isOnline}
                  syncError={status.syncError}
                />
  
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
                />
  
                <ChartsPanel
                  isInitialLoading={ledger.isInitialLoading}
                  hasExpenses={ledger.activeExpenses.length > 0}
                  hasTravelers={ledger.activeTravelers.length > 0}
                  settlements={ledger.settlements}
                  categoryTotals={ledger.categoryTotals}
                  spendingTrend={ledger.spendingTrend}
                />
  
                {/* 🆕 الرحلات طويلة المدى — شرط واحد لا أكثر، ومكوّن مستقل
                    تماماً. `longTerm` هي null في الرحلة القياسية (انظر
                    useAppCoordinator.ts)، فلا يُقيَّم شيء من هذه الميزة فيها. */}
                {longTerm && (
                  <LongTermPanel
                    period={longTerm.period}
                    lastClosedPeriod={longTerm.lastClosedPeriod}
                    periodTotal={longTerm.periodTotal}
                    periodCount={longTerm.periodCount}
                    canManage={longTerm.canManage}
                    isBusy={longTerm.isClosingMonth || longTerm.isExitingTraveler}
                    hasActiveTravelers={ledger.activeTravelers.length > 0}
                    onCloseMonth={longTerm.openRollover}
                  />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="space-y-6 lg:col-span-1">
                    {/* نموذج المصروف يختفي كلياً في الرحلة المنتهية/المؤرشفة.
                        🆕 Modal (Bottom Sheet) لا قسم داخل تدفّق الصفحة بعد الآن —
                        انظر تعليق ExpenseForm في ExpenseSection.tsx وdocs/DECISIONS.md.
                        الشرط الخارجي (isAddingExpense) صريح هنا لا داخل ExpenseForm
                        وحدها: AnimatePresence يحتاج التبديل عند نقطة العرض الشرطي
                        نفسها ليكتشف الإزالة ويُشغّل حركة الخروج — نفس نمط ModalManager.tsx. */}
                    {trip.canAddExpenses && (
                      <AnimatePresence>
                        {expense.isAddingExpense && <ExpenseForm />}
                      </AnimatePresence>
                    )}
                    <BankDetailsCard bankDetails={organizerBank.bankDetails} isLoading={organizerBank.loading} />
                  </div>
  
                  <div className="lg:col-span-2">
                    <ExpensesPanel
                      isInitialLoading={ledger.isInitialLoading}
                      isAdmin={session.isAdmin}
                      canAddExpenses={trip.canAddExpenses}
                      activeExpenses={ledger.activeExpenses}
                      filteredExpenses={filter.filteredExpenses}
                      searchQuery={filter.searchQuery}
                      setSearchQuery={filter.setSearchQuery}
                      sortOrder={filter.sortOrder}
                      setSortOrder={filter.setSortOrder}
                      onOpenReports={modals.openReports}
                      onOpenTrashBin={modals.openTrashBin}
                      onOpenExpenseForm={expense.openExpenseForm}
                    />
                  </div>
                </div>
              </main>
            </PullToRefresh>
  
            <SmartInputBar
              visible={!ledger.isInitialLoading && !expense.isAddingExpense && trip.canAddExpenses}
              onQuickAdd={expense.handleQuickAddExpense}
              onExpand={expense.openExpenseForm}
            />
  
            <ModalManager
              modal={modals.modal}
              closeModal={modals.closeModal}
              closeDeposit={deposit.closeDeposit}
              confirmDeleteTraveler={traveler.confirmDeleteTraveler}
              reports={{
                travelers: ledger.activeTravelers,
                expenses: ledger.activeExpenses,
                balances: ledger.balances,
                settlements: ledger.settlements,
                categoryTotals: ledger.categoryTotals,
                itinerary: trip.itinerary,
              }}
              deposit={{
                amount: deposit.depositAmount, setAmount: deposit.setDepositAmount,
                mode: deposit.depositMode, setMode: deposit.setDepositMode,
                reason: deposit.depositReason, setReason: deposit.setDepositReason,
                onSubmit: deposit.handleAddDeposit,
              }}
              trash={{
                deletedExpenses: ledger.deletedExpenses,
                deletedTravelers: ledger.deletedTravelers,
                onRestoreExpense: expense.handleRestoreExpense,
                onRestoreTraveler: traveler.handleRestoreTraveler,
              }}
              tripAdmin={{
                currentTripId: TRIP_ID,
                viewerRole: tripAdminPanel.viewerRole,
                trips: tripAdminPanel.trips,
                loading: tripAdminPanel.loading,
                error: tripAdminPanel.error,
                isSaving: tripAdminPanel.isSaving,
                onSaveTripName: tripAdminPanel.saveTripName,
                onSaveItinerary: tripAdminPanel.saveItinerary,
                onCreateTrip: tripAdminPanel.createTrip,
                onSaveTripStatus: tripAdminPanel.saveTripStatus,
                onDeleteTrip: tripAdminPanel.deleteTrip,
                onRemoveMember: tripAdminPanel.removeMember,
                onSetMemberRole: tripAdminPanel.setMemberRole,
                onLinkTravelerAccount: tripAdminPanel.linkTravelerAccount,
                onExportBackup: tripAdminPanel.exportBackup,
                onRestoreTrip: tripAdminPanel.restoreTrip,
                onCreateInvite: tripAdminPanel.createInvite,
                onRevokeInvite: tripAdminPanel.revokeInvite,
                showToast: status.showToast,
              }}
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
  
            <AnimatePresence>
              {expenseToDelete !== null && (
                <ConfirmModal
                  key="confirm-delete-expense"
                  title="تأكيد الحذف?"
                  onConfirm={() => expense.confirmDelete(expenseToDelete)}
                  onCancel={() => expense.setExpenseToDelete(null)}
                />
              )}
            </AnimatePresence>
            <AuthFlow open={admin.showAdminSignIn} modalProps={admin.adminModalProps} />
  
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
