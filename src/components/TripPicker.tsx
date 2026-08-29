import { lazy, Suspense, useState } from 'react'
import {
  Luggage, ChevronLeft, ChevronDown, Loader2, AlertTriangle, PieChart, Plus, User, Upload, Archive,
} from '../icons'
import type { MyTrip } from '../hooks/useMyTrips'
import { TRIP_STATUS_LABEL } from '../types'
import { tripUrl } from '../utils/tripId'
import { haptic } from '../utils/haptics'
import NewTripForm from './admin/NewTripForm'

// 🆕 استعادة نسخة احتياطية (تبويب داخل شاشة الإنشاء، للمسؤول وحده) — لا تلمسها
// الغالبية العظمى من الزيارات، بخلاف NewTripForm أعلاه (خفيفة، ومتاحة للجميع
// منذ أول شاشة فارغة). كسولة هنا حتى لا تدخل الحزمة الرئيسية لكل مستخدم.
// ⚠️ دالة الاستيراد مُسمّاة ومُصدَّرة في tripPickerImporters أدناه بدل تكرارها
// في useAppCoordinator.ts — نفس نمط modalImporters في ModalManager.tsx.
const importRestoreTripForm = () => import('./admin/RestoreTripForm')

const RestoreTripForm = lazy(importRestoreTripForm)

/** 🆕 للتحميل المسبق الهادئ من useAppCoordinator.ts — انظر LAZY_IMPORTERS هناك. */
// eslint-disable-next-line react-refresh/only-export-components
export const tripPickerImporters = [importRestoreTripForm]

// 🆕 نفس تنسيق ItinerarySection.tsx (تقويم ميلادي + أرقام لاتينية) — عرض
// مختصر لتاريخ المسار وحده هنا، بلا وقت (البطاقة صف واحد لا مساحة لتفصيل الساعة).
const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDay = (iso: string): string =>
  new Date(iso).toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short' })

/** ملخّص سطر واحد: "الرياض ← دبي · ١٢ يوليو – ١٨ يوليو"، أو التاريخ وحده لمقطع واحد. */
const formatRouteSummary = (r: { start: string; end: string; fromLocation: string; toLocation: string }): string => {
  const dateRange = fmtDay(r.start) === fmtDay(r.end) ? fmtDay(r.start) : `${fmtDay(r.start)} – ${fmtDay(r.end)}`
  const route = r.fromLocation === r.toLocation ? r.fromLocation : `${r.fromLocation} ← ${r.toLocation}`
  return `${route} · ${dateRange}`
}

const LazyFallback = () => (
  <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
    <span className="text-sm font-bold">جارٍ التحميل...</span>
  </div>
)

// ─── TripPicker — شاشة «رحلاتي» ──────────────────────────────────────────────
// 🆕 قائمة الرحلات التي انضم لها المستخدم، على نمط قائمة المحادثات في تطبيقات
// المراسلة: يرى أسماء رحلاته ويضغط أياً منها للدخول. تنقّل بحت (فتح/إنشاء/
// استعادة) — لا تعديل من هنا؛ تعديل أي رحلة يمرّ عبر اسمها في الهيدر بعد
// فتحها (انظر components/modals/EditTripModal.tsx وdocs/DECISIONS.md).
//
// ⚠️ فرق جوهري عن ذلك النمط يجب ألا يُنسى عند التعديل هنا: هذه ليست قائمة بكل
// الرحلات الموجودة لعضو عادي — بل برحلات *هذا المستخدم* وحده (مصدرها خريطة
// trips في claims توكنه). المسؤول وحده يرى كل الرحلات (trips من useAllTrips —
// انظر useAppCoordinator.ts).
//
// 🆕 الدخول لرحلة أخرى إما برابط دعوة من منظّمها، أو بإنشاء رحلة جديدة بنفسك
// من هنا مباشرة (نموذج واتساب: من يُنشئ يصبح منظّم رحلته تلقائياً — انظر
// functions/index.js manageTrip mode: 'create'، وdocs/DECISIONS.md/الخطة
// المعتمدة لهذا التغيير). لا يوجد اليوم مسار انضمام ذاتي لرحلة *موجودة* بلا
// دعوة — هذا لم يتغيّر.

interface TripPickerProps {
  trips: MyTrip[]
  /**
   * 🆕 مؤرشفة، بلا الرحلة المفتوحة حالياً (تلك تبقى في `trips` دائماً) — تُطوى
   * خلف صفّ "الرحلات المؤرشفة" القابل للفتح، نمط «الدردشات المؤرشفة» في
   * واتساب: لا تختفي نهائياً، لكنها لا تزدحم مع القائمة النشطة.
   */
  archivedTrips: MyTrip[]
  loading: boolean
  error: string | null
  /**
   * الرحلة المفتوحة حالياً إن وُجدت — تُبرز في القائمة. إن فُتحت هذه الشاشة من
   * داخل رحلة (لا كشاشة بداية)، الضغط على بطاقتها هو طريقة الرجوع الوحيدة —
   * لا زرّ «رجوع» منفصل، فطريقة واحدة تكفي.
   */
  currentTripId?: string
  /** 🆕 إنشاء ذاتي — متاح لأي مستخدم مسجّل دخوله، لا المسؤول فقط. */
  onCreateTrip: (tripId: string, name: string) => Promise<boolean>
  isCreatingTrip: boolean
  /**
   * 🆕 فتح شاشة البروفايل (اسم/بنك) — هذه هي نقطة الدخول الوحيدة إليها لعضو
   * بلا أي رحلة بعد (Header/AccountMenu لا يُعرَضان قبل الانضمام لرحلة). بالضبط
   * من يحتاج تعبئة بروفايله *قبل* إنشاء أول رحلة ذاتياً — انظر docs/DECISIONS.md.
   */
  onShowProfile: () => void

