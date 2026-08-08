// 🆕 واجهة إدارة الرحلة — شاشة كاملة على نمط ReportsView (motion + رأس لاصق +
// تبويبات)، مرئية للمسؤول فقط. تستبدل التعديل اليدوي عبر scripts/add-flights.mjs
// (المسار) وإعادة تشغيل scripts/create-trip.mjs (تفاصيل البنك).
//
// نطاق مقصود: لا إنشاء رحلة ولا تعيين PIN من هنا — كلاهما يمسّ
// tripSecrets/{tripId} المحظور على العميل تماماً، ويبقيان في create-trip.mjs.
//
// نمط التحرير: المسار يُحرَّر محلياً بالكامل (إضافة/تعديل/حذف/ترتيب) ثم يُحفظ
// دفعة واحدة بضغطة صريحة — لا حفظ تلقائي بعد كل تعديل. السبب أن الحقل يُكتب
// كمصفوفة كاملة، فالحفظ بعد كل ضغطة يعني كتابات متلاحقة على نفس المستند وفرصة
// أكبر لضياع تعديل عند تحرير الرحلة من جهازين في آنٍ واحد.
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Settings, Save, Building2, Route, Plane, Car, Train, Bus,
  Pencil, Trash2, Plus, ArrowUp, ArrowDown, Loader2, AlertTriangle,
} from '../../icons'
import SegmentForm from './SegmentForm'
import EmptyState from '../EmptyState'
import {
  TRANSPORT_LABEL, MAX_SEGMENTS,
  emptySegmentDraft, segmentToDraft, draftToSegment, validateDraft,
} from '../../utils/itinerary'
import type { SegmentDraft } from '../../utils/itinerary'
import type { BankDetails, ItinerarySegment, TransportMode } from '../../types'

interface TripAdminViewProps {
  tripName: string | null
  bankDetails: BankDetails
  itinerary: ItinerarySegment[]
  isSaving: boolean
  onSaveBankDetails: (details: BankDetails) => Promise<boolean>
  onSaveItinerary: (itinerary: ItinerarySegment[]) => Promise<boolean>
  onClose: () => void
}

type AdminTab = 'bank' | 'itinerary'

const TABS: Array<{ key: AdminTab; label: string; Icon: typeof Building2 }> = [
  { key: 'bank',      label: 'الحساب البنكي', Icon: Building2 },
  { key: 'itinerary', label: 'مسار الرحلة',   Icon: Route },
]

const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short' })} · ${
    d.toLocaleTimeString(DT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

const MODE_ICON: Record<TransportMode, typeof Plane> = {
  flight: Plane, car: Car, train: Train, bus: Bus,
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

export default function TripAdminView({
  tripName, bankDetails, itinerary, isSaving,
  onSaveBankDetails, onSaveItinerary, onClose,
}: TripAdminViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('bank')

  // ── تفاصيل البنك ──────────────────────────────────────────────────────────
  const [bankForm, setBankForm] = useState<BankDetails>(bankDetails)
  const bankDirty = useMemo(
    () => (['bankName', 'beneficiary', 'iban'] as const).some(k => bankForm[k] !== bankDetails[k]),
    [bankForm, bankDetails]
  )

  // ── المسار ────────────────────────────────────────────────────────────────
  // نسخة عمل محلية: كل التعديلات تجري عليها، والحفظ يكتبها كاملة مرة واحدة.
  const [workingItinerary, setWorkingItinerary] = useState<ItinerarySegment[]>(itinerary)
  const [draft, setDraft] = useState<SegmentDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const itineraryDirty = useMemo(
    () => JSON.stringify(workingItinerary) !== JSON.stringify(itinerary),
    [workingItinerary, itinerary]
  )

  const startAdd = () => {
    setEditingId(null)
    setDraftError(null)
    setDraft(emptySegmentDraft())
  }

  const startEdit = (segment: ItinerarySegment) => {
    setEditingId(segment.id)
    setDraftError(null)
    setDraft(segmentToDraft(segment))
  }

  const cancelDraft = () => {
    setDraft(null)
    setEditingId(null)
    setDraftError(null)
  }

  const submitDraft = () => {
    if (!draft) return
    const error = validateDraft(draft)
    if (error) { setDraftError(error); return }

    const segment = draftToSegment(draft)
    setWorkingItinerary(prev =>
      editingId
        ? prev.map(s => (s.id === editingId ? segment : s))
        : [...prev, segment]
    )
    cancelDraft()
  }

  const removeSegment = (id: string) =>
    setWorkingItinerary(prev => prev.filter(s => s.id !== id))

  // الترتيب يدوي عمداً: المقاطع تُعرض بترتيب المصفوفة كما هي، ولو رتّبناها
  // زمنياً هنا لانقلب مكان مقطع لم يُدخَل وقته بعد بشكل مربك أثناء التحرير.
  const moveSegment = (index: number, direction: -1 | 1) => {
    setWorkingItinerary(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const atLimit = workingItinerary.length >= MAX_SEGMENTS

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
          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-6 h-6 text-teal-100 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">إدارة الرحلة</h1>
              {tripName && <p className="text-[11px] text-teal-100 truncate">{tripName}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق إدارة الرحلة"
            className="p-2 rounded-xl bg-teal-800/60 hover:bg-teal-800 text-teal-50 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === key ? 'bg-white text-teal-700 shadow-sm' : 'bg-teal-800/40 text-teal-50 hover:bg-teal-800/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-24">
        {activeTab === 'bank' && (
          <form
            onSubmit={e => { e.preventDefault(); void onSaveBankDetails(bankForm) }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-600" /> تفاصيل الحساب البنكي
            </h2>
            <p className="text-xs text-slate-500 -mt-2">
              تظهر هذه البيانات لكل أعضاء الرحلة في بطاقة التحويل، ويمكنهم نسخها أو مشاركتها.
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
                  onClick={() => setBankForm(bankDetails)}
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
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <Route className="w-5 h-5 text-teal-600" /> مسار الرحلة
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {workingItinerary.length} من {MAX_SEGMENTS} مقطعاً. يظهر أول مقطع قادم في الصفحة الرئيسية.
                  </p>
                </div>
                {!draft && (
                  <button
                    type="button"
                    onClick={startAdd}
                    disabled={atLimit}
                    className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة مقطع
                  </button>
                )}
              </div>

              {itineraryDirty && (
                <div className="mt-4 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-amber-800 flex-1">
                    لديك تعديلات غير محفوظة على المسار.
                  </span>
                  <button
                    type="button"
                    onClick={() => void onSaveItinerary(workingItinerary)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    حفظ المسار
                  </button>
                  <button
                    type="button"
                    onClick={() => { setWorkingItinerary(itinerary); cancelDraft() }}
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
                    <div
                      key={segment.id}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4"
                    >
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
                            type="button"
                            onClick={() => moveSegment(index, -1)}
                            disabled={index === 0}
                            aria-label="تحريك لأعلى"
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSegment(index, 1)}
                            disabled={index === workingItinerary.length - 1}
                            aria-label="تحريك لأسفل"
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(segment)}
                            aria-label={`تعديل ${segment.identifier}`}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSegment(segment.id)}
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
      </main>
    </motion.div>
  )
}
