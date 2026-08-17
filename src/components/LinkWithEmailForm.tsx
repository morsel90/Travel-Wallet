// 🆕 نموذج حفظ الحساب ببريد إلكتروني وكلمة مرور — البديل الثاني لـ Google في
// SaveAccountBanner. انظر تعليق hooks/useAccountLink.ts لماذا أُضيف هذا الآن:
// من لا يملك حساب Google (أو يتجنّب OAuth) كان بلا أي شبكة أمان إطلاقاً.
//
// ⚠️ نفس النموذج يخدم غرضين دون تمييز في الواجهة: "حفظ حساب جديد" و"استعادة
// حساب محفوظ مسبقاً من جلسة مجهولة جديدة" — كلاهما إدخال بريد وكلمة مرور،
// والفرق (ربط مباشر أو دمج) يحسمه الخطاف داخلياً حسب رد Firebase.
import { useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2 } from '../icons'
import { haptic } from '../utils/haptics'
import type { useAccountLink } from '../hooks/useAccountLink'

interface LinkWithEmailFormProps {
  link: ReturnType<typeof useAccountLink>
  onCancel: () => void
}

const inputClass =
  'w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none'

export default function LinkWithEmailForm({ link, onCancel }: LinkWithEmailFormProps) {
  const { isLinking, linkError, clearLinkError, linkWithEmail, resetPassword } = link
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  const submit = async () => {
    clearLinkError()
    await linkWithEmail(email.trim(), password)
  }

  const requestReset = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    haptic.light()
    setResetState('sending')
    const ok = await resetPassword(trimmed)
    setResetState(ok ? 'sent' : 'failed')
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); void submit() }}
      className="mt-3 pt-3 border-t border-amber-200 space-y-2.5"
    >
      <div>
        <label className="sr-only" htmlFor="link-email">البريد الإلكتروني</label>
        <input
          id="link-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={`${inputClass} text-right`}
        />
      </div>

      <div>
        <label className="sr-only" htmlFor="link-password">كلمة المرور</label>
        <input
          id="link-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="6 خانات فأكثر"
          className={`${inputClass} text-right`}
        />
      </div>

      {/* ⚠️ لا تحتاج معرفة كلمة المرور الحالية أصلاً — انظر تعليق resetPassword
          في الخطاف. متاحة دائماً متى وُجد بريد، لا بعد فشل الحفظ فقط. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void requestReset()}
          disabled={!email.trim() || resetState === 'sending'}
          className="text-[11px] font-bold text-teal-700 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          نسيت كلمة المرور؟
        </button>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLinking || !email.trim() || password.length < 6}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
          >
            {isLinking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            حفظ
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-white transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>

      {resetState === 'sent' && (
        <p className="text-xs text-teal-800 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" />
          أُرسل رابط إعادة التعيين إلى بريدك إن كان مسجَّلاً — افتحه، ثم عد وحاول الحفظ بالكلمة الجديدة.
        </p>
      )}
      {resetState === 'failed' && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          تعذّر إرسال رابط إعادة التعيين. تحقّق من صياغة البريد وحاول مجدداً.
        </p>
      )}
      {linkError && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          {linkError}
        </p>
      )}
    </form>
  )
}
