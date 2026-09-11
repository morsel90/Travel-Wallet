// 🆕 استرداد كلمة المرور — منطق واحد يشاركه مستدعيان: `AuthGate` (قبل تسجيل
// الدخول) — وهي اليوم سطح تسجيل الدخول الوحيد في التطبيق.
//
// ⚠️ **ولماذا استُخرج أصلاً**: كان يعيش داخل `useAdminAuth` وحده، ورابطه
// الوحيد داخل نافذة دخولها — أي أنه **لا يُبلَغ إلا بعد تسجيل الدخول**.
// (كلاهما حُذف لاحقاً بالكامل — انظر docs/DECISIONS.md؛ هذا الخطّاف بقي لأن
// مكانه الصحيح كان `AuthGate` منذ البداية.)
// فمن نسي كلمة مروره — وهو الشخص الوحيد الذي تعنيه هذه الميزة — كان واقفاً
// عند `AuthGate` بلا أي مخرج من داخل التطبيق. الميزة كانت موجودة وسليمة
// وغير قابلة للبلوغ ممّن يحتاجها، وهي حالة لا يكشفها اختبار ناجح أبداً.
//
// ⚠️ **قاعدتان أمنيتان لا تُخفَّفان، ووجودهما هنا هو سبب توحيد المنطق:**
//
//  ١. **لا نكشف ما إذا كان البريد مسجّلاً أم لا.** الرسالة واحدة في كل
//     الحالات («إذا كان البريد صحيحاً ومسجّلاً…») والخطأ يُبتلع عمداً. لو
//     اختلف الردّ بين بريد موجود وآخر غير موجود، صار النموذج أداة تعداد
//     حسابات (account enumeration) مجانية لأي شخص.
//
//  ٢. **مهلة ٦٠ ثانية بين محاولة وأخرى**، ومرجعها لحظة زمنية مطلقة
//     (`cooldownUntil`) لا عدّاد يُصفَّر. هذا ما يجعلها صامدة أمام إغلاق
//     النافذة وإعادة فتحها: العدّ يعيش في هذا الخطّاف لا في المكوّن المعروض.
//     نسخُ هذا المنطق في مكانين كان كفيلاً بأن تنحرف إحدى النسختين لاحقاً
//     فتسقط إحدى القاعدتين في مسار واحد دون الآخر، بلا أن يفشل شيء.
import { useState, useCallback } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { useCountdown } from './useCountdown'
import type { ToastMessage } from '../types'

/** ما حدث فعلاً — المستدعي يقرّر كيف يعرض «أدخل بريدك أولاً» بما يناسب شاشته. */
export type ResetOutcome = 'sent' | 'missing-email' | 'busy'

export interface UsePasswordResetResult {
  requestReset: (email: string) => Promise<ResetOutcome>
  isSendingReset: boolean
  resetCooldownSeconds: number
}

interface UsePasswordResetArgs {
  showToast: (msg: ToastMessage, durationMs?: number) => void
}

export function usePasswordReset({ showToast }: UsePasswordResetArgs): UsePasswordResetResult {
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const resetCooldownSeconds = useCountdown(cooldownUntil)

  const requestReset = useCallback(async (email: string): Promise<ResetOutcome> => {
    if (isSendingReset || resetCooldownSeconds > 0) return 'busy'
    const trimmed = email.trim()
    if (!trimmed) return 'missing-email'

    setIsSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, trimmed)
    } catch {
      // ⚠️ يُبتلع عمداً — انظر القاعدة ١ أعلاه. لا تُضِف هنا فرعاً يميّز
      // 'auth/user-not-found' مهما بدا مفيداً للمستخدم: ذلك هو التسريب نفسه.
    } finally {
      setIsSendingReset(false)
      setCooldownUntil(Date.now() + 60_000)
      showToast(
        { text: 'إذا كان البريد صحيحًا ومسجّلاً، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.', type: 'success' },
        6000,
      )
    }
    return 'sent'
  }, [isSendingReset, resetCooldownSeconds, showToast])

  return { requestReset, isSendingReset, resetCooldownSeconds }
}
