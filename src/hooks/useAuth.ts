import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged, User,
  GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut,
} from 'firebase/auth'
import * as Sentry from '@sentry/react'
import { auth } from '../firebase'

/**
 * 🆕 يُبلّغ Sentry برمز فشل الدخول — **ولا شيء غيره.**
 *
 * ⚠️ لم يكن أي فشل في الدخول يُبلَّغ من قبل، فالحالة الصامتة («اختار حسابه ثم
 * عاد لشاشة الدخول بلا رسالة») كانت غير قابلة للتشخيص إلا ببلاغ شفهي. الرمز
 * وحده يُرسَل — لا بريد ولا معرّف حساب: لا شيء هنا يعرّف شخصاً.
 */
function reportSignInFailure(code: string | undefined, phase: 'popup' | 'redirect' | 'redirect-result' | 'email'): void {
  Sentry.captureMessage(`sign-in failed: ${code ?? 'unknown'}`, {
    level: 'warning',
    tags: { source: 'auth', phase, code: code ?? 'unknown' },
  })
}

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

// 🆕 آخر isAdmin/joinedTripIds معروفة لكل مستخدم — تُقرأ فقط حين يفشل تحديث
// التوكن (بلا اتصال) بدل ترك الحالة على الافتراضي الفارغ، الذي كان يجعل شاشة
// «رحلاتي» تعرض "لم تنضم لأي رحلة بعد" بالخطأ لمستخدم منضمّ فعلاً لرحلات —
// راجع نمط travelapp_onboarding_dismissed_v1 في OnboardingBanner.tsx. لا علاقة
// لهذا الكاش بصلاحيات الوصول الفعلية (تلك محسومة خادمياً من التوكن الحقيقي عبر
// firestore.rules)، فهو عرض بصري فقط قد يُصبح قديماً حتى تعود المزامنة الحقيقية.
const CLAIMS_CACHE_PREFIX = 'travelapp_claims_cache_v1_'

interface CachedClaims { isAdmin: boolean; joinedTripIds: string[] }

function readCachedClaims(uid: string): CachedClaims | null {
  try {
    const raw = window.localStorage.getItem(CLAIMS_CACHE_PREFIX + uid)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { isAdmin, joinedTripIds } = parsed as Record<string, unknown>
    if (!Array.isArray(joinedTripIds)) return null
    return {
      isAdmin: isAdmin === true,
      joinedTripIds: joinedTripIds.filter((id): id is string => typeof id === 'string'),
    }
  } catch {
    return null
  }
}

function writeCachedClaims(uid: string, claims: CachedClaims): void {
  try {
    window.localStorage.setItem(CLAIMS_CACHE_PREFIX + uid, JSON.stringify(claims))
  } catch {
    // localStorage قد يكون ممتلئاً أو معطلاً (وضع خاص) — هذا الكاش تحسين عرض
    // بحت، لا يستحق كسر تسجيل الدخول لأجله.
  }
}

// ⚠️ رموز بيئة غير متوافقة مع النافذة المنبثقة (webview داخل واتساب/تيليجرام
// غالباً) — هنا وحدها نتراجع لـ signInWithRedirect. لا نتراجع عند إلغاء
// المستخدم نفسه (auth/popup-closed-by-user وما شابه)، فتلك ليست بيئة معطوبة
// بل قرار واعٍ بالإلغاء.
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/operation-not-supported-in-this-environment',
  'auth/popup-blocked',
])

// 🆕 Firebase يرفض الدخول عبر Google من أي عنوان خارج «النطاقات المصرّح بها» —
// وأبرزها عناوين النشر الفريدة على Vercel. الدخول بالبريد لا يخضع لهذه القائمة.
const UNAUTHORIZED_DOMAIN = 'auth/unauthorized-domain'
const UNAUTHORIZED_DOMAIN_MESSAGE =
  'الدخول عبر Google لا يعمل من هذا العنوان. افتح التطبيق من عنوانه الأساسي، أو سجّل الدخول عبر البريد الإلكتروني.'

