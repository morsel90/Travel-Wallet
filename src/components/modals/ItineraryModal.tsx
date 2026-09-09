// 🆕 «مسار الرحلة» كنافذة لا كقسم في الشاشة الرئيسية.
//
// يجمع ما كان مبعثراً في مكانين: بطاقة «المقطع القادم» (NextSegmentWidget، كانت
// أعلى الشاشة الرئيسية) وقائمة المسار الكاملة (ItinerarySection، كانت داخل
// التقارير فقط). المقطع القادم أولاً لأنه الجواب المطلوب في ٩٩٪ من الفتحات.
//
// 🆕 وهذه النافذة **المستدعي الوحيد** لـItinerarySection الآن: أُزيلت القائمة من
// شاشة التقارير لأنها صارت تكراراً بصرياً. جدول المسار في تقرير الطباعة
// (PrintableTripReport) شيء آخر يرسمه التقرير بنفسه، وباقٍ عن قصد.
//
// ⚠️ عرض فقط — التحرير يبقى في «إدارة الرحلة» (TripDetailPanel داخل
// EditTripModal) ولا يُكرَّر هنا: نقطة دخول واحدة لكل فعل، نفس المبدأ الذي
// أزال «تصدير Excel» و«إدارة الرحلات» من مواضعهما المكرَّرة.
import { X, Route } from '../../icons'
import { Modal } from '../Modal'
import EmptyState from '../EmptyState'
import { NextSegmentWidget } from '../NextSegmentWidget'
import { ItinerarySection } from '../ItinerarySection'
import type { ItinerarySegment } from '../../types'

interface ItineraryModalProps {
  itinerary?: ItinerarySegment[]
  /** يفتح «إدارة الرحلة» لمن يملك صلاحية التحرير — undefined لغيره فلا يظهر الزرّ. */
  onEditItinerary?: () => void
  onClose: () => void
}

export default function ItineraryModal({ itinerary, onEditItinerary, onClose }: ItineraryModalProps) {
  const hasSegments = !!itinerary && itinerary.length > 0

  return (
    <Modal onClose={onClose} label="مسار الرحلة" maxWidth="max-w-2xl">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Route className="w-5 h-5 text-teal-600" /> مسار الرحلة
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق مسار الرحلة"
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {hasSegments ? (
        <div className="space-y-4">
          {/* يعيد null من تلقائه حين تكون كل المقاطع في الماضي — لا شرط هنا. */}
          <NextSegmentWidget itinerary={itinerary} />
          <ItinerarySection itinerary={itinerary} />
        </div>
      ) : (
        <EmptyState
          Icon={Route}
          title="لا يوجد مسار لهذه الرحلة"
          description="أضف مقاطع التنقّل (طيران، سيارة، قطار، حافلة) من «إدارة الرحلة» ليظهر هنا مع عدّ تنازلي للمقطع القادم."
          actionLabel={onEditItinerary ? 'إدارة الرحلة' : undefined}
          onAction={onEditItinerary}
          ActionIcon={onEditItinerary ? Route : undefined}
        />
      )}
    </Modal>
  )
}
