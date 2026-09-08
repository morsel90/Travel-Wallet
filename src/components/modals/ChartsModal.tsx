// 🆕 «الإحصائيات» كنافذة لا كقسم في الشاشة الرئيسية.
//
// ⚠️ ChartsSection يُستورد هنا **استيراداً ثابتاً لا كسولاً**: هذا الملف نفسه
// هو الجزء المؤجّل (lazy في ModalManager)، فيسافران في حزمة واحدة ويغطّيهما
// التحميل المسبق (modalImporters → preloadAll) بنداء واحد. جزء كسول داخل جزء
// كسول كان سيعيد المشكلة التي عالجها utils/preload.ts أصلاً.
import { X, PieChart } from '../../icons'
import { Modal } from '../Modal'
import EmptyState from '../EmptyState'
import ChartsSection from '../charts/ChartsSection'
import type { CategoryTotal, SpendingTrendPoint } from '../../types'

interface ChartsModalProps {
  categoryTotals: CategoryTotal[]
  spendingTrend: SpendingTrendPoint[]
  /** لا مصاريف = لا رسوم بيانية، ونقول ذلك بدل عرض بطاقة فارغة بلا تفسير. */
  hasExpenses: boolean
  onClose: () => void
}

export default function ChartsModal({
  categoryTotals, spendingTrend, hasExpenses, onClose,
}: ChartsModalProps) {
  return (
    <Modal onClose={onClose} label="إحصائيات الرحلة" maxWidth="max-w-2xl">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-teal-600" /> إحصائيات الرحلة
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الإحصائيات"
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {hasExpenses ? (
        <ChartsSection categoryTotals={categoryTotals} spendingTrend={spendingTrend} />
      ) : (
        <EmptyState
          Icon={PieChart}
          title="لا توجد إحصائيات بعد"
          description="سجّل أول مصروف للرحلة لعرض توزيع المصاريف حسب الفئة وتطوّرها الزمني."
        />
      )}
    </Modal>
  )
}
