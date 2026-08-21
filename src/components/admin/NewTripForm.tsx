// 🆕 نموذج إنشاء رحلة جديدة — يُرسَل إلى Cloud Function باسم manageTrip.
import { useState } from 'react'
import { X, Save, Loader2 } from '../../icons'
import { isValidTripId } from '../../utils/tripId'
import type { BankDetails } from '../../types'

interface NewTripFormProps {
  existingIds: string[]
  isSaving: boolean
  onCreate: (tripId: string, name: string, bankDetails: BankDetails) => Promise<boolean>
  onCancel: () => void
  /** 🆕 من بروفايل المستخدم (useUserProfile) — تعبئة أولية قابلة للتعديل الحر. */
  defaultBankDetails?: BankDetails
}

const EMPTY_BANK_DETAILS: BankDetails = { bankName: '', beneficiary: '', iban: '' }

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

export default function NewTripForm({ existingIds, isSaving, onCreate, onCancel, defaultBankDetails }: NewTripFormProps) {
  const [tripId, setTripId] = useState('')
  const [name, setName] = useState('')
  // 🆕 auto-fill قابل للتعديل الحر — تعبئة أولية من بروفايل المستخدم، ثم حالة
  // محلية مستقلة تماماً (لا نعيد المزامنة مع defaultBankDetails بعد أول عرض).
  const [bankForm, setBankForm] = useState<BankDetails>(defaultBankDetails ?? EMPTY_BANK_DETAILS)
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
    const ok = await onCreate(id, name.trim(), {
      bankName: bankForm.bankName.trim(),
      beneficiary: bankForm.beneficiary.trim(),
      iban: bankForm.iban.trim().replace(/\s+/g, ''),
    })
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

      <hr className="border-slate-100" />

      <div>
        <label className={labelClass} htmlFor="new-trip-bank-name">اسم البنك</label>
        <input
          id="new-trip-bank-name"
          type="text"
          value={bankForm.bankName}
          onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="new-trip-bank-beneficiary">اسم المستفيد</label>
        <input
          id="new-trip-bank-beneficiary"
          type="text"
          value={bankForm.beneficiary}
          onChange={e => setBankForm({ ...bankForm, beneficiary: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="new-trip-bank-iban">رقم الآيبان (IBAN)</label>
        <input
          id="new-trip-bank-iban"
          type="text"
          dir="ltr"
          value={bankForm.iban}
          onChange={e => setBankForm({ ...bankForm, iban: e.target.value })}
          placeholder="SA0000000000000000000000"
          className={`${inputClass} text-right tabular-nums`}
        />
        <p className="text-[11px] text-slate-400 mt-1.5">
          {defaultBankDetails?.iban ? 'مُعبَّأة من بروفايلك — عدّلها إن احتجت حساباً مختلفاً لهذه الرحلة.' : 'تُحذف المسافات تلقائياً عند الحفظ.'}
        </p>
      </div>

      <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2.5 leading-relaxed">
        بعد الإنشاء، ادعُ الأعضاء عبر رابط دعوة من تبويب "الأعضاء" داخل تفاصيل الرحلة.
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
