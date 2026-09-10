import type { FormEvent, Dispatch, SetStateAction } from 'react'
import { X, Loader2 } from '../../icons'
import { Modal } from '../Modal'

export interface AdminSignInModalProps {
  email: string
  setEmail: Dispatch<SetStateAction<string>>
  password: string
  setPassword: Dispatch<SetStateAction<string>>
  authError: string | null
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onClose: () => void
  // 🆕 استرداد كلمة المرور داخل التطبيق — يرسل رابط إعادة تعيين عبر Firebase
  // للبريد المدخل بالحقل أعلاه، بدون الحاجة للدخول لـ Firebase Console يدويًا
  onForgotPassword: () => void
  // 🆕 حالة تحميل الإرسال + عدّ تنازلي (ثوانٍ) قبل إتاحة إعادة الإرسال — كلاهما
  // مُدار في App.tsx (وليس هنا) حتى يبقى العدّ التنازلي سارياً حتى لو أُغلقت
  // النافذة وأُعيد فتحها (لا يمكن التحايل عليه بإغلاق/فتح النافذة من جديد)
  isSendingResetEmail: boolean
  resetCooldownSeconds: number
}

const AdminSignInModal = ({
  email, setEmail, password, setPassword,
  authError, onSubmit, onClose, onForgotPassword,
  isSendingResetEmail, resetCooldownSeconds,
}: AdminSignInModalProps) => (
  // 🆕 «الدخول بحساب آخر» لا «تسجيل الدخول للمسؤول» — انظر AccountMenu.tsx:
  // العنوان القديم يَعِد بصلاحية، وهذه النافذة لا تمنح صلاحية إطلاقاً. ما
  // تفعله تبديل الحساب؛ والصلاحية تُقرأ من claims الحساب الذي دخل، إن حملها.
  <Modal maxWidth="max-w-xs" onClose={onClose} label="الدخول بحساب آخر">
    <button type="button" onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 transition-colors">
      <X className="w-5 h-5" />
    </button>
    <h3 className="font-bold mb-1 text-teal-600">الدخول بحساب آخر</h3>
    {/* ⚠️ يقول ما يحدث صراحةً: الجلسة الحالية تُستبدل. بلا هذا السطر يبدو
        النموذج كأنه «يضيف» صلاحية للحساب الحالي، وهو ما لا يفعله. */}
    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
      تُستبدل جلستك الحالية بجلسة الحساب الذي تدخل به، وتظهر لك صلاحياته هو.
    </p>
    <form onSubmit={onSubmit}>
      <input
        type="email" required autoFocus placeholder="البريد الإلكتروني" value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded-xl p-3 mb-2 focus:ring-2 outline-none" dir="ltr"
      />
      <input
        type="password" required placeholder="كلمة المرور" value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded-xl p-3 mb-2 focus:ring-2 outline-none" dir="ltr"
      />
      <button
        type="button"
        onClick={onForgotPassword}
        disabled={isSendingResetEmail || resetCooldownSeconds > 0}
        className="flex items-center justify-center gap-1.5 text-xs text-teal-600 hover:underline font-bold w-full text-center mb-3 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
      >
        {isSendingResetEmail ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> جارٍ الإرسال...</>
        ) : resetCooldownSeconds > 0 ? (
          `أعد المحاولة خلال ${resetCooldownSeconds} ثانية`
        ) : (
          'نسيت كلمة المرور؟'
        )}
      </button>
      {authError && <p className="text-xs text-rose-500 mb-2 text-center font-bold">{authError}</p>}
      <button type="submit" className="w-full bg-teal-600 text-white py-2.5 rounded-xl font-bold">دخول</button>
    </form>
  </Modal>
)

export default AdminSignInModal