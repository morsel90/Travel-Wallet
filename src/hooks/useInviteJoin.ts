// 🆕 انضمام فوري عبر رابط دعوة (?invite=TOKEN) — طريقة الانضمام الوحيدة لرحلة
// بعد إلغاء رمز الرحلة (PIN). انظر functions/index.js: joinViaInvite.
//
// ⚠️ لا يُستدعى إلا بعد استقرار حالة المصادقة (user غير null): الدالة الخادمية
// تحتاج توكناً موقّعاً لحساب حقيقي (Google أو بريد إلكتروني). App.tsx يعرض
// AuthGate قبل هذا الـ hook أصلاً (انظر ترتيب المسارات فيه)، فـ user هنا يعني
// دائماً حساباً حقيقياً سجّل دخوله بالفعل — لا انتظار جلسة مجهولة.
//
// ⚠️ لا نستهلك التوكن أكثر من مرة واحدة لكل تحميل صفحة (attemptedRef لا state):
// state إضافية كانت ستُعيد المحاولة عند كل إعادة رسم بسبب تغيّر مرجع showToast.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import { httpsCallable } from 'firebase/functions'
import type { User } from 'firebase/auth'
import { functions } from '../firebase'
import { INVITE_TOKEN, tripUrl } from '../utils/tripId'
import { describeInviteError } from '../utils/callableErrors'
import type { ToastMessage } from '../types'

interface JoinViaInviteRequest { inviteToken: string }
interface JoinViaInviteResponse {
  success: boolean
  tripId: string
  // 🆕 صحيحة فقط حين زوّدت joinViaInvite ملف مسافر جديداً بلا اسم عرض حقيقي —
  // انظر تعليقها في functions/index.js. اختيارية للتوافق مع نشر خادمي أقدم
  // (لا يرسلها بعد) — غيابها يُعامَل كـ false، أي لا نموذج اسم.
  needsName?: boolean
}

interface UpdateMyTravelerNameRequest { tripId: string; name: string }
interface UpdateMyTravelerNameResponse { success: boolean }

export type InviteJoinStatus = 'idle' | 'joining' | 'needsName' | 'done'

export interface UseInviteJoinResult {
  /**
   * 'joining' طالما التحقق جارٍ (App.tsx يعرض شاشة تحميل بدل أي شيء آخر
   * خلالها)؛ 'needsName' حين نجح الانضمام لكن الملف المُزوَّد بلا اسم حقيقي —
   * InviteJoinScreen يعرض نموذج اسم من خطوة واحدة بدل التوجيه الفوري؛ 'done'
   * حين لا يوجد رابط دعوة أصلاً أو انتهى التعامل معه (نجاحاً بلا حاجة لاسم، أو
   * فشلاً). النجاح لا يُمثَّل كحالة منفصلة غير 'needsName': هو إعادة توجيه
   * فورية (location جديد بالكامل)، فلا يوجد شيء يستحق عرضه بعده في هذه الصفحة.
   */
  status: InviteJoinStatus
  /** يُرسل الاسم عبر updateMyTravelerName ثم يوجّه للرحلة في كل الأحوال — فشل الكتابة لا يحبس المستخدم خارج رحلته. */
  submitName: (name: string) => void
  /** يتخطّى تسمية الملف ويوجّه للرحلة مباشرة — التسمية اختيارية لا إلزامية. */
  skipName: () => void
  isSubmittingName: boolean
}

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

export function useInviteJoin(
  user: User | null,
  showToast: (msg: ToastMessage, durationMs?: number) => void,
): UseInviteJoinResult {
  const [status, setStatus] = useState<InviteJoinStatus>(INVITE_TOKEN ? 'joining' : 'done')
  const [pendingTripId, setPendingTripId] = useState<string | null>(null)
  const [isSubmittingName, setIsSubmittingName] = useState(false)
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

        // 🆕 ملف بلا اسم حقيقي: نعرض نموذج اسم من خطوة واحدة قبل التوجيه، بدل
        // توجيه فوري يترك المنظّم يرى "مسافر جديد" في قائمته.
        if (data.needsName) {
          setPendingTripId(data.tripId)
          setStatus('needsName')
          return
        }

        // إعادة توجيه كاملة لا تحديث حالة محلي: TRIP_ID يُحسب مرة واحدة عند
        // تحميل الوحدة (انظر utils/tripId.ts)، وتبديل الرحلة يتطلب دائماً
        // إعادة تحميل — نفس القيد المعمول به في كل مكان آخر بالتطبيق.
        window.location.replace(tripUrl(data.tripId))
      })
      .catch((err: unknown) => {
        clearInviteParam()
        Sentry.captureException(err, { tags: { source: 'callable' } })
        showToast({ text: describeInviteError(err).text, type: 'error' }, 6000)
        setStatus('done')
      })
  }, [user, showToast])

  // ⚠️ **لا تحبس المستخدم خارج رحلته لأن الكتابة فشلت**: التسمية تحسين تجربة
  // استخدام، لا شرطاً للدخول. التوجيه يقع في finally بصرف النظر عن نجاح
  // الكتابة أو فشلها — أسوأ أثر ممكن هو ملف باسمه الافتراضي، يُصلحه لاحقاً
  // المنظّم عبر تبويب "المسافرون"، أو نفس المستخدم لو أُتيح له مساراً آخر مستقبلاً.
  const submitName = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!pendingTripId || !user || !trimmed) return

    setIsSubmittingName(true)
    const update = httpsCallable<UpdateMyTravelerNameRequest, UpdateMyTravelerNameResponse>(functions, 'updateMyTravelerName')
    update({ tripId: pendingTripId, name: trimmed })
      .catch((err: unknown) => {
        console.error('[useInviteJoin] تعذّر حفظ اسم المسافر:', err)
      })
      .finally(() => {
        window.location.replace(tripUrl(pendingTripId))
      })
  }, [pendingTripId, user])

  const skipName = useCallback(() => {
    if (!pendingTripId) return
    window.location.replace(tripUrl(pendingTripId))
  }, [pendingTripId])

  return { status, submitName, skipName, isSubmittingName }
}
