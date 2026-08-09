// 🆕 لوحة تفاصيل رحلة واحدة داخل واجهة إدارة الرحلات — تعمل على *أي* رحلة
// بمعرّفها، لا على الرحلة المفتوحة فقط: قواعد Firestore تشترط isAdmin() ولا
// تشير للرحلة النشطة، فالمسؤول يعدّل رحلة أخرى دون مغادرة الحالية.
//
// نمط التحرير: المسار يُحرَّر على نسخة عمل محلية ثم يُحفظ بضغطة صريحة — لا حفظ
// تلقائي. السبب أن الحقل يُكتب كمصفوفة كاملة، فالحفظ بعد كل ضغطة يعني كتابات
// متلاحقة على نفس المستند وفرصة أكبر لضياع تعديل عند التحرير من جهازين معاً.
import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Route, KeyRound, Save, Plane, Car, Train, Bus,
  Pencil, Trash2, Plus, ArrowUp, ArrowDown, Loader2, AlertTriangle,
} from '../../icons'
import SegmentForm from './SegmentForm'
import EmptyState from '../EmptyState'
import {
  TRANSPORT_LABEL, MAX_SEGMENTS,
  emptySegmentDraft, segmentToDraft, draftToSegment, validateDraft,
} from '../../utils/itinerary'
import type { SegmentDraft } from '../../utils/itinerary'
import type { TripSummary } from '../../hooks/useAllTrips'
import type { BankDetails, TransportMode } from '../../types'

interface TripDetailPanelProps {
  trip: TripSummary
  isSaving: boolean
  onSaveTripName: (tripId: string, name: string) => Promise<boolean>
  onSaveBankDetails: (tripId: string, details: BankDetails) => Promise<boolean>
  onSaveItinerary: (tripId: string, itinerary: TripSummary['itinerary']) => Promise<boolean>
  onResetPin: (tripId: string, pin: string) => Promise<boolean>
  /** حذف نهائي — الخادم يرفضه إن كانت الرحلة تحوي أي بيانات. */
  onDeleteTrip: (tripId: string) => Promise<boolean>
  /** يُستدعى بعد نجاح الحذف — الرحلة لم تعد موجودة فلا يصح إبقاء لوحتها مفتوحة. */
  onDeleted: () => void
}

type DetailTab = 'bank' | 'itinerary' | 'pin' | 'danger'

const TABS: Array<{ key: DetailTab; label: string; Icon: typeof Building2 }> = [
  { key: 'bank',      label: 'الاسم والحساب', Icon: Building2 },
  { key: 'itinerary', label: 'مسار الرحلة',   Icon: Route },
  { key: 'pin',       label: 'رمز الدخول',    Icon: KeyRound },
  { key: 'danger',    label: 'حذف الرحلة',    Icon: Trash2 },
]

const MODE_ICON: Record<TransportMode, typeof Plane> = {
  flight: Plane, car: Car, train: Train, bus: Bus,
}

