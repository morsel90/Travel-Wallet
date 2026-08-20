import { Luggage, ChevronLeft, Loader2, AlertTriangle, PieChart, ArrowRight } from '../icons'
import type { MyTrip } from '../hooks/useMyTrips'
import { TRIP_STATUS_LABEL } from '../types'
import { tripUrl } from '../utils/tripId'
import { haptic } from '../utils/haptics'

// ─── TripPicker — شاشة «رحلاتي» ──────────────────────────────────────────────
// 🆕 قائمة الرحلات التي انضم لها المستخدم، على نمط قائمة المحادثات في تطبيقات
// المراسلة: يرى أسماء رحلاته ويضغط أياً منها للدخول.
//
// ⚠️ فرق جوهري عن ذلك النمط يجب ألا يُنسى عند التعديل هنا: هذه ليست قائمة بكل
// الرحلات الموجودة، بل برحلات *هذا المستخدم* وحده (مصدرها خريطة trips في
// claims توكنه). عرض كل الرحلات لغير المسؤول ليس خياراً: مستند الرحلة يحوي
// تفاصيل الحساب البنكي (اسم المستفيد والآيبان)، وقائمة عامة تعني كشفها لأي
// زائر.
//
// الدخول لرحلة جديدة يبقى عبر رابط دعوة من منظّم الرحلة — لا مسار انضمام ذاتي
// آخر بعد إلغاء رمز الرحلة (انظر docs/DECISIONS.md). الانضمام خطوة لمرة
// واحدة: بعد استهلاك الرابط تُحفظ العضوية في claims الحساب ويدخل المستخدم
// مباشرةً في كل زيارة لاحقة (انظر useAuth).

interface TripPickerProps {
  trips: MyTrip[]
  loading: boolean
  error: string | null
  /** الرحلة المفتوحة حالياً إن وُجدت — تُبرز في القائمة ولا تُعاد الملاحة إليها. */
  currentTripId?: string
  /** يُمرَّر فقط حين فُتحت الشاشة اختيارياً من داخل رحلة — لا حين كانت شاشة البداية. */
  onBack?: () => void
}

const TripPicker = ({ trips, loading, error, currentTripId, onBack }: TripPickerProps) => {
  // التبديل بين الرحلات يتطلب إعادة تحميل كاملة: TRIP_ID يُقرأ مرة واحدة عند
  // تحميل الوحدة (utils/tripId.ts)، فلا يوجد تبديل حيّ داخل نفس الجلسة.
  const openTrip = (tripId: string) => {
    haptic.light()
    window.location.href = tripUrl(tripId)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-teal-700 text-white shadow-md">
        <div className="max-w-md mx-auto px-5 py-4 flex items-center gap-2.5">
          <PieChart className="w-6 h-6 text-teal-100 shrink-0" />
          <h1 className="font-bold text-lg flex-1">رحلاتي</h1>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="العودة للرحلة"
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
            >
              <ArrowRight className="w-3.5 h-3.5" /> رجوع
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            <p className="text-sm font-bold">جارٍ جلب رحلاتك...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 text-rose-800 p-4 rounded-2xl text-sm border border-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        ) : trips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Luggage className="w-7 h-7 text-slate-400" />
            </div>
            <h2 className="font-bold text-slate-800 mb-2">لم تنضم لأي رحلة بعد</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              للانضمام لرحلة، اطلب رابط دعوة من منظّم الرحلة. بعد الانضمام مرة
              واحدة ستجدها هنا دائماً.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {trips.map(trip => {
              const isCurrent = trip.id === currentTripId
              return (
                <li key={trip.id}>
                  <button
                    type="button"
                    onClick={() => openTrip(trip.id)}
                    className={`w-full bg-white rounded-2xl border p-4 flex items-center gap-3.5 text-right transition-all shadow-sm hover:shadow-md active:scale-[0.99] ${
                      isCurrent ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    <span className="w-11 h-11 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
                      {trip.name.trim()[0] ?? '؟'}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800 truncate leading-tight">
                        {trip.name}
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        {isCurrent && (
                          <span className="text-[11px] font-bold text-teal-600">الرحلة المفتوحة حالياً</span>
                        )}
                        {/* الحالة تُعرض فقط حين تكون غير نشطة — لا فائدة من وسم كل رحلة عادية */}
                        {trip.status !== 'active' && (
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                            {TRIP_STATUS_LABEL[trip.status]}
                          </span>
                        )}
                      </span>
                    </span>

                    <ChevronLeft className="w-5 h-5 text-slate-300 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !error && trips.length > 0 && (
          <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed px-4">
            للانضمام لرحلة أخرى، افتح رابط دعوتها.
          </p>
        )}
      </main>
    </div>
  )
}

export default TripPicker
