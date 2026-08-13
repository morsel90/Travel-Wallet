import { useState, useCallback } from 'react'
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithCredential,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'

// ─── ترقية الحساب المجهول إلى حساب دائم ──────────────────────────────────────
//
// المشكلة: الـ uid المجهول هو المفتاح الوحيد لعضوية الرحلات — `verifyTripPin`
// يكتبها في custom claims، و`isMember()` في firestore.rules تقرأها من التوكن.
// فمن يمسح بيانات متصفحه يفقد كل رحلاته، والرموز مخزَّنة كتجزئة ولا تُعرض بعد
// ضبطها، فمن لا يحفظ الرمز يفقد الوصول نهائياً.
//
// ⚠️ ما لا يُصلحه هذا الخطاف: الحسابات المالية غير متأثرة أصلاً. الأرصدة تُشتق
// من كيانات Traveler بمعرّفات رقمية لا من uid المصادقة، فجهاز ثانٍ لا يغيّر
// رقماً واحداً. الضرر في الوصول وحق التعديل فقط.
//
// ── لماذا الكلفة منخفضة ──────────────────────────────────────────────────────
// `linkWithPopup` يحتفظ بنفس الـ uid، فـ`createdByUid` على كل المصاريف يبقى
// صحيحاً، وخريطة `trips` تبقى كما هي، و**firestore.rules لا تتغيّر بحرف واحد**.
// الميزة تُضاف عند الحافة ولا تمسّ نموذج البيانات ولا القواعد ولا أي حساب.
//
// ── لماذا Google لا Email/Password ───────────────────────────────────────────
// رغم أن Email/Password مُفعَّل أصلاً لدخول المسؤول: Google زرٌّ واحد بلا نموذج
// ولا كلمة مرور ولا تدفّق استرجاع ولا تحقّق بريد — أي أضعاف أقل من الواجهة
// لنفس النتيجة. البريد يبقى إضافة ممكنة لاحقاً إن طُلب.

interface MergeRequest { previousIdToken: string }
interface MergeResponse { merged: number }

export type AccountLinkOutcome =
  /** ربط مباشر — نفس الـ uid، ولا شيء يُنقل. */
  | { status: 'linked' }
  /** الحساب كان موجوداً؛ سُجّل الدخول به ونُقلت عضويات الجلسة المجهولة. */
  | { status: 'merged'; merged: number }
  /** أغلق المستخدم النافذة — ليس خطأً. */
  | { status: 'cancelled' }

export interface UseAccountLink {
  isLinking: boolean
  linkError: string | null
  clearLinkError: () => void
  linkAccount: () => Promise<AccountLinkOutcome | null>
}

/**
 * @param onLinked يُستدعى بعد نجاح الربط أو الدمج. المتوقَّع منه إعادة تحميل
 *   الصفحة: خريطة `trips` تغيّرت في التوكن، و`useAuth` يقرؤها داخل
 *   `onAuthStateChanged` وحده — وهو لا يُطلَق عند مجرد تحديث التوكن. إعادة
 *   التحميل هي أرخص طريقة صحيحة، وتتسق مع التبديل بين الرحلات الذي هو أصلاً
 *   إعادة تحميل كاملة (TRIP_ID يُقرأ مرة عند تحميل الوحدة).
 */
export function useAccountLink(onLinked?: () => void): UseAccountLink {
  const [isLinking, setIsLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const clearLinkError = useCallback(() => setLinkError(null), [])

  const linkAccount = useCallback(async (): Promise<AccountLinkOutcome | null> => {
    const current = auth.currentUser
    if (!current || !current.isAnonymous || isLinking) return null

    setIsLinking(true)
    setLinkError(null)

    // ⚠️ يُلتقط **قبل** أي تبديل حساب: في مسار التعارض أدناه يتغيّر
    // auth.currentUser، فلا سبيل بعدها لإثبات ملكية الجلسة المجهولة. التوكن
    // نفسه هو الإثبات (موقَّع من Firebase)، ويعيش في هذا المتغيّر ثوانيَ فقط —
    // لا يُخزَّن في localStorage ولا يُرسل إلى أي مكان غير دالتنا.
    let previousIdToken: string
    try {
      previousIdToken = await current.getIdToken()
    } catch {
      setIsLinking(false)
      setLinkError('تعذّر تجهيز الجلسة الحالية. حاول مجدداً.')
      return null
    }

    try {
      await linkWithPopup(current, new GoogleAuthProvider())
      // نجح الربط: نفس الـ uid، والعضويات والمصاريف كلها سليمة كما هي.
      onLinked?.()
      return { status: 'linked' }
    } catch (err) {
      const code = (err as { code?: string }).code

      // المستخدم أغلق النافذة أو ألغى — ليس خطأً ولا يستحق رسالة حمراء.
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/user-cancelled'
      ) {
        return { status: 'cancelled' }
      }

      // ⚠️ الحالة التي تُغفَل عادةً: لحساب Google جلسة سابقة (ربطه المستخدم من
      // جهاز آخر). الربط مستحيل، فنسجّل الدخول بالحساب القائم — وعندها **يتغيّر
      // الـ uid** وتُيتَّم عضويات الجلسة المجهولة، فننقلها بالتوكن الملتقط أعلاه.
      if (code === 'auth/credential-already-in-use') {
        const credential = GoogleAuthProvider.credentialFromError(err as never)
        if (!credential) {
          setLinkError('تعذّر إكمال تسجيل الدخول. حاول مجدداً.')
          return null
        }
        try {
          await signInWithCredential(auth, credential)
          const merge = httpsCallable<MergeRequest, MergeResponse>(functions, 'mergeAnonymousTrips')
          const result = await merge({ previousIdToken })
          onLinked?.()
          return { status: 'merged', merged: result.data?.merged ?? 0 }
        } catch (mergeErr) {
          const mergeCode = (mergeErr as { code?: string }).code
          // ⚠️ تسجيل الدخول قد يكون نجح والدمج وحده هو ما فشل. لا نتظاهر بالفشل
          // الكامل: نُبلغ بأن الحساب جاهز وأن بعض الرحلات تحتاج إعادة إدخال رمز.
          setLinkError(
            mergeCode === 'functions/resource-exhausted'
              ? 'تم تسجيل الدخول، لكن عدد الرحلات على هذا الحساب بلغ الحد الأقصى فتعذّر نقل بعضها.'
              : 'تم تسجيل الدخول، لكن تعذّر نقل رحلات الجلسة السابقة. قد تحتاج إعادة إدخال رموزها.',
          )
          onLinked?.()
          return null
        }
      }

      if (code === 'auth/popup-blocked') {
        setLinkError('حجب المتصفح النافذة المنبثقة. اسمح بها ثم حاول مجدداً.')
        return null
      }

      setLinkError('تعذّر حفظ الحساب. حاول مجدداً.')
      return null
    } finally {
      setIsLinking(false)
    }
  }, [isLinking, onLinked])

  return { isLinking, linkError, clearLinkError, linkAccount }
}