  /** 🆕 يُظهر معرّف كل رحلة تحت اسمها، ويتيح تبويب «استعادة من نسخة احتياطية». */
  isAdmin: boolean
  isSaving: boolean
  /** 🆕 استعادة من نسخة احتياطية — للمسؤول فقط، نفس حدّ useTripAdminActions. */
  onRestoreTrip: (tripId: string, backup: unknown) => Promise<boolean>
}

const TripPicker = ({
  trips, archivedTrips, loading, error, currentTripId,
  onCreateTrip, isCreatingTrip, onShowProfile,
  isAdmin, isSaving, onRestoreTrip,
}: TripPickerProps) => {
  const [isCreating, setIsCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // 🆕 الإنشاء والاستعادة تبويبان لنفس الشاشة لا زرّان منفصلان في الهيدر —
  // كلاهما ينتج رحلة جديدة بمعرّف، والفرق فقط مصدر بياناتها. تبويب الاستعادة
  // يظهر للمسؤول وحده (isAdmin أدناه)، فعضو عادي لا يرى تبديلاً أصلاً.
  const [createMode, setCreateMode] = useState<'new' | 'restore'>('new')
  const openCreate = () => { haptic.light(); setCreateMode('new'); setIsCreating(true) }

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

  // 🆕 صفّ رحلة واحد — دالة مشتركة بين القائمة النشطة والمؤرشفة (نفس الشكل
  // بالضبط)، بدل تكرار الـJSX في مكانين.
  const renderTripRow = (trip: MyTrip) => {
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
            {/* 🆕 المعرّف يظهر للمسؤول فقط — يتصفّح كل رحلات النظام وقد
                تتشابه أسماؤها، بخلاف عضو عادي يرى رحلاته القليلة المعروفة
                له أصلاً بالاسم وحده. */}
            {isAdmin && (
              <span className="block text-[11px] text-slate-400 truncate" dir="ltr">{trip.id}</span>
            )}
            {trip.routeSummary && (
              <span className="block text-[11px] text-slate-400 truncate mt-0.5">
                {formatRouteSummary(trip.routeSummary)}
              </span>
            )}
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
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> رحلة جديدة
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {isCreating ? (
          <div className="space-y-3">
            {/* 🆕 تبويب الاستعادة للمسؤول فقط — نفس الحدّ الذي يفرضه
                useTripAdminActions خادمياً (restoreTrip: isAdmin فقط). */}
            {isAdmin && (
              <div className="flex gap-1.5" role="group" aria-label="طريقة إنشاء الرحلة">
                <button
                  type="button"
                  onClick={() => { haptic.light(); setCreateMode('new') }}
                  aria-pressed={createMode === 'new'}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                    createMode === 'new'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> رحلة جديدة
                </button>
                <button
                  type="button"
                  onClick={() => { haptic.light(); setCreateMode('restore') }}
                  aria-pressed={createMode === 'restore'}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                    createMode === 'restore'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> استعادة من نسخة احتياطية
                </button>
              </div>
            )}

            {createMode === 'new' || !isAdmin ? (
              <NewTripForm
                existingIds={trips.map(t => t.id)}
                isSaving={isCreatingTrip}
                onCreate={handleCreate}
                onCancel={() => setIsCreating(false)}
              />
            ) : (
              <Suspense fallback={<LazyFallback />}>
                <RestoreTripForm
                  isSaving={isSaving}
                  onRestore={onRestoreTrip}
                  onCancel={() => setIsCreating(false)}
                />
              </Suspense>
            )}
          </div>
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
        ) : trips.length === 0 && archivedTrips.length === 0 ? (
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
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> إنشاء رحلة جديدة
            </button>
          </div>
        ) : (
          <>
            {trips.length > 0 && (
              <ul className="space-y-2.5">
                {trips.map(renderTripRow)}
              </ul>
            )}

            {/* 🆕 صفّ «الرحلات المؤرشفة» القابل للطي — نمط واتساب: صفّ واحد
                يحمل العدد، والضغط عليه يفتح القائمة نفسها أسفله بدل شاشة
                منفصلة (قائمتنا أصلاً قصيرة، فلا تستحق تنقّلاً كاملاً). */}
            {archivedTrips.length > 0 && (
              <div className={trips.length > 0 ? 'mt-2.5' : ''}>
                <button
                  type="button"
                  onClick={() => { haptic.light(); setShowArchived(v => !v) }}
                  aria-expanded={showArchived}
                  className="w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3.5 text-right transition-colors hover:border-teal-300"
                >
                  <span className="w-11 h-11 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                    <Archive className="w-5 h-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-800">الرحلات المؤرشفة</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{archivedTrips.length}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                </button>

                {showArchived && (
                  <ul className="space-y-2.5 mt-2.5">
                    {archivedTrips.map(renderTripRow)}
                  </ul>
                )}
              </div>
            )}
          </>
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
