import { useState, useCallback } from 'react'
import {
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import { markUidChanged } from '../utils/mergeNotice'

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
// linkWithPopup/linkWithCredential يحتفظان بنفس الـ uid، فـ`createdByUid` على
// كل المصاريف يبقى صحيحاً، وخريطة `trips` تبقى كما هي، و**firestore.rules لا
// تتغيّر بحرف واحد**. الميزة تُضاف عند الحافة ولا تمسّ نموذج البيانات ولا
// القواعد ولا أي حساب.
//
// ── 🆕 Email/Password: لماذا أُضيف الآن بعد أن أُجِّل عمداً ─────────────────
// Google وحدها كانت كافية للمسار السعيد (زرّ واحد بلا نموذج). لكنها تترك من
// لا يملك حساب Google — أو من يتجنّب OAuth — بلا شبكة أمان إطلاقاً، وهذا
// بالضبط المستخدم الأكثر عرضة لفقدان الوصول (لا يوجد لديه مسار استرجاع آخر).
// التكلفة الإضافية (نموذج + كلمة مرور + استرجاعها) مقبولة الآن لأنها **الخيار
// الوحيد** لهذه الفئة، لا بديلاً أرخص عن Google لمن يملكها أصلاً — الواجهة
// تعرض الاثنين معاً، Google أولاً.
//
// ⚠️ مسار التعارض هنا (`auth/email-already-in-use`) هو *نفسه* مسار "الجهاز
// الثاني" و"استعادة الوصول بعد فقدان الجلسة": من يملك حساباً بريدياً محفوظاً
// مسبقاً ويحاول "حفظ الحساب" مجدداً من جلسة مجهولة جديدة يصطدم بهذا الخطأ
// بالضبط — فتتحقق الدالة من كلمة المرور بمحاولة تسجيل الدخول بها مباشرة، وإن
// صحّت دمجت عضويات الجلسة الجديدة في حسابه القائم. لا حاجة لشاشة "تسجيل دخول"
// منفصلة: نموذج "حفظ الحساب" نفسه يخدم الغرضين.

interface MergeRequest { previousIdToken: string }
interface MergeResponse { merged: number }

export type AccountLinkOutcome =
  /** ربط مباشر — نفس الـ uid، ولا شيء يُنقل. */
  | { status: 'linked' }
  /** الحساب كان موجوداً؛ سُجّل الدخول به ونُقلت عضويات الجلسة المجهولة. */
  | { status: 'merged'; merged: number }
  /** أغلق المستخدم نافذة Google أو ألغى — ليس خطأً. */
  | { status: 'cancelled' }

export interface UseAccountLink {
  isLinking: boolean
  linkError: string | null
  clearLinkError: () => void
  linkAccount: () => Promise<AccountLinkOutcome | null>
  /** 🆕 نفس نتيجة linkAccount، عبر بريد إلكتروني وكلمة مرور بدل Google. */
  linkWithEmail: (email: string, password: string) => Promise<AccountLinkOutcome | null>
  /** 🆕 إرسال رابط إعادة تعيين كلمة المرور — لا يحتاج معرفة كلمة المرور الحالية. */
  resetPassword: (email: string) => Promise<boolean>
}

/**
 * ينقل عضويات الجلسة المجهولة السابقة إلى الحساب الحالي (بعد signIn/link على
 * حساب قائم بالفعل). مشتركة بين مساري Google والبريد — نفس الدالة الخادمية
 * provider-agnostic أصلاً.
 */
async function completeMerge(previousIdToken: string): Promise<{ merged: number } | { error: string }> {
  try {
    const merge = httpsCallable<MergeRequest, MergeResponse>(functions, 'mergeAnonymousTrips')
    const result = await merge({ previousIdToken })
    return { merged: result.data?.merged ?? 0 }
  } catch (mergeErr) {
    const mergeCode = (mergeErr as { code?: string }).code
    // ⚠️ تسجيل الدخول قد يكون نجح والدمج وحده هو ما فشل. لا نتظاهر بالفشل
    // الكامل: نُبلغ بأن الحساب جاهز وأن بعض الرحلات تحتاج إعادة إدخال رمز.
    return {
      error: mergeCode === 'functions/resource-exhausted'
        ? 'تم تسجيل الدخول، لكن عدد الرحلات على هذا الحساب بلغ الحد الأقصى فتعذّر نقل بعضها.'
        : 'تم تسجيل الدخول، لكن تعذّر نقل رحلات الجلسة السابقة. قد تحتاج إعادة إدخال رموزها.',
    }
  }
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
        } catch {
          setLinkError('تعذّر إكمال تسجيل الدخول. حاول مجدداً.')
          return null
        }
        // ⚠️ uid تغيّر هنا بالفعل بغضّ النظر عن نجاح الدمج التالي — مصاريف
        // سُجّلت بالـ uid القديم تصبح للعرض فقط لهذا المستخدم من الآن (انظر
        // utils/mergeNotice.ts). onLinked أدناه يُعيد تحميل الصفحة فوراً، فلا
        // وقت لعرض توست هنا — العلم يُقرأ بعد التحميل التالي.
        markUidChanged()
        const merged = await completeMerge(previousIdToken)
        onLinked?.()
        if ('error' in merged) {
          setLinkError(merged.error)
          return null
        }
        return { status: 'merged', merged: merged.merged }
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

  // 🆕 نفس بنية linkAccount بالضبط، بمزوّد مختلف. انظر تعليق الملف أعلاه لماذا
  // auth/email-already-in-use هنا يُعامَل كمسار "الجهاز الثاني" نفسه.
  const linkWithEmail = useCallback(async (email: string, password: string): Promise<AccountLinkOutcome | null> => {
    const current = auth.currentUser
    if (!current || !current.isAnonymous || isLinking) return null

    setIsLinking(true)
    setLinkError(null)

    let previousIdToken: string
    try {
      previousIdToken = await current.getIdToken()
    } catch {
      setIsLinking(false)
      setLinkError('تعذّر تجهيز الجلسة الحالية. حاول مجدداً.')
      return null
    }

    try {
      await linkWithCredential(current, EmailAuthProvider.credential(email, password))
      onLinked?.()
      return { status: 'linked' }
    } catch (err) {
      const code = (err as { code?: string }).code

      if (code === 'auth/email-already-in-use') {
        // ⚠️ نتحقق من كلمة المرور بمحاولة تسجيل دخول فعلية بنفس ما أدخله
        // المستخدم للتوّ — لا نسجّل الدخول بلا تحقق. صحّت أم لا، هذا يحسم
        // ملكية الحساب القائم دون أي آلية إضافية.
        try {
          await signInWithEmailAndPassword(auth, email, password)
        } catch {
          setLinkError('هذا البريد مسجَّل بكلمة مرور مختلفة — تحقّق منها، أو استخدم «نسيت كلمة المرور» أدناه.')
          return null
        }
        // ⚠️ نفس ملاحظة مسار Google أعلاه — uid تغيّر فعلياً هنا.
        markUidChanged()
        const merged = await completeMerge(previousIdToken)
        onLinked?.()
        if ('error' in merged) {
          setLinkError(merged.error)
          return null
        }
        return { status: 'merged', merged: merged.merged }
      }

      if (code === 'auth/weak-password') {
        setLinkError('كلمة المرور قصيرة جداً — 6 خانات على الأقل.')
        return null
      }
      if (code === 'auth/invalid-email') {
        setLinkError('البريد الإلكتروني غير صالح.')
        return null
      }

      setLinkError('تعذّر حفظ الحساب. حاول مجدداً.')
      return null
    } finally {
      setIsLinking(false)
    }
  }, [isLinking, onLinked])

  // 🆕 لا يحتاج معرفة كلمة المرور الحالية أصلاً — هذا هو الفرق عن Google، التي
  // تعتمد استرجاع حسابها على Google نفسها لا على تطبيقنا. Firebase يرسل بريد
  // إعادة التعيين مباشرة؛ لا دالة سحابية ولا تغيير في القواعد.
  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    try {
      await sendPasswordResetEmail(auth, email)
      return true
    } catch {
      return false
    }
  }, [])

  return { isLinking, linkError, clearLinkError, linkAccount, linkWithEmail, resetPassword }
}
