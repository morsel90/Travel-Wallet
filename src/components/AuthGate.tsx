import { useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, LogIn, Mail } from '../icons'
import { INVITE_TOKEN } from '../utils/tripId'

// ─── شعار Google ──────────────────────────────────────────────────────────────
// 🆕 ليس من lucide-react (أيقونات عامة لا شعارات علامات تجارية) — علامة Google
// الرسمية متعددة الألوان، ثابتة ولا تتغيّر، فتُضمَّن كـSVG خام هنا بدل استيرادها.
const GoogleLogo = () => (
  <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
)

interface AuthGateProps {
  /** صحيحة فقط أثناء استعادة Firebase لجلسة محفوظة عند أول تحميل. */
  loading: boolean
  isSigningIn: boolean
  signInError: string | null
  onSignInGoogle: () => void
  onSignInEmail: (email: string, password: string, mode: 'signIn' | 'signUp') => void
}

// ─── AuthGate ─────────────────────────────────────────────────────────────────
// 🆕 حلّت محل TripGate (رمز الرحلة/PIN، مُلغى — انظر docs/DECISIONS.md). تُعرض
// كلّما لم يكن هناك مستخدم مسجَّل دخوله — تغطي دخول رابط دعوة (?invite=TOKEN)
// ورابط رحلة عادي (?trip=X) معاً بشاشة واحدة، فلا مسار انضمام ذاتي آخر متبقٍ.
export default function AuthGate({ loading, isSigningIn, signInError, onSignInGoogle, onSignInEmail }: AuthGateProps) {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailMode, setEmailMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleEmailSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim() || !password || isSigningIn) return
    onSignInEmail(email.trim(), password, emailMode)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
          <LogIn className="w-6 h-6 text-teal-600" />
        </div>

        {loading ? (
          <>
            <p className="text-sm font-bold text-slate-700 mb-3">جارٍ التحقق من جلستك...</p>
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin mx-auto" />
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-1">
              {INVITE_TOKEN ? 'أهلاً بك في الرحلة' : 'سجّل الدخول لمتابعة'}
            </h1>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              {INVITE_TOKEN
                ? 'انضم للرحلة عبر حساب Google لعرض كشف حسابك ومتابعة مصاريفك.'
                : 'سجّل الدخول عبر حساب Google لعرض رحلاتك ومتابعة مصاريفك.'}
            </p>

            <button
              type="button"
              onClick={onSignInGoogle}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleLogo />}
              متابعة عبر Google
            </button>
            <p className="text-[11px] text-slate-400 mt-2">
              يُفضل فتح الرابط في متصفح خارجي (Safari / Chrome) لسهولة تسجيل الدخول.
            </p>

            {signInError && (
              <p className="text-xs text-rose-500 font-bold mt-3">{signInError}</p>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowEmailForm(v => !v)}
                className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors mx-auto"
              >
                <Mail className="w-3.5 h-3.5" /> أو عبر البريد الإلكتروني
              </button>

              {showEmailForm && (
                <form onSubmit={handleEmailSubmit} className="space-y-2.5 mt-3 text-right">
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="البريد الإلكتروني"
                    dir="ltr"
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="كلمة المرور"
                    dir="ltr"
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="submit"
                    disabled={isSigningIn || !email.trim() || !password}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isSigningIn && <Loader2 className="w-4 h-4 animate-spin" />}
                    {emailMode === 'signUp' ? 'إنشاء حساب' : 'تسجيل الدخول'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailMode(m => m === 'signUp' ? 'signIn' : 'signUp')}
                    className="w-full text-[11px] font-bold text-teal-600 hover:text-teal-700 transition-colors"
                  >
                    {emailMode === 'signUp' ? 'لديك حساب؟ سجّل الدخول' : 'حساب جديد؟ أنشئ حساباً'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
