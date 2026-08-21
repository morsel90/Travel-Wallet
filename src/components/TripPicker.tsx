import { useState } from 'react'
import { Luggage, ChevronLeft, Loader2, AlertTriangle, PieChart, ArrowRight, Plus, User } from '../icons'
import type { MyTrip } from '../hooks/useMyTrips'
import { TRIP_STATUS_LABEL } from '../types'
import { tripUrl } from '../utils/tripId'
import { haptic } from '../utils/haptics'
import NewTripForm from './admin/NewTripForm'

// ─── TripPicker — شاشة «رحلاتي» ──────────────────────────────────────────────
// 🆕 قائمة الرحلات التي انضم لها المستخدم، على نمط قائمة المحادثات في تطبيقات
// المراسلة: يرى أسماء رحلاته ويضغط أياً منها للدخول.
//
// ⚠️ فرق جوهري عن ذلك النمط يجب ألا يُنسى عند التعديل هنا: هذه ليست قائمة بكل
// الرحلات الموجودة، بل برحلات *هذا المستخدم* وحده (مصدرها خريطة trips في
// claims توكنه). عرض كل الرحلات لغير المسؤول ليس خياراً — لا مبرر له.
//
// 🆕 الدخول لرحلة أخرى إما برابط دعوة من منظّمها، أو بإنشاء رحلة جديدة بنفسك
// من هنا مباشرة (نموذج واتساب: من يُنشئ يصبح منظّم رحلته تلقائياً — انظر
// functions/index.js manageTrip mode: 'create'، وdocs/DECISIONS.md/الخطة
// المعتمدة لهذا التغيير). لا يوجد اليوم مسار انضمام ذاتي لرحلة *موجودة* بلا
// دعوة — هذا لم يتغيّر.

interface TripPickerProps {
  trips: MyTrip[]
  loading: boolean
  error: string | null
  /** الرحلة المفتوحة حالياً إن وُجدت — تُبرز في القائمة ولا تُعاد الملاحة إليها. */
  currentTripId?: string
  /** يُمرَّر فقط حين فُتحت الشاشة اختيارياً من داخل رحلة — لا حين كانت شاشة البداية. */
  onBack?: () => void
  /** 🆕 إنشاء ذاتي — متاح لأي مستخدم مسجّل دخوله، لا المسؤول فقط. */
  onCreateTrip: (tripId: string, name: string) => Promise<boolean>
  isCreatingTrip: boolean
  /**
   * 🆕 فتح شاشة البروفايل (اسم/بنك) — هذه هي نقطة الدخول الوحيدة إليها لعضو
   * بلا أي رحلة بعد (Header/AccountMenu لا يُعرَضان قبل الانضمام لرحلة). بالضبط
   * من يحتاج تعبئة بروفايله *قبل* إنشاء أول رحلة ذاتياً — انظر docs/DECISIONS.md.
   */
  onShowProfile: () => void
}

const TripPicker = ({
  trips, loading, error, currentTripId, onBack,
  onCreateTrip, isCreatingTrip, onShowProfile,
}: TripPickerProps) => {
  const [isCreating, setIsCreating] = useState(false)

  // التبديل بين الرحلات يتطلب إعادة تحميل كاملة: TRIP_ID يُقرأ مرة واحدة عند
  // تحميل الوحدة (utils/tripId.ts)، فلا يوجد تبديل حيّ داخل نفس الجلسة.
  const openTrip = (tripId: string) => {
    haptic.light()
    window.location.href = tripUrl(tripId)
  }

  // 🆕 بعد الإنشاء الذاتي، يدخل المُنشئ رحلته مباشرة — لا يبقى في القائمة
  // ليضغط عليها يدوياً. نفس التنقّل الكامل الذي تفعله openTrip أعلاه.
  const handleCreate = async (tripId: string, name: string) => {
    const ok = await onCreateTrip(tripId, name)
    if (ok) openTrip(tripId)
    return ok
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-teal-700 text-white shadow-md">
        <div className="max-w-md mx-auto px-5 py-4 flex items-center gap-2.5">
          <PieChart className="w-6 h-6 text-teal-100 shrink-0" />
          <h1 className="font-bold text-lg flex-1">رحلاتي</h1>
          {!isCreating && (
            <button
              type="button"
              onClick={() => { haptic.light(); onShowProfile() }}
              title="بروفايلي"
              aria-label="بروفايلي"
              className="flex items-center justify-center bg-teal-800/60 hover:bg-teal-800 text-teal-50 p-2 rounded-xl transition-colors shrink-0"
            >
              <User className="w-4 h-4" />
            </button>
          )}
          {!isCreating && (
            <button
              type="button"
              onClick={() => { haptic.light(); setIsCreating(true) }}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> رحلة جديدة
            </button>
          )}
          {onBack && !isCreating && (
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
        {isCreating ? (
          <NewTripForm
            existingIds={trips.map(t => t.id)}
            isSaving={isCreatingTrip}
            onCreate={handleCreate}
            onCancel={() => setIsCreating(false)}
          />
        ) : loading ? (
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
              للانضمام لرحلة قائمة، اطلب رابط دعوة من منظّمها. أو أنشئ رحلتك
              الخاصة الآن وادعُ رفاقك إليها.
            </p>
            <button
              type="button"
              onClick={() => { haptic.light(); setIsCreating(true) }}
              className="mt-4 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> إنشاء رحلة جديدة
            </button>
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

        {!isCreating && !loading && !error && trips.length > 0 && (
          <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed px-4">
            للانضمام لرحلة أخرى، افتح رابط دعوتها.
          </p>
        )}
      </main>
    </div>
  )
}

export default TripPicker
