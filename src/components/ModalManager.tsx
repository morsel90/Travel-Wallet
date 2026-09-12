// 🆕 مُجمِّع عرض المودالات — استُخرج من App.tsx.
// يستهلك حالة المودال الموحّدة (modal من useModals) ويعرض المودالات العامة
// المرتبطة بالرحلة المفتوحة: التقارير، سلة المهملات، تعديل الرحلة، الإحصائيات،
// المسار، والرحلات طويلة المدى. مكوّن عرضي بحت: كل البيانات والمعالجات تُمرَّر
// إليه من App (حيث تعيش لأنها تلمس Firestore/الـ contexts).
//
// 🆕 **ثلاث نوافذ غادرت هذا الملف**: تأكيد حذف المسافر، تعديل الرصيد، وسجل
// تعديلات الرصيد — انظر أسباب كلٍّ منها في رأس `hooks/useModals.ts`. ولم يعد
// هنا أي `ConfirmModal`: كلا الحذفين (مصروف ومسافر) ليّن ويحمل «تراجع».
//
// خارج النطاق عمداً: بروفايل المستخدم — يبقى في App لأنه مملوك
// لنطاقه ولا يمرّ عبر useModals. 🆕 وبروفايل المستخدم العام أيضاً — يُعرض من App.tsx مباشرة لا
// من هنا، لأنه مستقل عن أي رحلة ويجب أن يبقى متاحاً حتى في شاشات لا تصل إليها
// هذه المكوّنة (مثل TripPicker لعضو بلا أي رحلة بعد — انظر App.tsx).
import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'
import { AnimatePresence } from 'motion/react'
import ModalFallback from './modals/ModalFallback'
import type { ModalState } from '../hooks/useModals'

// ⚠️ دوال الاستيراد مُسمّاة ومُعاد استخدامها في modalImporters أدناه بدل تكرارها:
// التحميل المسبق يجب أن يستورد *نفس* المُعرّف حرفياً وإلا سحب وحدة أخرى وبقي
// الجزء الحقيقي بلا تحميل (انظر preloadAll في utils/preload.ts).
const importReportsView         = () => import('./reports/ReportsView')
const importTrashBinModal       = () => import('./modals/TrashBinModal')
// 🆕 تعديل الرحلة — يُفتح من اسمها في الهيدر، لا من «رحلاتي». تحمل TripDetailPanel
// معها مباشرة (تكوين ما كانت TripAdminView.tsx تفعله، حُذفت)، فلا حاجة لجزء
// كسول إضافي منفصل لها.
const importEditTripModal       = () => import('./modals/EditTripModal')
// 🆕 الرحلات طويلة المدى — مؤجّلان كغيرهما، ولا يُحمَّلان إطلاقاً في رحلة
// قياسية لأن ما يفتحهما (LongTermPanel) لا يُعرض فيها أصلاً.
const importMonthlyRolloverModal = () => import('./modals/MonthlyRolloverModal')
const importExitTravelerModal    = () => import('./modals/ExitTravelerModal')
// 🆕 الثلاثة الآتية كانت أقساماً في تدفّق الشاشة الرئيسية وانتقلت خلف زرّ
// «المزيد» (MoreMenu.tsx). ChartsModal يستورد ChartsSection استيراداً ثابتاً
// فيسافران معاً في حزمة واحدة — وهذا ما يُبقي التحميل المسبق (chartsImporters
// سابقاً، modalImporters الآن) مغطّياً للحالة التي عالجها utils/preload.ts.
const importChartsModal    = () => import('./modals/ChartsModal')
const importItineraryModal = () => import('./modals/ItineraryModal')
const importLongTermModal  = () => import('./modals/LongTermModal')

const ReportsView         = lazy(importReportsView)
const TrashBinModal       = lazy(importTrashBinModal)
const EditTripModal       = lazy(importEditTripModal)
const MonthlyRolloverModal = lazy(importMonthlyRolloverModal)
const ExitTravelerModal    = lazy(importExitTravelerModal)
const ChartsModal          = lazy(importChartsModal)
const ItineraryModal       = lazy(importItineraryModal)
const LongTermModal        = lazy(importLongTermModal)

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
  importTrashBinModal,
  importEditTripModal,
  importMonthlyRolloverModal,
  importExitTravelerModal,
  importChartsModal,
  importItineraryModal,
  importLongTermModal,
]

interface ModalManagerProps {
  modal: ModalState
  closeModal: () => void
  // التقارير — بيانات العرض فقط (onClose يُدار داخلياً)
  reports: Pick<ComponentProps<typeof ReportsView>,
    'travelers' | 'expenses' | 'balances' | 'settlements' | 'categoryTotals' | 'itinerary' | 'periods'>
  // سلة المهملات
  trash: Pick<ComponentProps<typeof TrashBinModal>,
    'deletedExpenses' | 'deletedTravelers' | 'onRestoreExpense' | 'onRestoreTraveler'>
  /** 🆕 تعديل الرحلة المفتوحة حالياً — undefined لمن لا يملك صلاحيته (لا مسؤول ولا منظّم)،
   * فالمودال لا يُبنى أصلاً له حتى لو تسلّلت حالة modal.type === 'editTrip' بطريقة ما. */
  editTrip?: Omit<ComponentProps<typeof EditTripModal>, 'onClose'>
  /** 🆕 «الإحصائيات» — قسم سابق في الشاشة، صار نافذة خلف زرّ «المزيد». */
  charts: Omit<ComponentProps<typeof ChartsModal>, 'onClose'>
  /** 🆕 «مسار الرحلة» — يجمع المقطع القادم وقائمة المقاطع الكاملة. */
  itinerary: Omit<ComponentProps<typeof ItineraryModal>, 'onClose'>
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
  /** 🆕 «الشهر المحاسبي» كنافذة — نفس شرط `longTerm` أعلاه: غيابه هو التعطيل. */
  longTermPanel?: Omit<ComponentProps<typeof LongTermModal>, 'onClose'>
}

export default function ModalManager({
  modal, closeModal, reports, trash, editTrip,
  charts, itinerary, longTerm, longTermPanel,
}: ModalManagerProps) {
  // اشتقاق الحمولة من الحالة كثابت محلي — يضمن حفظ التضييق (narrowing) داخل الإغلاقات
  const exitTarget = modal.type === 'exitTraveler' ? modal.traveler : null

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
        {modal.type === 'charts' && (
          <Suspense key="charts" fallback={<ModalFallback />}>
            <ChartsModal {...charts} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal.type === 'itinerary' && (
          <Suspense key="itinerary" fallback={<ModalFallback />}>
            <ItineraryModal {...itinerary} onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {longTermPanel && modal.type === 'longTermPanel' && (
          <Suspense key="long-term-panel" fallback={<ModalFallback />}>
            <LongTermModal {...longTermPanel} onClose={closeModal} />
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
