import { Plane, Car, Train, Bus, Route } from '../icons'
import type { ItinerarySegment } from '../types'

interface ItinerarySectionProps {
  // يُمرَّر من ReportsView (المصدر: useTripConfig في App) بدل الاشتراك المكرر داخل المكوّن
  itinerary?: ItinerarySegment[]
}

// تسميات وسائل النقل
const TRANSPORT_LABEL: Record<ItinerarySegment['mode'], string> = {
  flight: 'رحلة جوية', car: 'سيارة', train: 'قطار', bus: 'حافلة',
}

// تنسيق واضح للمسافر: تقويم ميلادي + أرقام لاتينية + وقت 24 ساعة (بلا ص/م المربكة)،
// مع فصل التاريخ (اسم اليوم) عن الوقت وإبراز الوقت. اللغويات: ar-SA-u-ca-gregory-nu-latn
const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(DT_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(DT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })

export const ItinerarySection = ({ itinerary }: ItinerarySectionProps) => {
  if (!itinerary || itinerary.length === 0) return null

  const getTransportIcon = (mode: ItinerarySegment['mode']) => {
    switch (mode) {
      case 'flight': return <Plane className="w-4 h-4" />
      case 'car':    return <Car className="w-4 h-4" />
      case 'train':  return <Train className="w-4 h-4" />
      case 'bus':    return <Bus className="w-4 h-4" />
      default:       return null
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
        <Route className="w-5 h-5 text-teal-600" /> مسار الرحلة
      </h2>

      <div className="space-y-3">
        {itinerary.map(segment => (
          <div key={segment.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-teal-100 text-teal-700 shrink-0">
                  {getTransportIcon(segment.mode)}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-400">{TRANSPORT_LABEL[segment.mode]}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{segment.identifier}</p>
                </div>
              </div>
              {segment.reference && (
                <span
                  dir="ltr"
                  className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-lg shrink-0 tabular-nums"
                >
                  {segment.mode === 'flight' ? 'PNR' : 'Ref'} {segment.reference}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg border border-slate-100 p-2.5 min-w-0">
                <p className="text-[11px] font-bold text-slate-400 mb-0.5">الانطلاق من</p>
                <p className="text-sm font-bold text-slate-700 truncate">{segment.departure.location}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{fmtDate(segment.departure.time)}</span>
                  <span dir="ltr" className="text-sm font-black text-slate-800 tabular-nums">{fmtTime(segment.departure.time)}</span>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-slate-100 p-2.5 min-w-0">
                <p className="text-[11px] font-bold text-slate-400 mb-0.5">الوصول إلى</p>
                <p className="text-sm font-bold text-slate-700 truncate">{segment.arrival.location}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{fmtDate(segment.arrival.time)}</span>
                  <span dir="ltr" className="text-sm font-black text-slate-800 tabular-nums">{fmtTime(segment.arrival.time)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
