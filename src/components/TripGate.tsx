import { useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, Lock } from '../icons'

// ─── دالة مساعدة لتنسيق الوقت ───────────────────────────────────────────────
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ─── TripGate ─────────────────────────────────────────────────────────────────
// شاشة كاملة تمنع عرض لوحة المصاريف حتى يتحقق المستخدم من رمز الرحلة المشترك.
// 🆕 يدعم الآن عرض العد التنازلي للحظر (Rate Limiting) مع تعطيل الإدخال تلقائياً.
interface TripGateProps {
  loading: boolean
  error: string | null
  rateLimitSeconds: number | null // 🆕 ثواني متبقية للحظر (null = لا حظر)
  onSubmit: (pin: string) => Promise<boolean>
}

const TripGate = ({ loading, error, rateLimitSeconds, onSubmit }: TripGateProps) => {
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!pin.trim() || submitting || rateLimitSeconds !== null) return
    setSubmitting(true)
    const ok = await onSubmit(pin.trim())
    setSubmitting(false)
    if (ok) setPin('')
  }

  // 🆕 هل الإدخال معطل؟ (حظر أو تحميل أو إرسال)
  const isDisabled = submitting || loading || rateLimitSeconds !== null

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
                type="password"
                required
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={rateLimitSeconds !== null ? 'محظور مؤقتاً' : 'رمز الرحلة'}
                disabled={rateLimitSeconds !== null}
                className={`
                  w-full border rounded-xl p-3 text-sm text-center outline-none transition-all
                  ${rateLimitSeconds !== null 
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' 
                    : 'border-slate-200 focus:ring-2 focus:ring-teal-500'
                  }
                `}
                dir="ltr"
              />
              
              {/* 🆕 رسالة الخطأ العادية */}
              {error && rateLimitSeconds === null && (
                <p className="text-xs text-rose-500 font-bold">{error}</p>
              )}
              
              {/* 🆕 عداد الحظر */}
              {rateLimitSeconds !== null && (
                <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">
                  <span className="text-lg font-mono font-bold text-amber-700 tabular-nums">
                    {formatTime(rateLimitSeconds)}
                  </span>
                  <span className="text-xs text-amber-600">
                    ⏳ المحاولة القادمة
                  </span>
                </div>
              )}
              
              <button
                type="submit"
                disabled={isDisabled}
                className={`
                  w-full font-bold py-3 rounded-xl transition-colors
                  ${rateLimitSeconds !== null
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50'
                  }
                `}
              >
                {submitting 
                  ? 'جارٍ التحقق...' 
                  : rateLimitSeconds !== null 
                    ? `محظور (${formatTime(rateLimitSeconds)})` 
                    : 'متابعة'
                }
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default TripGate