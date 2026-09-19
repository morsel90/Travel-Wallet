import { Luggage } from '../icons'

interface TripDeletedScreenProps {
  onShowMyTrips: () => void
}

// ─── TripDeletedScreen ──────────────────────────────────────────────────────
// 🆕 رابط رحلة لم تعد موجودة — حُذفت (أو المعرّف لم يوجد قط).
//
// ⚠️ بلا هذه الشاشة كان التطبيق يفتح «رحلة شبحاً»: اسمها المعرّف الخام، بلا
// مصاريف ولا أرصدة، أو شاشة «مزامنة…» لا تنتهي. بلاغ صاحب المشروع بعد حذف
// travelapp-87206: أيقونة الشاشة الرئيسية ما زالت تحمل `?trip=` القديم. المسؤول
// يجتاز فحص العضوية لأي معرّف، والأعضاء القدامى كانوا يحملون claim الرحلة
// المحذوفة، فلا شيء كان يوقفهم قبل هذه الشاشة.
export default function TripDeletedScreen({ onShowMyTrips }: TripDeletedScreenProps) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Luggage className="w-6 h-6 text-slate-500" />
        </div>

        <h1 className="text-lg font-bold text-slate-800 mb-1">هذه الرحلة حُذفت</h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          إن فتحتها من أيقونة على الشاشة الرئيسية، احذف الأيقونة وأضف التطبيق من جديد.
        </p>

        <button
          type="button"
          onClick={onShowMyTrips}
          className="mt-4 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-xs"
        >
          رحلاتي
        </button>
      </div>
    </div>
  )
}
