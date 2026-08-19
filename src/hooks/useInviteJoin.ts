// 🆕 انضمام فوري عبر رابط دعوة (?invite=TOKEN) — بديل لبوابة رمز الرحلة
// اليدوية (TripGate)، لا استبدال لها. انظر functions/index.js: joinViaInvite.
//
// ⚠️ لا يُستدعى إلا بعد استقرار حالة المصادقة (user غير null): الدالة الخادمية
// تحتاج توكناً موقّعاً لأي حساب — ولو مجهولاً — وuseAuth يضمن تسجيل دخول مجهول
// تلقائي، فالانتظار هنا قصير (نفس ما تنتظره verifyTripPin أصلاً).
//
// ⚠️ لا نستهلك التوكن أكثر من مرة واحدة لكل تحميل صفحة (attemptedRef لا state):
// state إضافية كانت ستُعيد المحاولة عند كل إعادة رسم بسبب تغيّر مرجع showToast.
import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { User } from 'firebase/auth'
import { functions } from '../firebase'
import { INVITE_TOKEN, tripUrl } from '../utils/tripId'
import { describeInviteError } from '../utils/callableErrors'
import type { ToastMessage } from '../types'

interface JoinViaInviteRequest { inviteToken: string }
interface JoinViaInviteResponse { success: boolean; tripId: string }

export type InviteJoinStatus = 'idle' | 'joining' | 'done'

/** يحذف `?invite=` من الرابط دون إعادة تحميل — يبقي بقية المعاملات كما هي. */
function clearInviteParam(): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState(null, '', url.toString())
  } catch {
    // بيئة بدون window (اختبارات) — تجاهل
  }
}

/**
 * @returns 'joining' طالما التحقق جارٍ (App.tsx يعرض شاشة تحميل بدل أي شيء
 * آخر خلالها)؛ 'done' حين لا يوجد رابط دعوة أصلاً أو انتهى التعامل معه (نجاحاً
 * أو فشلاً). النجاح لا يُمثَّل كحالة منفصلة: هو إعادة توجيه فورية (location
 * جديد بالكامل)، فلا يوجد شيء يستحق عرضه بعده في هذه الصفحة.
 */
export function useInviteJoin(
  user: User | null,
  showToast: (msg: ToastMessage, durationMs?: number) => void,
): InviteJoinStatus {
  const [status, setStatus] = useState<InviteJoinStatus>(INVITE_TOKEN ? 'joining' : 'done')
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!INVITE_TOKEN || attemptedRef.current || !user) return
    attemptedRef.current = true

    const join = httpsCallable<JoinViaInviteRequest, JoinViaInviteResponse>(functions, 'joinViaInvite')
    join({ inviteToken: INVITE_TOKEN })
      .then(async ({ data }) => {
        // التوكن الجديد يحمل claim العضوية التي منحتها الدالة للتوّ — نفس ما
        // تفعله verifyTripPin قبل أي استخدام للرحلة.
        await user.getIdToken(true)
        // إعادة توجيه كاملة لا تحديث حالة محلي: TRIP_ID يُحسب مرة واحدة عند
        // تحميل الوحدة (انظر utils/tripId.ts)، وتبديل الرحلة يتطلب دائماً
        // إعادة تحميل — نفس القيد المعمول به في كل مكان آخر بالتطبيق.
        window.location.replace(tripUrl(data.tripId))
      })
      .catch((err: unknown) => {
        clearInviteParam()
        showToast({ text: describeInviteError(err).text, type: 'error' }, 6000)
        setStatus('done')
      })
  }, [user, showToast])

  return status
}
