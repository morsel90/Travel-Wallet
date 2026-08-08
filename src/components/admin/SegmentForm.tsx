// 🆕 نموذج مقطع مسار واحد — يُستخدم للإضافة والتعديل معاً داخل TripAdminView.
// مكوّن مُتحكَّم فيه بالكامل (controlled): المسوّدة وحالتها تعيشان في الأب،
// حتى يبقى «المسار كاملاً» مصدر حقيقة واحداً قابلاً للحفظ دفعة واحدة.
import { X, Save } from '../../icons'
import { TRANSPORT_MODES, TRANSPORT_LABEL } from '../../utils/itinerary'
import type { SegmentDraft } from '../../utils/itinerary'
import type { TransportMode } from '../../types'

interface SegmentFormProps {
  draft: SegmentDraft
  setDraft: (draft: SegmentDraft) => void
  onSubmit: () => void
  onCancel: () => void
  isEditing: boolean
  error: string | null
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

export default function SegmentForm({
  draft, setDraft, onSubmit, onCancel, isEditing, error,
}: SegmentFormProps) {
  const set = <K extends keyof SegmentDraft>(key: K, value: SegmentDraft[K]) =>
    setDraft({ ...draft, [key]: value })

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit() }}
      className="bg-white rounded-2xl shadow-sm border-2 border-teal-200 p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">
          {isEditing ? 'تعديل مقطع المسار' : 'إضافة مقطع جديد'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="إلغاء"
          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="seg-mode">وسيلة التنقل</label>
          <select
            id="seg-mode"
            value={draft.mode}
            onChange={e => set('mode', e.target.value as TransportMode)}
            className={`${inputClass} safari-select-fix`}
          >
            {TRANSPORT_MODES.map(mode => (
              <option key={mode} value={mode}>{TRANSPORT_LABEL[mode]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="seg-identifier">
            {draft.mode === 'flight' ? 'رقم الرحلة' : 'وصف المركبة'}
          </label>
          <input
            id="seg-identifier"
            type="text"
            value={draft.identifier}
            onChange={e => set('identifier', e.target.value)}
            placeholder={draft.mode === 'flight' ? 'QR 1155' : 'سيارة يوكن'}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="seg-reference">
          رقم الحجز / PNR <span className="font-normal text-slate-400">(اختياري)</span>
        </label>
        <input
          id="seg-reference"
          type="text"
          value={draft.reference}
          onChange={e => set('reference', e.target.value)}
          placeholder="8L2HTY"
          dir="ltr"
          className={`${inputClass} text-right`}
        />
      </div>

      <fieldset className="border border-slate-200 rounded-xl p-3">
        <legend className="text-xs font-bold text-teal-700 px-1.5">الانطلاق</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="seg-dep-loc">من</label>
            <input
              id="seg-dep-loc"
              type="text"
              value={draft.departureLocation}
              onChange={e => set('departureLocation', e.target.value)}
              placeholder="الدمام (مطار الملك فهد)"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="seg-dep-time">التاريخ والوقت</label>
            <input
              id="seg-dep-time"
              type="datetime-local"
              value={draft.departureTime}
              onChange={e => set('departureTime', e.target.value)}
              className={`${inputClass} safari-date-fix`}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="border border-slate-200 rounded-xl p-3">
        <legend className="text-xs font-bold text-teal-700 px-1.5">الوصول</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="seg-arr-loc">إلى</label>
            <input
              id="seg-arr-loc"
              type="text"
              value={draft.arrivalLocation}
              onChange={e => set('arrivalLocation', e.target.value)}
              placeholder="الدوحة (مطار حمد)"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="seg-arr-time">التاريخ والوقت</label>
            <input
              id="seg-arr-time"
              type="datetime-local"
              value={draft.arrivalTime}
              onChange={e => set('arrivalTime', e.target.value)}
              className={`${inputClass} safari-date-fix`}
            />
          </div>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" /> {isEditing ? 'حفظ التعديل' : 'إضافة للمسار'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          إلغاء
        </button>
      </div>
    </form>
  )
}
