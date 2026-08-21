// 🆕 مُجمِّع عرض المودالات — استُخرج من App.tsx.
// يستهلك حالة المودال الموحّدة (modal من useModals) ويعرض المودالات الخمسة العامة:
// التقارير، حذف مسافر، الإيداع، سجل الإيداع، سلة المهملات.
// مكوّن عرضي بحت: كل البيانات والمعالجات تُمرَّر إليه من App (حيث تعيش لأنها تلمس Firestore/الـ contexts).
//
// خارج النطاق عمداً: تأكيد حذف المصروف (ضمن useExpenseActions) وتسجيل دخول المسؤول (AuthFlow) —
// كلاهما يبقى في App لأنهما مملوكان لنطاقيهما ولا يمرّان عبر useModals.
import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ConfirmModal } from './Modal'
import ModalFallback from './modals/ModalFallback'
import type { ModalState } from '../hooks/useModals'

// ⚠️ دوال الاستيراد مُسمّاة ومُعاد استخدامها في modalImporters أدناه بدل تكرارها:
// التحميل المسبق يجب أن يستورد *نفس* المُعرّف حرفياً وإلا سحب وحدة أخرى وبقي
// الجزء الحقيقي بلا تحميل (انظر preloadAll في utils/preload.ts).
const importReportsView         = () => import('./reports/ReportsView')
const importDepositModal        = () => import('./modals/DepositModal')
const importTrashBinModal       = () => import('./modals/TrashBinModal')
const importDepositHistoryModal = () => import('./modals/DepositHistoryModal')
const importTripAdminView       = () => import('./admin/TripAdminView')
const importUserProfileModal    = () => import('./modals/UserProfileModal')

const ReportsView         = lazy(importReportsView)
const DepositModal        = lazy(importDepositModal)
const TrashBinModal       = lazy(importTrashBinModal)
const DepositHistoryModal = lazy(importDepositHistoryModal)
const TripAdminView       = lazy(importTripAdminView)
const UserProfileModal    = lazy(importUserProfileModal)

/**
 * 🆕 أجزاء المودالات للتحميل المسبق الهادئ — تُستهلك من App.tsx.
 * تعيش هنا بجوار `lazy()` عمداً: تغيير مسار أعلاه يظهر أثره هنا فوراً، بينما
 * قائمة مسارات في ملف بعيد كانت ستنحرف بصمت وتُبطل التحميل المسبق دون أن يلاحظ أحد.
 */
// مقايضة مقصودة مع Fast Refresh: نقل هذه القائمة لملف منفصل يُرضي القاعدة لكنه
// يفصل المسارات عن `lazy()` أعلاه، فتنحرف بصمت عند أي إعادة تسمية ويتوقف التحميل
// المسبق دون أن يفشل شيء ظاهرياً. الكلفة هنا إعادة تحميل كاملة عند تحرير هذا
// الملف أثناء التطوير فقط.
// eslint-disable-next-line react-refresh/only-export-components
export const modalImporters = [
  importReportsView,
  importDepositModal,
  importTrashBinModal,
  importDepositHistoryModal,
  importTripAdminView,
  importUserProfileModal,
]

interface ModalManagerProps {
  modal: ModalState
  closeModal: () => void
  // حذف مسافر (التأكيد)
  confirmDeleteTraveler: (id: number) => void
  // التقارير — بيانات العرض فقط (onClose يُدار داخلياً)
  reports: Pick<ComponentProps<typeof ReportsView>,
    'travelers' | 'expenses' | 'balances' | 'settlements' | 'categoryTotals' | 'itinerary'>
  // الإيداع — حقول النموذج + الإرسال (traveler/onClose يُدارَان داخلياً)
  deposit: Pick<ComponentProps<typeof DepositModal>,
    'amount' | 'setAmount' | 'mode' | 'setMode' | 'reason' | 'setReason' | 'onSubmit'>
  closeDeposit: () => void
  // سلة المهملات
  trash: Pick<ComponentProps<typeof TrashBinModal>,
    'deletedExpenses' | 'deletedTravelers' | 'onRestoreExpense' | 'onRestoreTraveler'>
  // 🆕 إدارة الرحلات — للمسؤول فقط (onClose يُدار داخلياً)
  tripAdmin: Omit<ComponentProps<typeof TripAdminView>, 'onClose'>
  // 🆕 بروفايل المستخدم العام (onClose يُدار داخلياً)
  userProfile: Omit<ComponentProps<typeof UserProfileModal>, 'onClose'>
}

export default function ModalManager({
  modal, closeModal, confirmDeleteTraveler, reports, deposit, closeDeposit, trash, tripAdmin, userProfile,
}: ModalManagerProps) {
  // اشتقاق الحمولة من الحالة كثوابت محلية — يضمن حفظ التضييق (narrowing) داخل الإغلاقات
  const deleteTarget    = modal.type === 'deleteTraveler'  ? modal.traveler : null
  const depositTraveler = modal.type === 'deposit'         ? modal.traveler : null
  const historyTraveler = modal.type === 'depositHistory'  ? modal.traveler : null

  return (
    <>
      <AnimatePresence>
        {modal.type === 'reports' && (
          <Suspense key="reports" fallback={<ModalFallback />}>
            <ReportsView {...reports} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmModal
            key="confirm-delete-traveler"
            title={`حذف ${deleteTarget.name}؟`}
            message="سيتم نقل هذا المسافر إلى سلة المحذوفات لحماية سجل مصاريفه وحساباته السابقة."
            onConfirm={() => confirmDeleteTraveler(deleteTarget.id)}
            onCancel={closeModal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {depositTraveler && (
          <Suspense key="deposit" fallback={<ModalFallback />}>
            <DepositModal traveler={depositTraveler} {...deposit} onClose={closeDeposit} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyTraveler && (
          <Suspense key="deposit-history" fallback={<ModalFallback />}>
            <DepositHistoryModal
              travelerId={historyTraveler.id}
              travelerName={historyTraveler.name}
              onClose={closeModal}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal.type === 'trashBin' && (
          <Suspense key="trash-bin" fallback={<ModalFallback />}>
            <TrashBinModal {...trash} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal.type === 'tripAdmin' && (
          <Suspense key="trip-admin" fallback={<ModalFallback />}>
            <TripAdminView {...tripAdmin} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal.type === 'userProfile' && (
          <Suspense key="user-profile" fallback={<ModalFallback />}>
            <UserProfileModal {...userProfile} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  )
}
