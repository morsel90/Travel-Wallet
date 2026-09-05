// 🆕 تعديل الرحلة المفتوحة حالياً — يُفتح بالضغط على اسمها في الهيدر
// (Header.tsx)، لا من قائمة «رحلاتي» (تلك تنقّل بحت الآن). لوحة كاملة الشاشة
// لا نافذة مركزية صغيرة (Modal.tsx): TripDetailPanel كثيف المحتوى (ثلاثة
// تبويبات بعد الدمج — إعدادات الرحلة، مسار الرحلة، المسافرون — ومعها محرّر
// المسار وقوائم المسافرين) ويحتاج المساحة التي كانت TripAdminView.tsx (حُذفت)
// تمنحه — نفس الغلاف حرفياً، لكن لرحلة واحدة بلا قائمة يُرجَع إليها.
//
// ⚠️ لتعديل رحلة أخرى غير المفتوحة حالياً: افتحها أولاً من «رحلاتي» (المسؤول
// يرى كل الرحلات هناك ويدخل أيّاً منها)، ثم عدّلها من هنا بعد أن تصبح هي
// المفتوحة. انظر docs/DECISIONS.md.
import { motion } from 'framer-motion'
import { X } from '../../icons'
import TripDetailPanel from '../admin/TripDetailPanel'
import type { ComponentProps } from 'react'

/**
 * 🆕 نفس خصائص TripDetailPanel حرفياً — بما فيها onDeleted الخاصة به: App.tsx
 * يمرّرها كإعادة توجيه كاملة لمسار بلا `?trip=` (الرحلة المفتوحة حذفت نفسها)،
 * لا مجرّد إغلاق. onClose هنا مستقلة تماماً — زرّ X العادي (إلغاء بلا حذف).
 */
type EditTripModalProps = ComponentProps<typeof TripDetailPanel> & { onClose: () => void }

export default function EditTripModal({ onClose, ...panelProps }: EditTripModalProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[9998] bg-slate-50 overflow-y-auto"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <header className="sticky top-0 z-10 bg-teal-700 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-lg truncate">{panelProps.trip.name}</h1>
            <p className="text-[11px] text-teal-100 truncate" dir="ltr">{panelProps.trip.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق تعديل الرحلة"
            className="p-2 rounded-xl bg-teal-800/60 hover:bg-teal-800 text-teal-50 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <TripDetailPanel {...panelProps} />
      </main>
    </motion.div>
  )
}
