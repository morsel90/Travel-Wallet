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

const ReportsView         = lazy(() => import('./reports/ReportsView'))
const DepositModal        = lazy(() => import('./modals/DepositModal'))
const TrashBinModal       = lazy(() => import('./modals/TrashBinModal'))
const DepositHistoryModal = lazy(() => import('./modals/DepositHistoryModal'))

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
}

export default function ModalManager({
  modal, closeModal, confirmDeleteTraveler, reports, deposit, closeDeposit, trash,
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
    </>
  )
}
