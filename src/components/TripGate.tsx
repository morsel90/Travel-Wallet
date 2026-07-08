import { useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, Lock } from '../icons'

// ─── TripGate ─────────────────────────────────────────────────────────────────
// شاشة كاملة تمنع عرض لوحة المصاريف حتى يتحقق المستخدم من رمز الرحلة المشترك.
// تُعرض بدلاً من اللوحة الرئيسية (وليست Modal فوقها) لأن Firestore سيرفض أي
// قراءة/إنشاء قبل التحقق على أي حال (انظر firestore.rules و useAuth.ts).
interface TripGateProps {
  loading: boolean
  error: string | null
  onSubmit: (pin: string) => Promise<boolean>
}

const TripGate = ({ loading, error, onSubmit }: TripGateProps) => {
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!pin.trim() || submitting) return
    setSubmitting(true)
    const ok = await onSubmit(pin.trim())
    setSubmitting(false)
    if (ok) setPin('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-teal-600" />
        </div>

        {loading ? (
          <>
            <p className="text-sm font-bold text-slate-700 mb-3">جارٍ التحقق...</p>
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin mx-auto" />
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-1">أدخل رمز الرحلة</h1>
            <p className="text-xs text-slate-400 mb-5">
              هذا التطبيق خاص بمجموعة الرحلة فقط. اطلب الرمز من منظّم الرحلة.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password" required autoFocus value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="رمز الرحلة"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm text-center focus:ring-2 focus:ring-teal-500 outline-none"
                dir="ltr"
              />
              {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !pin.trim()}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {submitting ? 'جارٍ التحقق...' : 'متابعة'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default TripGate