// ⚠️ **الصمت هنا كان يخفي عطلاً حقيقياً.** `auth/popup-closed-by-user` كانت
// ضمن هذه المجموعة، فكان مَن يختار حسابه في النافذة المنبثقة ثم لا تكتمل جلسته
// يرى شاشة الدخول نفسها **بلا أي رسالة** — بلاغ مستخدم فعلي. والسبب أن هذا
// الرمز يُرمى في حالتين لا تُميَّزان من العميل: إغلاق واعٍ للنافذة، وفقدان
// المتصفح للجلسة بعد اختيار الحساب (تقسيم التخزين لنطاق الـauth الخارجي أو
// حاجب إعلانات يمنعه). فالباقي هنا هو ما لا يمكن أن يكون عطلاً:
// `cancelled-popup-request` تُرمى حين تُلغي نافذةٌ أخرى الأولى، و`user-cancelled`
// رفضٌ صريح للأذونات.
const USER_CANCELLED_CODES = new Set([
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

// 🆕 لا نعرف أي الحالتين وقعت، فالرسالة تصف ما يراه ولا تدّعي سبباً: أعد
// المحاولة، أو ادخل بالبريد (لا يخضع للنوافذ المنبثقة ولا لتخزين طرف ثالث).
const POPUP_INCOMPLETE = 'auth/popup-closed-by-user'
const POPUP_INCOMPLETE_MESSAGE =
  'لم يكتمل الدخول عبر Google. أعد المحاولة، أو ادخل عبر البريد الإلكتروني.'

// 🆕 المتصفح يمنع التخزين الذي يحتاجه SDK لإكمال الدخول — إعداد «منع التتبّع»
// أو نافذة خاصة. الرسالة تسمّي المخرج العامل بدل أن تطلب تغيير إعدادات.
const WEB_STORAGE_UNSUPPORTED = 'auth/web-storage-unsupported'
const WEB_STORAGE_MESSAGE =
  'متصفحك يمنع التخزين اللازم لإكمال الدخول عبر Google. ادخل عبر البريد الإلكتروني.'

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
  /** 🆕 الخروج — من نفس خطّاف الدخول، لا خطّاف مصادقة ثانٍ. */
  signOut: () => Promise<void>
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [joinedTripIds, setJoinedTripIds] = useState<string[]>([])
  const [signInError, setSignInError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    // 🐛 u.getIdTokenResult() يحاول تحديث التوكن عبر الشبكة إن كانت النسخة
    // المحفوظة منتهية الصلاحية — إن لم يكن هناك اتصال، يرفض الوعد (reject) بدل
    // أن يُعلَّق (hang)، لكن بلا try/catch هنا كان الرفض يمنع setAuthLoading(false)
    // من التنفيذ أبداً فتبقى شاشة "جارٍ التحقق من جلستك..." للأبد. وبما أنه لا
    // مستمع لعودة الاتصال، فحتى عودة الشبكة لا تُصلح شيئاً دون تحديث الصفحة يدوياً.
    const syncClaims = async (u: User) => {
      try {
        const tokenResult = await u.getIdTokenResult()
        const admin = tokenResult.claims.admin === true
        const trips = readTripsClaim(tokenResult.claims)
        const tripIds = Object.keys(trips).filter(id => trips[id] === true)
        setIsAdmin(admin)
        setJoinedTripIds(tripIds)
        writeCachedClaims(u.uid, { isAdmin: admin, joinedTripIds: tripIds })
      } catch {
        // غالباً انقطاع شبكة أثناء تحديث التوكن — بلا هذا السقوط للكاش المحلي
        // كانت الحالة تبقى على افتراضيها الفارغ عند أول تحميل، فتعرض شاشة
        // «رحلاتي» "لم تنضم لأي رحلة بعد" رغم انضمامه فعلاً؛ محاولة onlineRetry
        // أدناه ستُعيد المزامنة الحقيقية فور عودة الاتصال.
        const cached = readCachedClaims(u.uid)
        if (cached) {
          setIsAdmin(cached.isAdmin)
          setJoinedTripIds(cached.joinedTripIds)
        }
      } finally {
        setAuthLoading(false)
      }
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)

      if (!u) {
        setIsAdmin(false)
        setJoinedTripIds([])
        setAuthLoading(false)
        return
      }

      void syncClaims(u)
    })

    const onlineRetry = () => {
      if (auth.currentUser) void syncClaims(auth.currentUser)
    }
    window.addEventListener('online', onlineRetry)

    return () => {
      unsub()
      window.removeEventListener('online', onlineRetry)
    }
  }, [])

  // 🆕 يُكمل تسجيل الدخول بعد العودة من signInWithRedirect (مسار المتصفحات
  // المدمجة). onAuthStateChanged أعلاه هو ما يحدّث `user` فعلياً — هذا فقط
  // يلتقط خطأ فشل الإكمال (نادر) ليُعرض بدل أن يختفي بصمت. آمن الاستدعاء دائماً:
  // getRedirectResult تُرجع null بهدوء إن لم تكن هناك عملية إعادة توجيه أصلاً.
  useEffect(() => {
    getRedirectResult(auth).catch((err: unknown) => {
      const code = (err as { code?: string })?.code
      if (code && USER_CANCELLED_CODES.has(code)) return
      reportSignInFailure(code, 'redirect-result')
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
        // نافذة أُلغيت بأخرى، أو رفضٌ صريح للأذونات — ليس عطلاً ولا يستحق رسالة.
        return
      }

      reportSignInFailure(code, 'popup')

      // 🆕 اختار حسابه ثم لم تكتمل الجلسة — أو أغلق النافذة. لا سبيل للتمييز،
      // فالرسالة تصف الحال وتسمّي المخرج بدل أن تصمت (انظر تعليق المجموعة أعلاه).
      if (code === POPUP_INCOMPLETE) {
        setSignInError(POPUP_INCOMPLETE_MESSAGE)
        return
      }

      if (code === WEB_STORAGE_UNSUPPORTED) {
        setSignInError(WEB_STORAGE_MESSAGE)
        return
      }

      // 🆕 العنوان نفسه مرفوض — لا المتصفح. «جرّب متصفحاً آخر» هنا ترسل
      // المستخدم في الاتجاه الخطأ: كل متصفح سيفشل بالطريقة نفسها على هذا العنوان.
      // AuthGate تعرض رابط العنوان الأساسي بجانبها (utils/canonicalUrl.ts).
      if (code === UNAUTHORIZED_DOMAIN) {
        setSignInError(UNAUTHORIZED_DOMAIN_MESSAGE)
        return
      }

      if (code && REDIRECT_FALLBACK_CODES.has(code)) {
        try {
          // الصفحة ستُعاد تحميلها بعد العودة من إعادة التوجيه — لا داعٍ لإدارة
          // حالة إضافية هنا، ولا لإيقاف isSigningIn (المستخدم يغادر الصفحة أصلاً).
          await signInWithRedirect(auth, new GoogleAuthProvider())
          return
        } catch (redirectErr) {
          // 🆕 المسار الأكثر شيوعاً لهذا الخطأ فعلياً: متصفح Gmail المدمج يحجب
          // النافذة المنبثقة، فيُجرَّب التوجيه — وSDK يفحص العنوان قبل أن يغادر.
          const redirectCode = (redirectErr as { code?: string })?.code
          reportSignInFailure(redirectCode, 'redirect')
          setSignInError(redirectCode === UNAUTHORIZED_DOMAIN
            ? UNAUTHORIZED_DOMAIN_MESSAGE
            : 'تعذّر تسجيل الدخول عبر Google. جرّب متصفحاً آخر (Safari أو Chrome).')
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

  // 🆕 الخروج يعيش هنا لا في خطّاف مصادقة ثانٍ. كان في `useAdminAuth` — خطّاف
  // كامل بنموذج بريد/كلمة مرور خاص به («الدخول بحساب آخر») ومسار استرداد كلمة
  // مرور مستقلّ. حُذف كله: سطح تسجيل دخول واحد في التطبيق هو `AuthGate`، ومن
  // أراد حساباً آخر يخرج ثم يدخل به. انظر docs/DECISIONS.md.
  //
  // بعد الخروج، مستمع onAuthStateChanged أعلاه يرصد غياب المستخدم ويُظهر
  // AuthGate من جديد — لا جلسة بديلة تُنشأ تلقائياً (لا وجود لجلسات مجهولة بعد
  // إلغاء PIN).
  const signOut = useCallback(async () => {
    try { await firebaseSignOut(auth) } catch (err) { console.error(err) }
  }, [])

  return {
    user, isAdmin, authLoading, joinedTripIds,
    signInError, isSigningIn, signInWithGoogle, signInWithEmail, signOut,
  }
}
