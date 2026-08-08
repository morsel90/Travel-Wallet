import { useContext } from 'react'
import { DataContext } from '../context/DataContext'
import { useTripConfig } from '../hooks/useTripConfig'
import { Plane, Car, Train, Bus } from '../icons'
import type { ItinerarySegment } from '../types'

export const NextSegmentWidget = () => {
  const context = useContext(DataContext)
  const user = context?.user || null
  // useTripConfig يُرجع TripConfig التي تحوي itinerary مباشرةً — لا حاجة لأي cast
  const tripConfig = useTripConfig(user)

  if (!tripConfig?.itinerary || tripConfig.itinerary.length === 0) return null

  // جلب الوقت الحالي للبحث عن الرحلة القادمة فقط
  const now = new Date().getTime()
  const nextSegment = tripConfig.itinerary.find(
    (seg: ItinerarySegment) => new Date(seg.departure.time).getTime() > now
  )

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