const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short' })} · ${
    d.toLocaleTimeString(DT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

export default function TripDetailPanel({
  trip, isSaving, onSaveTripName, onSaveBankDetails, onSaveItinerary, onResetPin,
  onDeleteTrip, onDeleted,
}: TripDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('bank')

  const [nameForm, setNameForm] = useState(trip.name)
  const [bankForm, setBankForm] = useState<BankDetails>(trip.bankDetails)
  const [workingItinerary, setWorkingItinerary] = useState(trip.itinerary)
  const [draft, setDraft] = useState<SegmentDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  // تأكيد الحذف بكتابة المعرّف: الحذف نهائي ولا تراجع عنه، وضغطة زر واحدة
  // بالخطأ على رحلة خاطئة أسهل مما ينبغي في قائمة رحلات متشابهة الأسماء.
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // القائمة حيّة (onSnapshot): إعادة تهيئة النماذج عند تبديل الرحلة المختارة
  // حتى لا تُعرض بيانات الرحلة السابقة في حقول الرحلة الجديدة.
  useEffect(() => {
    setNameForm(trip.name)
    setBankForm(trip.bankDetails)
    setWorkingItinerary(trip.itinerary)
    setDraft(null)
    setEditingId(null)
    setDraftError(null)
    setNewPin('')
    setPinError(null)
    setDeleteConfirm('')
    setActiveTab('bank')
  }, [trip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const bankDirty = useMemo(
    () => nameForm !== trip.name ||
      (['bankName', 'beneficiary', 'iban'] as const).some(k => bankForm[k] !== trip.bankDetails[k]),
    [nameForm, bankForm, trip]
  )

  const itineraryDirty = useMemo(
    () => JSON.stringify(workingItinerary) !== JSON.stringify(trip.itinerary),
    [workingItinerary, trip.itinerary]
  )

  const saveNameAndBank = async () => {
    if (nameForm !== trip.name) await onSaveTripName(trip.id, nameForm)
    await onSaveBankDetails(trip.id, bankForm)
  }

  const startAdd = () => { setEditingId(null); setDraftError(null); setDraft(emptySegmentDraft()) }
  const startEdit = (id: string) => {
    const segment = workingItinerary.find(s => s.id === id)
    if (!segment) return
    setEditingId(id)
    setDraftError(null)
    setDraft(segmentToDraft(segment))
  }
  const cancelDraft = () => { setDraft(null); setEditingId(null); setDraftError(null) }

  const submitDraft = () => {
    if (!draft) return
    const error = validateDraft(draft)
    if (error) { setDraftError(error); return }
    const segment = draftToSegment(draft)
    setWorkingItinerary(prev =>
      editingId ? prev.map(s => (s.id === editingId ? segment : s)) : [...prev, segment]
    )
    cancelDraft()
  }

  // الترتيب يدوي عمداً: المقاطع تُعرض بترتيب المصفوفة كما هي، ولو رتّبناها
  // زمنياً أثناء التحرير لقفز مقطع لم يُدخَل وقته بعد بشكل مربك.
  const moveSegment = (index: number, direction: -1 | 1) => {
    setWorkingItinerary(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const submitPin = async () => {
    if (newPin.trim().length < 4) {
      setPinError('رمز الرحلة يجب أن يكون 4 خانات على الأقل.')
      return
    }
    setPinError(null)
    const ok = await onResetPin(trip.id, newPin.trim())
    if (ok) setNewPin('')
  }

  const submitDelete = async () => {
    const ok = await onDeleteTrip(trip.id)
    if (ok) onDeleted()
  }

  // مؤشّر إرشادي فقط. المرجع الحقيقي هو فحص الخادم قبل الحذف مباشرةً: القائمة
  // هنا لا تعرف عدد المصاريف/المسافرين (لا تُقرأ في هذه الشاشة)، وحتى لو عرفت
  // لكانت لقطة قديمة قد يضيف عليها جهاز آخر بين العرض والضغط.
  const hasItinerary = trip.itinerary.length > 0

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              activeTab === key
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'bank' && (
        <form
          onSubmit={e => { e.preventDefault(); void saveNameAndBank() }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
        >
          <div>
            <label className={labelClass} htmlFor="trip-name">اسم الرحلة</label>
            <input
              id="trip-name"
              type="text"
              value={nameForm}
              onChange={e => setNameForm(e.target.value)}
              className={inputClass}
            />
          </div>

          <hr className="border-slate-100" />

          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" /> تفاصيل الحساب البنكي
          </h3>
          <p className="text-xs text-slate-500 -mt-2">
            تظهر لكل أعضاء هذه الرحلة في بطاقة التحويل، ويمكنهم نسخها أو مشاركتها.
          </p>

          <div>
            <label className={labelClass} htmlFor="bank-name">اسم البنك</label>
            <input
              id="bank-name"
              type="text"
              value={bankForm.bankName}
              onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="bank-beneficiary">اسم المستفيد</label>
            <input
              id="bank-beneficiary"
              type="text"
              value={bankForm.beneficiary}
              onChange={e => setBankForm({ ...bankForm, beneficiary: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="bank-iban">رقم الآيبان (IBAN)</label>
            <input
              id="bank-iban"
              type="text"
              dir="ltr"
              value={bankForm.iban}
              onChange={e => setBankForm({ ...bankForm, iban: e.target.value })}
              placeholder="SA0000000000000000000000"
              className={`${inputClass} text-right tabular-nums`}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">تُحذف المسافات تلقائياً عند الحفظ.</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving || !bankDirty}
              className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </button>
            {bankDirty && (
              <button
                type="button"
                onClick={() => { setNameForm(trip.name); setBankForm(trip.bankDetails) }}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                تراجع
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'itinerary' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Route className="w-4 h-4 text-teal-600" /> مقاطع المسار
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {workingItinerary.length} من {MAX_SEGMENTS}. يظهر أول مقطع قادم في صفحة الرحلة.
                </p>
              </div>
              {!draft && (
                <button
                  type="button"
                  onClick={startAdd}
                  disabled={workingItinerary.length >= MAX_SEGMENTS}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> إضافة مقطع
                </button>
              )}
            </div>

            {itineraryDirty && (
              <div className="mt-4 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-800 flex-1">تعديلات غير محفوظة على المسار.</span>
                <button
                  type="button"
                  onClick={() => void onSaveItinerary(trip.id, workingItinerary)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  حفظ المسار
                </button>
                <button
                  type="button"
                  onClick={() => { setWorkingItinerary(trip.itinerary); cancelDraft() }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  تراجع
                </button>
              </div>
            )}
          </div>

          {draft && (
            <SegmentForm
              draft={draft}
              setDraft={setDraft}
              onSubmit={submitDraft}
              onCancel={cancelDraft}
              isEditing={editingId !== null}
              error={draftError}
            />
          )}

          {workingItinerary.length === 0 && !draft ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <EmptyState
                Icon={Route}
                title="لا يوجد مسار بعد"
                description="أضف رحلات الطيران أو التنقلات البرية ليظهر للمسافرين المقطع القادم وموعده."
                actionLabel="إضافة أول مقطع"
                onAction={startAdd}
                ActionIcon={Plus}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {workingItinerary.map((segment, index) => {
                const ModeIcon = MODE_ICON[segment.mode]
                return (
                  <div key={segment.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-teal-100 text-teal-700 shrink-0">
                          <ModeIcon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-400">
                            {TRANSPORT_LABEL[segment.mode]}
                            {segment.reference && <span dir="ltr"> · {segment.reference}</span>}
                          </p>
                          <p className="text-sm font-bold text-slate-800 truncate">{segment.identifier}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button" onClick={() => moveSegment(index, -1)} disabled={index === 0}
                          aria-label="تحريك لأعلى"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button" onClick={() => moveSegment(index, 1)}
                          disabled={index === workingItinerary.length - 1}
                          aria-label="تحريك لأسفل"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button" onClick={() => startEdit(segment.id)}
                          aria-label={`تعديل ${segment.identifier}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkingItinerary(prev => prev.filter(s => s.id !== segment.id))}
                          aria-label={`حذف ${segment.identifier}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-100 p-2.5 min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 mb-0.5">الانطلاق</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{segment.departure.location}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDateTime(segment.departure.time)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-100 p-2.5 min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 mb-0.5">الوصول</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{segment.arrival.location}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDateTime(segment.arrival.time)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'pin' && (
        <form
          onSubmit={e => { e.preventDefault(); void submitPin() }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" /> تغيير رمز الدخول
          </h3>

          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1.5">
            <p className="font-bold">تغيير الرمز يُخرج كل الأعضاء الحاليين.</p>
            <p>
              سيُطلب من كل عضو إدخال الرمز الجديد مرة واحدة عند فتح الرحلة. لا تفعل هذا أثناء الرحلة
              إلا لسبب — مثل تسرّب الرمز لغير المشاركين.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="reset-pin">الرمز الجديد</label>
            <input
              id="reset-pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="4 خانات فأكثر"
              dir="ltr"
              className={`${inputClass} text-right tabular-nums`}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              يُخزَّن مُجزَّأً (hash) على الخادم — لا يمكن استرجاعه لاحقاً، فاحفظه عند تعيينه.
            </p>
          </div>

          {pinError && (
            <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              {pinError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || !newPin.trim()}
            className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            تغيير الرمز
          </button>
        </form>
      )}

      {activeTab === 'danger' && (
        <form
          onSubmit={e => { e.preventDefault(); void submitDelete() }}
          className="bg-white rounded-2xl shadow-sm border border-rose-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-600" /> حذف الرحلة نهائياً
          </h3>

          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1.5">
            <p className="font-bold">لا يمكن التراجع عن هذا الإجراء.</p>
            <p>
              يُحذف مستند الرحلة ورمز دخولها معاً. الحذف متاح <span className="font-bold">للرحلات الفارغة فقط</span> —
              أي التي لا تحوي أي مسافر أو مصروف — حمايةً للسجلات المالية وسجلات الإيداع
              التي لا يمكن استرجاعها.
            </p>
            <p>بعد الحذف يصبح المعرّف <span dir="ltr" className="font-mono">{trip.id}</span> متاحاً لإنشاء رحلة جديدة به.</p>
          </div>

          {hasItinerary && (
            <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
              تنبيه: هذه الرحلة تحوي {trip.itinerary.length} مقطعاً في مسارها، وستُحذف معها.
            </p>
          )}

          <div>
            <label className={labelClass} htmlFor="delete-confirm">
              للتأكيد، اكتب معرّف الرحلة: <span dir="ltr" className="font-mono text-slate-700">{trip.id}</span>
            </label>
            <input
              id="delete-confirm"
              type="text"
              autoComplete="off"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              dir="ltr"
              className={`${inputClass} text-right`}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving || deleteConfirm.trim() !== trip.id}
            className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            حذف الرحلة نهائياً
          </button>
        </form>
      )}
    </div>
  )
}
