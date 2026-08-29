import { lazy, Suspense, useState } from 'react'
import {
  Luggage, ChevronLeft, Loader2, AlertTriangle, PieChart, ArrowRight, Plus, User, Upload,
} from '../icons'
import type { TripSummary } from '../hooks/useAllTrips'
import { TRIP_STATUS_LABEL } from '../types'
import type { ToastMessage, TripStatus } from '../types'
import { tripUrl } from '../utils/tripId'
import { haptic } from '../utils/haptics'
import NewTripForm from './admin/NewTripForm'

// 🆕 لوحة تفاصيل الرحلة (تعديل/أعضاء/نسخة احتياطية/حذف) واستعادة نسخة احتياطية
// (تبويب داخل شاشة الإنشاء، للمسؤول وحده) — كلتاهما لا تلمسهما الغالبية العظمى
// من الزيارات (عضو عادي يفتح رحلاته فقط)، بخلاف NewTripForm أعلاه (خفيفة،
// ومتاحة للجميع منذ أول شاشة فارغة). كسولتان هنا تماماً كما كانتا كسولتين في
// TripAdminView.tsx القديمة (حُذفت) — دمجهما في هذه الشاشة يجب ألا يُدخلهما
// الحزمة الرئيسية لكل مستخدم.
// ⚠️ دالتا الاستيراد مُسمّاتان ومُصدَّرتان في tripPickerImporters أدناه بدل
// تكرارهما في useAppCoordinator.ts — نفس نمط modalImporters في ModalManager.tsx.
const importTripDetailPanel = () => import('./admin/TripDetailPanel')
const importRestoreTripForm = () => import('./admin/RestoreTripForm')

const TripDetailPanel = lazy(importTripDetailPanel)
const RestoreTripForm = lazy(importRestoreTripForm)

/** 🆕 للتحميل المسبق الهادئ من useAppCoordinator.ts — انظر LAZY_IMPORTERS هناك. */
// eslint-disable-next-line react-refresh/only-export-components
export const tripPickerImporters = [importTripDetailPanel, importRestoreTripForm]

const LazyFallback = () => (
  <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
    <span className="text-sm font-bold">جارٍ التحميل...</span>
  </div>
)

// ─── TripPicker — شاشة «رحلاتي» ──────────────────────────────────────────────
// 🆕 قائمة الرحلات التي انضم لها المستخدم، على نمط قائمة المحادثات في تطبيقات
// المراسلة: يرى أسماء رحلاته ويضغط أياً منها للدخول.
//
// ⚠️ فرق جوهري عن ذلك النمط يجب ألا يُنسى عند التعديل هنا: هذه ليست قائمة بكل
// الرحلات الموجودة لعضو عادي — بل برحلات *هذا المستخدم* وحده (مصدرها خريطة
// trips في claims توكنه). المسؤول وحده يرى كل الرحلات (trips من useAllTrips،
// مرَّرة كما هي — انظر useAppCoordinator.ts).
//
// 🆕 الدخول لرحلة أخرى إما برابط دعوة من منظّمها، أو بإنشاء رحلة جديدة بنفسك
// من هنا مباشرة (نموذج واتساب: من يُنشئ يصبح منظّم رحلته تلقائياً — انظر
// functions/index.js manageTrip mode: 'create'، وdocs/DECISIONS.md/الخطة
// المعتمدة لهذا التغيير). لا يوجد اليوم مسار انضمام ذاتي لرحلة *موجودة* بلا
// دعوة — هذا لم يتغيّر.
//
// 🆕 دُمجت هنا أيضاً شاشة «إدارة الرحلات» (كانت TripAdminView.tsx، حُذفت):
// زرّ «تعديل» يظهر على أي بطاقة يملك المستخدم صلاحية تعديلها — المسؤول على أي
// رحلة، والمنظّم على رحلاته وحدها — ويفتح نفس لوحة التفاصيل (TripDetailPanel)
// التي كانت هناك، بلا شاشة وسيطة منفصلة. انظر docs/DECISIONS.md.

interface TripPickerProps {
  trips: TripSummary[]
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

  // ─── 🆕 دمج «إدارة الرحلات» — تعديل رحلة مباشرة من هذه القائمة ────────────
  isAdmin: boolean
  currentUserUid: string | null
  /** 'organizer' يخفي التبويبات الحساسة داخل TripDetailPanel (نسخة احتياطية، حذف). */
  viewerRole: 'admin' | 'organizer'
  isSaving: boolean
  onSaveTripName: (tripId: string, name: string) => Promise<boolean>
  onSaveItinerary: (tripId: string, itinerary: TripSummary['itinerary']) => Promise<boolean>
  onSaveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  onDeleteTrip: (tripId: string) => Promise<boolean>
  onRemoveMember: (tripId: string, uid: string) => Promise<boolean>
  onSetMemberRole: (tripId: string, uid: string, role: 'organizer' | 'member') => Promise<boolean>
  onLinkTravelerAccount: (tripId: string, travelerId: number, targetUid: string) => Promise<boolean>
  onExportBackup: (trip: TripSummary) => Promise<boolean>
  /** 🆕 استعادة من نسخة احتياطية — للمسؤول فقط، نفس حدّ useTripAdminActions. */
  onRestoreTrip: (tripId: string, backup: unknown) => Promise<boolean>
  onCreateInvite: (tripId: string) => Promise<string | null>
  onRevokeInvite: (tripId: string) => Promise<boolean>
  showToast: (msg: ToastMessage, durationMs?: number) => void
}

