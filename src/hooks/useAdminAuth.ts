// 🆕 منطق مصادقة المسؤول كاملاً — استُخرج من App.tsx لتقليل حجمه (على غرار useExpenseActions)
// يملك حالة نافذة دخول المسؤول + معالجات الدخول/الخروج/استرداد كلمة المرور.
// 🆕 استرداد كلمة المرور (وعدّه التنازلي) لم يعد هنا — انظر usePasswordReset.ts.
import { useState, useCallback } from 'react'
import type { FormEvent } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../firebase'
import type { UsePasswordResetResult } from './usePasswordReset'

interface UseAdminAuthArgs {
  /**
   * 🆕 استرداد كلمة المرور لم يعد يعيش هنا — استُخرج إلى `usePasswordReset`
   * ويُمرَّر جاهزاً، لأن `AuthGate` (قبل تسجيل الدخول) يحتاجه أيضاً وهذا
   * الخطّاف لا يُركَّب هناك أصلاً. المهلة والرسالة الموحّدة وابتلاع الخطأ
   * — كلها هناك الآن، نسخة واحدة لمستدعيَين. انظر تعليق ذلك الملف.
   */
  passwordReset: UsePasswordResetResult
}

export function useAdminAuth({ passwordReset }: UseAdminAuthArgs) {
  const [showAdminSignIn, setShowAdminSignIn] = useState(false)
  const [adminEmail,      setAdminEmail]      = useState('')
  const [adminPassword,   setAdminPassword]   = useState('')
  const [authError,       setAuthError]       = useState<string | null>(null)

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

  // الحقل الفارغ وحده يُعالَج هنا: رسالته تعتمد على تسمية الحقل في *هذه*
  // النافذة («بالحقل أعلاه»)، بينما بقية المنطق موحّد في usePasswordReset.
  const handleForgotPassword = useCallback(async () => {
    const outcome = await passwordReset.requestReset(adminEmail)
    if (outcome === 'missing-email') {
      setAuthError('أدخل بريدك الإلكتروني بالحقل أعلاه أولاً ثم اضغط "نسيت كلمة المرور؟".')
    } else if (outcome === 'sent') {
      setAuthError(null)
    }
  }, [adminEmail, passwordReset])

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
      isSendingResetEmail: passwordReset.isSendingReset,
      resetCooldownSeconds: passwordReset.resetCooldownSeconds,
    },
  }
}
