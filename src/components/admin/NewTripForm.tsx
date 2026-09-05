// 🆕 نموذج إنشاء رحلة جديدة — يُرسَل إلى Cloud Function باسم manageTrip.
// 🆕 لا حقول بنك هنا — من ينشئ الرحلة يصبح منظّمها تلقائياً، وبيانات البنك
// المعروضة لأعضائها تُقرأ حيّة من بروفايله (users/{organizerUid})، لا تُدخَل
// عند الإنشاء. انظر docs/DECISIONS.md.
import { useState } from 'react'
import { X, Save, Loader2 } from '../../icons'
import { isValidTripId } from '../../utils/tripId'

interface NewTripFormProps {
  existingIds: string[]
  isSaving: boolean
  onCreate: (tripId: string, name: string) => Promise<boolean>
  onCancel: () => void
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

export default function NewTripForm({ existingIds, isSaving, onCreate, onCancel }: NewTripFormProps) {
  const [tripId, setTripId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const id = tripId.trim()
    if (!isValidTripId(id)) {
      setError('المعرّف غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.')
      return
    }
    // فحص محلي سريع؛ الخادم يعيده بنفسه ذرّياً لأن رحلة قد تُنشأ بين اللحظتين
    if (existingIds.includes(id)) {
      setError(`المعرّف "${id}" مستخدم في رحلة أخرى — اختر غيره.`)
      return
    }
    setError(null)
    const ok = await onCreate(id, name.trim())
    if (ok) onCancel()
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); void submit() }}
      className="bg-white rounded-2xl shadow-sm border-2 border-teal-200 p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">رحلة جديدة</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="إلغاء"
          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className={labelClass} htmlFor="new-trip-id">معرّف الرحلة</label>
        <input
          id="new-trip-id"
          type="text"
          dir="ltr"
          value={tripId}
          onChange={e => setTripId(e.target.value)}
          placeholder="riyadh-2027"
          className={`${inputClass} text-right`}
        />
        <p className="text-[11px] text-slate-400 mt-1.5">
          يظهر في رابط الرحلة (‎?trip=…) ولا يمكن تغييره لاحقاً.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="new-trip-name">اسم الرحلة</label>
        <input
          id="new-trip-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="رحلة الرياض ٢٠٢٧"
          className={inputClass}
        />
        <p className="text-[11px] text-slate-400 mt-1.5">إن تركته فارغاً سيُستخدم المعرّف اسماً.</p>
      </div>

      <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2.5 leading-relaxed">
        ستصبح منظّم هذه الرحلة تلقائياً — بيانات البنك التي تظهر لأعضائها تُقرأ
        من بروفايلك، عدّلها من هناك في أي وقت. بعد الإنشاء، ادعُ الأعضاء عبر
        رابط دعوة من تبويب «المسافرون» داخل تفاصيل الرحلة.
      </p>

      {error && (
        <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          إنشاء الرحلة
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
