// 🆕 نموذج استعادة رحلة من نسخة JSON احتياطية — docs/PLAN-backup-recovery.md
// المرحلة ٢. يُرسَل إلى Cloud Function باسم restoreTrip، لأن الاستعادة تكتب
// حقولاً تفرض القواعد ثباتها أو تمنعها من العميل أصلاً (createdByUid الأصلي،
// deletedAt التاريخي، سجلّات depositLogs التاريخية) — انظر تعليق الدالة في
// functions/index.js لتفصيل كامل.
//
// ⚠️ بخلاف NewTripForm: لا نمنع محلياً معرّفاً موجوداً في existingIds — الخادم
// وحده يقرر (رحلة فارغة أو غير موجودة، انظر restoreTrip)، والقائمة المحلية
// هنا لا تعرف أصلاً هل الرحلة فارغة أو لا.
import { useRef, useState } from 'react'
import { X, Save, Loader2, Upload, FileJson } from '../../icons'
import { isValidTripId } from '../../utils/tripId'

interface RestoreTripFormProps {
  isSaving: boolean
  onRestore: (tripId: string, backup: unknown) => Promise<boolean>
  onCancel: () => void
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

// فحص محلي سريع وسطحي فقط — الخادم هو المرجع الحقيقي لصحة كل حقل (انظر
// restoreTrip في functions/index.js). الهدف هنا رسالة خطأ فورية لملف واضح
// الفساد (ليس JSON، أو من إصدار مخطط مختلف)، لا تكرار منطق التحقق الكامل.
function looksLikeBackup(value: unknown): value is { schemaVersion: number; tripId?: string } {
  return typeof value === 'object' && value !== null && 'schemaVersion' in value
}

export default function RestoreTripForm({ isSaving, onRestore, onCancel }: RestoreTripFormProps) {
  const [tripId, setTripId] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [backup, setBackup] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setBackup(null)
    setFileName(null)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!looksLikeBackup(parsed) || parsed.schemaVersion !== 1) {
        setError('الملف ليس نسخة احتياطية صالحة، أو من إصدار غير مدعوم.')
        return
      }
      setBackup(parsed)
      setFileName(file.name)
      // اقتراح معرّف الرحلة من الملف نفسه — يبقى قابلاً للتعديل قبل الإرسال.
      if (!tripId.trim() && typeof parsed.tripId === 'string') setTripId(parsed.tripId)
    } catch {
      setError('تعذّرت قراءة الملف — تأكّد أنه JSON صالح.')
    }
  }

  const submit = async () => {
    const id = tripId.trim()
    if (!isValidTripId(id)) {
      setError('المعرّف غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.')
      return
    }
    if (!backup) {
      setError('اختر ملف النسخة الاحتياطية أولاً.')
      return
    }
    setError(null)
    const ok = await onRestore(id, backup)
    if (ok) onCancel()
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); void submit() }}
      className="bg-white rounded-2xl shadow-sm border-2 border-amber-200 p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">استعادة من نسخة احتياطية</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="إلغاء"
          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
        تُقبَل الاستعادة على رحلة غير موجودة أو فارغة تماماً فقط — لحماية أي بيانات حيّة من الاستبدال بالخطأ.
        الخادم يرفض أي رحلة تحوي مسافراً أو مصروفاً واحداً.
      </p>

      <div>
        <label className={labelClass} htmlFor="restore-file">ملف النسخة الاحتياطية (JSON)</label>
        <input
          ref={fileInputRef}
          id="restore-file"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-2 border border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/40 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition-colors"
        >
          {fileName ? <FileJson className="w-4 h-4 text-teal-600 shrink-0" /> : <Upload className="w-4 h-4 text-slate-400 shrink-0" />}
          <span className="truncate">{fileName ?? 'اختر ملفاً...'}</span>
        </button>
      </div>

      <div>
        <label className={labelClass} htmlFor="restore-trip-id">معرّف الرحلة</label>
        <input
          id="restore-trip-id"
          type="text"
          dir="ltr"
          value={tripId}
          onChange={e => setTripId(e.target.value)}
          placeholder="riyadh-2027"
          className={`${inputClass} text-right`}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          استعادة الرحلة
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
