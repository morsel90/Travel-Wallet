// 🆕 منطق مصادقة المسؤول كاملاً — استُخرج من App.tsx لتقليل حجمه (على غرار useExpenseActions)
// يملك حالة نافذة دخول المسؤول + معالجات الدخول/الخروج/استرداد كلمة المرور.
// حالة العدّ التنازلي (resetCooldown) تبقى هنا حتى تظل سارية حتى لو أُغلقت النافذة وأُعيد فتحها.
import { useState, useCallback } from 'react'
import type { FormEvent } from 'react'
import {
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from '../firebase'
import { useCountdown } from './useCountdown'
import type { ToastMessage } from '../types'

interface UseAdminAuthArgs {
  showToast: (msg: ToastMessage, durationMs?: number) => void
}

export function useAdminAuth({ showToast }: UseAdminAuthArgs) {
  const [showAdminSignIn, setShowAdminSignIn] = useState(false)
  const [adminEmail,      setAdminEmail]      = useState('')
  const [adminPassword,   setAdminPassword]   = useState('')
  const [authError,       setAuthError]       = useState<string | null>(null)

  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false)
  const [resetCooldownUntil,  setResetCooldownUntil]  = useState<number | null>(null)
  const resetCooldownSeconds = useCountdown(resetCooldownUntil)

  const openAdminSignIn = useCallback(() => setShowAdminSignIn(true), [])

  const closeAdminSignIn = useCallback(() => {
    setShowAdminSignIn(false)
    setAuthError(null)
  }, [])

  const handleAdminSignIn = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
      setShowAdminSignIn(false); setAdminEmail(''); setAdminPassword('')
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      const message =
        code === 'auth/invalid-email'         ? 'صيغة البريد الإلكتروني غير صحيحة.' :
        code === 'auth/user-disabled'          ? 'تم تعطيل هذا الحساب. تواصل مع الدعم الفني.' :
        code === 'auth/too-many-requests'      ? 'محاولات فاشلة كثيرة متتالية، تم إيقاف الدخول مؤقتًا. حاول بعد قليل.' :
        code === 'auth/network-request-failed' ? 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مجددًا.' :
        'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      setAuthError(message)
      setAdminPassword('')
    }
  }, [adminEmail, adminPassword])

  const handleAdminSignOut = useCallback(async () => {
    // بعد الخروج، مستمع onAuthStateChanged في useAuth يرصد غياب المستخدم
    // ويُظهر AuthGate من جديد — لا جلسة بديلة تُنشأ تلقائياً (لا وجود لجلسات
    // مجهولة بعد إلغاء PIN؛ انظر docs/DECISIONS.md).
    try { await signOut(auth) } catch (err) { console.error(err) }
  }, [])

  const handleForgotPassword = useCallback(async () => {
    if (isSendingResetEmail || resetCooldownSeconds > 0) return
    if (!adminEmail.trim()) {
      setAuthError('أدخل بريدك الإلكتروني بالحقل أعلاه أولاً ثم اضغط "نسيت كلمة المرور؟".')
      return
    }
    setIsSendingResetEmail(true)
    try {
      await sendPasswordResetEmail(auth, adminEmail.trim())
    } catch {
      // نتجاهل الخطأ عمداً حتى لا نكشف ما إذا كان البريد مسجّلاً أم لا (حماية من تعداد الحسابات)
    } finally {
      setAuthError(null)
      setIsSendingResetEmail(false)
      setResetCooldownUntil(Date.now() + 60_000)
      showToast({ text: 'إذا كان البريد صحيحًا ومسجّلاً، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.', type: 'success' })
    }
  }, [adminEmail, showToast, isSendingResetEmail, resetCooldownSeconds])

  return {
    // حالة الفتح + المُبدّلات الإجرائية التي يحتاجها Header
    showAdminSignIn,
    openAdminSignIn,
    handleAdminSignOut,
    // مجموعة الخصائص الجاهزة لتمريرها إلى AdminSignInModal عبر AuthFlow
    adminModalProps: {
      email: adminEmail,       setEmail: setAdminEmail,
      password: adminPassword, setPassword: setAdminPassword,
      authError,
      onSubmit: handleAdminSignIn,
      onClose: closeAdminSignIn,
      onForgotPassword: handleForgotPassword,
      isSendingResetEmail,
      resetCooldownSeconds,
    },
  }
}