const TripPicker = ({
  trips, loading, error, currentTripId, onBack,
  onCreateTrip, isCreatingTrip, onShowProfile,
  isAdmin, currentUserUid, viewerRole, isSaving,
  onSaveTripName, onSaveItinerary, onSaveTripStatus, onDeleteTrip,
  onRemoveMember, onSetMemberRole, onLinkTravelerAccount, onExportBackup,
  onRestoreTrip, onCreateInvite, onRevokeInvite, showToast,
}: TripPickerProps) => {
  const [isCreating, setIsCreating] = useState(false)
  // 🆕 الإنشاء والاستعادة تبويبان لنفس الشاشة لا زرّان منفصلان في الهيدر —
  // كلاهما ينتج رحلة جديدة بمعرّف، والفرق فقط مصدر بياناتها. تبويب الاستعادة
  // يظهر للمسؤول وحده (isAdmin أدناه)، فعضو عادي لا يرى تبديلاً أصلاً.
  const [createMode, setCreateMode] = useState<'new' | 'restore'>('new')
  const openCreate = () => { haptic.light(); setCreateMode('new'); setIsCreating(true) }
  // 🆕 رحلة مفتوحة للتعديل — بطاقة تعديلها ظاهرة فقط لمن يملك صلاحيته
  // (canEdit أدناه)، فلا حاجة لفحص الصلاحية هنا مرة أخرى عند الفتح.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? trips.find(t => t.id === selectedId) ?? null : null

  const canEdit = (trip: TripSummary) =>
    isAdmin || (currentUserUid !== null && trip.organizerUid === currentUserUid)

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

  const isBusy = isCreating || selected !== null

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-teal-700 text-white shadow-md">
        <div className="max-w-md mx-auto px-5 py-4 flex items-center gap-2.5">
          {selected ? (
            <>
              {/* 🆕 رجوع لقائمة الرحلات — يظهر دائماً في وضع التعديل، بخلاف
                  «رجوع» (onBack) أدناه الذي يعود للرحلة المفتوحة في التطبيق. */}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="رجوع لقائمة الرحلات"
                className="p-2 -mr-1.5 rounded-xl hover:bg-teal-800/60 text-teal-50 transition-colors shrink-0"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-lg truncate">{selected.name}</h1>
                <p className="text-[11px] text-teal-100 truncate" dir="ltr">{selected.id}</p>
              </div>
            </>
          ) : (
            <>
              <PieChart className="w-6 h-6 text-teal-100 shrink-0" />
              <h1 className="font-bold text-lg flex-1">رحلاتي</h1>
              {!isBusy && (
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
              {!isBusy && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> رحلة جديدة
                </button>
              )}
              {onBack && !isBusy && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="العودة للرحلة"
                  className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> رجوع
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {selected ? (
          <Suspense fallback={<LazyFallback />}>
            <TripDetailPanel
              trip={selected}
              viewerRole={viewerRole}
              isSaving={isSaving}
              onSaveTripName={onSaveTripName}
              onSaveItinerary={onSaveItinerary}
              onSaveTripStatus={onSaveTripStatus}
              onDeleteTrip={onDeleteTrip}
              onRemoveMember={onRemoveMember}
              onSetMemberRole={onSetMemberRole}
              onLinkTravelerAccount={onLinkTravelerAccount}
              onExportBackup={onExportBackup}
              onCreateInvite={onCreateInvite}
              onRevokeInvite={onRevokeInvite}
              showToast={showToast}
              // الرحلة لم تعد موجودة — نعود للقائمة بدل إبقاء لوحة تشير لمستند محذوف.
              onDeleted={() => setSelectedId(null)}
            />
          </Suspense>
        ) : isCreating ? (
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
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> إنشاء رحلة جديدة
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {trips.map(trip => {
              const isCurrent = trip.id === currentTripId
              const editable = canEdit(trip)
              return (
                <li key={trip.id}>
                  <div
                    className={`w-full bg-white rounded-2xl border flex items-center gap-2 shadow-sm hover:shadow-md transition-all ${
                      editable ? 'pe-3' : ''
                    } ${
                      isCurrent ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openTrip(trip.id)}
                      className="flex-1 min-w-0 flex items-center gap-3.5 text-right p-4 active:scale-[0.99] transition-transform"
                    >
                      <span className="w-11 h-11 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
                        {trip.name.trim()[0] ?? '؟'}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-800 truncate leading-tight">
                          {trip.name}
                        </span>
                        {/* 🆕 المعرّف يظهر للمسؤول فقط — يتصفّح كل رحلات النظام
                            وقد تتشابه أسماؤها، بخلاف عضو عادي يرى رحلاته القليلة
                            المعروفة له أصلاً بالاسم وحده. */}
                        {isAdmin && (
                          <span className="block text-[11px] text-slate-400 truncate" dir="ltr">{trip.id}</span>
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

                    {/* 🆕 تعديل الرحلة مباشرة من هنا — يظهر فقط لمن يملك صلاحيته
                        (المسؤول على أي رحلة، والمنظّم على رحلاته وحدها). */}
                    {editable && (
                      <button
                        type="button"
                        onClick={() => { haptic.light(); setSelectedId(trip.id) }}
                        className="shrink-0 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                      >
                        تعديل
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!isBusy && !loading && !error && trips.length > 0 && (
          <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed px-4">
            للانضمام لرحلة أخرى، افتح رابط دعوتها.
          </p>
        )}
      </main>
    </div>
  )
}

export default TripPicker
