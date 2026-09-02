// 🆕 مُجمِّع عرض المودالات — استُخرج من App.tsx.
// يستهلك حالة المودال الموحّدة (modal من useModals) ويعرض المودالات العامة
// المرتبطة بالرحلة المفتوحة: التقارير، حذف مسافر، الإيداع، سجل الإيداع، سلة
// المهملات، تعديل الرحلة. مكوّن عرضي بحت: كل البيانات والمعالجات تُمرَّر إليه
// من App (حيث تعيش لأنها تلمس Firestore/الـ contexts).
//
// خارج النطاق عمداً: تأكيد حذف المصروف (ضمن useExpenseActions) وتسجيل دخول
// المسؤول (AuthFlow) — كلاهما يبقى في App لأنهما مملوكان لنطاقيهما ولا يمرّان
// عبر useModals. 🆕 وبروفايل المستخدم العام أيضاً — يُعرض من App.tsx مباشرة لا
// من هنا، لأنه مستقل عن أي رحلة ويجب أن يبقى متاحاً حتى في شاشات لا تصل إليها
// هذه المكوّنة (مثل TripPicker لعضو بلا أي رحلة بعد — انظر App.tsx).
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
// 🆕 تعديل الرحلة — يُفتح من اسمها في الهيدر، لا من «رحلاتي». تحمل TripDetailPanel
// معها مباشرة (تكوين ما كانت TripAdminView.tsx تفعله، حُذفت)، فلا حاجة لجزء
// كسول إضافي منفصل لها.
const importEditTripModal       = () => import('./modals/EditTripModal')
// 🆕 الرحلات طويلة المدى — مؤجّلان كغيرهما، ولا يُحمَّلان إطلاقاً في رحلة
// قياسية لأن ما يفتحهما (LongTermPanel) لا يُعرض فيها أصلاً.
const importMonthlyRolloverModal = () => import('./modals/MonthlyRolloverModal')
const importExitTravelerModal    = () => import('./modals/ExitTravelerModal')

const ReportsView         = lazy(importReportsView)
const DepositModal        = lazy(importDepositModal)
const TrashBinModal       = lazy(importTrashBinModal)
const DepositHistoryModal = lazy(importDepositHistoryModal)
const EditTripModal       = lazy(importEditTripModal)
const MonthlyRolloverModal = lazy(importMonthlyRolloverModal)
const ExitTravelerModal    = lazy(importExitTravelerModal)

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
  importEditTripModal,
  importMonthlyRolloverModal,
  importExitTravelerModal,
]

interface ModalManagerProps {
  modal: ModalState
  closeModal: () => void
  // حذف مسافر (التأكيد)
  confirmDeleteTraveler: (id: number) => void
  // التقارير — بيانات العرض فقط (onClose يُدار داخلياً)
  reports: Pick<ComponentProps<typeof ReportsView>,
    'travelers' | 'expenses' | 'balances' | 'settlements' | 'categoryTotals' | 'itinerary' | 'periods' | 'lastClosedPeriod'>
  // الإيداع — حقول النموذج + الإرسال (traveler/onClose يُدارَان داخلياً)
  deposit: Pick<ComponentProps<typeof DepositModal>,
    'amount' | 'setAmount' | 'mode' | 'setMode' | 'reason' | 'setReason' | 'onSubmit'>
  closeDeposit: () => void
  // سلة المهملات
  trash: Pick<ComponentProps<typeof TrashBinModal>,
    'deletedExpenses' | 'deletedTravelers' | 'onRestoreExpense' | 'onRestoreTraveler'>
  /** 🆕 تعديل الرحلة المفتوحة حالياً — undefined لمن لا يملك صلاحيته (لا مسؤول ولا منظّم)،
   * فالمودال لا يُبنى أصلاً له حتى لو تسلّلت حالة modal.type === 'editTrip' بطريقة ما. */
  editTrip?: Omit<ComponentProps<typeof EditTripModal>, 'onClose'>
  /**
   * 🆕 الرحلات طويلة المدى — **اختياري عمداً**: الرحلة القياسية لا تمرّره
   * إطلاقاً، فلا يمكن أن يُفتح أي من مودالَي الترحيل/الخروج فيها ولو تسلّلت
   * حالة مودال بطريقة ما. غيابه هو التعطيل، لا شرطٌ في مكان بعيد.
   */
  longTerm?: {
    period: ComponentProps<typeof MonthlyRolloverModal>['period']
    movements: ComponentProps<typeof MonthlyRolloverModal>['movements']
    isClosingMonth: boolean
    isExitingTraveler: boolean
    /** منظّم الرحلة الحالية — يمرَّر لـExitTravelerModal لمنع إخراجه نفسه. */
    organizerUid?: string | null
    onConfirmRollover: () => void
    onConfirmExit: (travelerId: number, settle: boolean) => void
  }
}

export default function ModalManager({
  modal, closeModal, confirmDeleteTraveler, reports, deposit, closeDeposit, trash, editTrip, longTerm,
}: ModalManagerProps) {
  // اشتقاق الحمولة من الحالة كثوابت محلية — يضمن حفظ التضييق (narrowing) داخل الإغلاقات
  const deleteTarget    = modal.type === 'deleteTraveler'  ? modal.traveler : null
  const depositTraveler = modal.type === 'deposit'         ? modal.traveler : null
  const historyTraveler = modal.type === 'depositHistory'  ? modal.traveler : null
  const exitTarget      = modal.type === 'exitTraveler'    ? modal.traveler : null

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
        {editTrip && modal.type === 'editTrip' && (
          <Suspense key="edit-trip" fallback={<ModalFallback />}>
            <EditTripModal {...editTrip} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {longTerm && modal.type === 'monthlyRollover' && (
          <Suspense key="monthly-rollover" fallback={<ModalFallback />}>
            <MonthlyRolloverModal
              period={longTerm.period}
              movements={longTerm.movements}
              isSubmitting={longTerm.isClosingMonth}
              onConfirm={longTerm.onConfirmRollover}
              onClose={closeModal}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {longTerm && exitTarget && (
          <Suspense key="exit-traveler" fallback={<ModalFallback />}>
            <ExitTravelerModal
              traveler={exitTarget}
              isSubmitting={longTerm.isExitingTraveler}
              organizerUid={longTerm.organizerUid}
              onConfirm={(settle) => longTerm.onConfirmExit(exitTarget.id, settle)}
              onClose={closeModal}
            />
          </Suspense>
        )}
      </AnimatePresence>

    </>
  )
}
