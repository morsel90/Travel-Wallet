import { Plane, Car, Train, Bus } from '../icons'
import { findNextSegment } from '../utils/itinerary'
import type { ItinerarySegment } from '../types'

interface NextSegmentWidgetProps {
  // 🆕 يُمرَّر من App (المصدر: useTripConfig) بدل استدعاء الـ hook هنا. كان
  // المكوّن يشترك في المستند بنفسه، وبعد تحويل useTripConfig إلى onSnapshot
  // صار ذلك يعني مستمعاً حيّاً ثانياً على نفس المستند بلا داعٍ.
  itinerary?: ItinerarySegment[]
}

export const NextSegmentWidget = ({ itinerary }: NextSegmentWidgetProps) => {
  if (!itinerary || itinerary.length === 0) return null

  // findNextSegment مشتركة مع بقية أدوات المسار وتفترض قائمة مرتّبة زمنياً —
  // وهذا ما تضمنه normalizeItinerary في useTripConfig عند القراءة.
  const nextSegment = findNextSegment(itinerary)

  // إذا كانت كل الرحلات في الماضي، لا تعرض شيئاً
  if (!nextSegment) return null

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'flight': return <Plane className="w-5 h-5 text-teal-600" />
      case 'car': return <Car className="w-5 h-5 text-teal-600" />
      case 'train': return <Train className="w-5 h-5 text-teal-600" />
      case 'bus': return <Bus className="w-5 h-5 text-teal-600" />
      default: return null
    }
  }

  const depDate = new Date(nextSegment.departure.time)
  const formattedDate = depDate.toLocaleDateString('ar-SA', { weekday: 'long', month: 'short', day: 'numeric' })
  const formattedTime = depDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-4 rtl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-white p-2.5 rounded-full shadow-sm">
          {getTransportIcon(nextSegment.mode)}
        </div>
        <div>
          <p className="text-xs text-teal-700 font-bold mb-0.5">الوجهة القادمة</p>
          <p className="text-sm font-semibold text-slate-800">
            إلى {nextSegment.arrival.location}
          </p>
        </div>
      </div>
      <div className="text-left bg-white px-3 py-1.5 rounded-xl shadow-sm border border-teal-50">
        <p className="text-[10px] text-slate-500">{formattedDate}</p>
        <p className="text-sm font-bold text-slate-800" dir="ltr">{formattedTime}</p>
      </div>
    </div>
  )
}