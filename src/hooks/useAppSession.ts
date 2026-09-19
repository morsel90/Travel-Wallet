import type { ToastMessage } from '../types'
import { useAuth, usePasswordReset, useOnlineStatus, useInviteJoin, useUserProfile } from './index'
import { TRIP_ID } from '../utils/tripId'

// ─── الجلسة: من أنا، وهل أدخل هذه الرحلة؟ ─────────────────────────────────────
//
// أول المجموعات الثلاث في useAppCoordinator. لا تعرف شيئاً عن محتوى أي رحلة —
// فقط هوية المستخدم وبروفايله العام وحقّه في الوصول. كل ما بعدها يستهلك
// `user` و`isAdmin` و`hasAccess` من هنا.

interface UseAppSessionArgs {
  showToast: (msg: ToastMessage, durationMs?: number) => void
}

export function useAppSession({ showToast }: UseAppSessionArgs) {
  const {
    user, isAdmin, authLoading, joinedTripIds,
    signInError, isSigningIn, signInWithGoogle, signInWithEmail, signOut,
  } = useAuth()
  const isOnline = useOnlineStatus()
  // 🆕 بروفايل المستخدم العام (اسم/بنك) — يُدار من شاشة بروفايل منفصلة
  // (ModalManager). هو المصدر الوحيد لبيانات بنك أي رحلة ينظّمها هذا المستخدم
  // (انظر useOrganizerBankDetails في useAppTrip). لا يحتاج hasAccess: مستقل عن
  // أي رحلة، ومتاح لأي مستخدم مسجّل دخوله حتى قبل الانضمام لأي رحلة.
  const profile = useUserProfile(user)
  // 🆕 لا رمز رحلة بعد الآن — الوصول عضوية مباشرة (claim) أو صلاحية مسؤول
  // عالمية، بلا خطوة تحقّق وسيطة. انظر docs/DECISIONS.md.
  const hasAccess = isAdmin || (!authLoading && joinedTripIds.includes(TRIP_ID))

  // 🆕 رابط دعوة بنقرة واحدة (?invite=TOKEN) — يُستهلك مرة واحدة عند تحميل
  // الصفحة، قبل أي شيء آخر. النجاح إعادة توجيه كاملة (لا حالة تُستهلك هنا)،
  // والفشل يُنظّف الرابط ويعرض توستاً ثم يُكمل التدفّق المعتاد (رحلاتي/بوابة الرمز).
  const invite = useInviteJoin(user, showToast)

  // 🆕 لـ`AuthGate` وحدها — سطح تسجيل الدخول الوحيد في التطبيق بعد حذف
  // «الدخول بحساب آخر» ونافذته. انظر usePasswordReset.ts وdocs/DECISIONS.md.
  const passwordReset = usePasswordReset({ showToast })

  return {
    user, isAdmin, hasAccess, isOnline,
    authLoading, joinedTripIds,
    signInError, isSigningIn, signInWithGoogle, signInWithEmail, signOut,
    profile,
    invite,
    passwordReset,
  }
}
