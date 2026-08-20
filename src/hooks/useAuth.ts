import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged, User,
  GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../firebase'

/**
 * 🆕 يقرأ خريطة `trips` من الـ Custom Claims دفاعياً.
 *
 * الـ claims تأتي من توكن موقّع من الخادم، لكنها مع ذلك بيانات خارجية بصيغة
 * حرة (`Record<string, unknown>`) وقد تتغيّر صيغتها بين إصدارات الدالة — كما
 * حدث فعلاً في هذا المشروع حين استُبدل العلم القديم `member: true` بخريطة
 * لكل رحلة. لذا نتحقق من النوع بدل الوثوق بالشكل المتوقَّع.
 */
function readTripsClaim(claims: Record<string, unknown>): Record<string, boolean> {
  const trips = claims.trips
  if (typeof trips !== 'object' || trips === null || Array.isArray(trips)) return {}
  return trips as Record<string, boolean>
}

// ⚠️ رموز بيئة غير متوافقة مع النافذة المنبثقة (webview داخل واتساب/تيليجرام
// غالباً) — هنا وحدها نتراجع لـ signInWithRedirect. لا نتراجع عند إلغاء
// المستخدم نفسه (auth/popup-closed-by-user وما شابه)، فتلك ليست بيئة معطوبة
// بل قرار واعٍ بالإلغاء.
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/operation-not-supported-in-this-environment',
  'auth/popup-blocked',
])

const USER_CANCELLED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

function describeEmailSignInError(code: string | undefined, mode: 'signIn' | 'signUp'): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'البريد الإلكتروني غير صالح.'
    case 'auth/user-not-found':
      return 'لا يوجد حساب بهذا البريد — جرّب "إنشاء حساب جديد" بدلاً من تسجيل الدخول.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'كلمة المرور غير صحيحة.'
    case 'auth/email-already-in-use':
      return 'هذا البريد مسجَّل بالفعل — جرّب "تسجيل الدخول" بدلاً من إنشاء حساب جديد.'
    case 'auth/weak-password':
      return 'كلمة المرور قصيرة جداً — 6 خانات على الأقل.'
    default:
      return mode === 'signUp' ? 'تعذّر إنشاء الحساب. حاول مجدداً.' : 'تعذّر تسجيل الدخول. حاول مجدداً.'
  }
}

export interface UseAuth {
  user: User | null
  isAdmin: boolean
  /** صحيحة فقط أثناء استعادة Firebase لأي جلسة محفوظة عند أول تحميل — لا تخص عمليات تسجيل الدخول اللاحقة (انظر isSigningIn). */
  authLoading: boolean
  /**
   * 🆕 معرّفات الرحلات التي انضم لها هذا المستخدم فعلاً — مقروءة من خريطة
   * trips في الـ Custom Claims مباشرةً، بلا أي استعلام على Firestore.
   * هذه هي القائمة التي تُبنى منها شاشة «رحلاتي» (TripPicker).
   */
  joinedTripIds: string[]
  signInError: string | null
  isSigningIn: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string, mode: 'signIn' | 'signUp') => Promise<void>
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [joinedTripIds, setJoinedTripIds] = useState<string[]>([])
  const [signInError, setSignInError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)

      if (!u) {
        setIsAdmin(false)
        setJoinedTripIds([])
        setAuthLoading(false)
        return
      }

      const tokenResult = await u.getIdTokenResult()
      setIsAdmin(tokenResult.claims.admin === true)

      const trips = readTripsClaim(tokenResult.claims)
      setJoinedTripIds(Object.keys(trips).filter(id => trips[id] === true))

      setAuthLoading(false)
    })
    return unsub
  }, [])

  // 🆕 يُكمل تسجيل الدخول بعد العودة من signInWithRedirect (مسار المتصفحات
  // المدمجة). onAuthStateChanged أعلاه هو ما يحدّث `user` فعلياً — هذا فقط
  // يلتقط خطأ فشل الإكمال (نادر) ليُعرض بدل أن يختفي بصمت. آمن الاستدعاء دائماً:
  // getRedirectResult تُرجع null بهدوء إن لم تكن هناك عملية إعادة توجيه أصلاً.
  useEffect(() => {
    getRedirectResult(auth).catch((err: unknown) => {
      const code = (err as { code?: string })?.code
      if (code && USER_CANCELLED_CODES.has(code)) return
      setSignInError('تعذّر إكمال تسجيل الدخول. حاول مجدداً.')
    })
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true)
    setSignInError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      const code = (err as { code?: string })?.code

      if (code && USER_CANCELLED_CODES.has(code)) {
        // المستخدم أغلق النافذة أو ألغى — ليس خطأً ولا يستحق رسالة حمراء.
        return
      }

      if (code && REDIRECT_FALLBACK_CODES.has(code)) {
        try {
          // الصفحة ستُعاد تحميلها بعد العودة من إعادة التوجيه — لا داعٍ لإدارة
          // حالة إضافية هنا، ولا لإيقاف isSigningIn (المستخدم يغادر الصفحة أصلاً).
          await signInWithRedirect(auth, new GoogleAuthProvider())
          return
        } catch {
          setSignInError('تعذّر تسجيل الدخول عبر Google. جرّب متصفحاً آخر (Safari أو Chrome).')
        }
      } else {
        setSignInError('تعذّر تسجيل الدخول عبر Google. حاول مجدداً.')
      }
    } finally {
      setIsSigningIn(false)
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string, mode: 'signIn' | 'signUp') => {
    setIsSigningIn(true)
    setSignInError(null)
    try {
      if (mode === 'signUp') {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      const code = (err as { code?: string })?.code
      setSignInError(describeEmailSignInError(code, mode))
    } finally {
      setIsSigningIn(false)
    }
  }, [])

  return {
    user, isAdmin, authLoading, joinedTripIds,
    signInError, isSigningIn, signInWithGoogle, signInWithEmail,
  }
}
