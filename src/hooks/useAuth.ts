import { useState, useEffect, useCallback, useRef } from 'react'
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import { TRIP_ID } from '../utils/tripId'
import { describeCallableError } from '../utils/callableErrors'

// عقد استدعاء verifyTripPin — يطابق ما تقرأه الدالة في functions/index.js
interface VerifyTripPinRequest { pin: string; tripId: string }
interface VerifyTripPinResponse { success: boolean }

const tripPinStorageKey = () => `travelapp_trip_pin_${TRIP_ID}`

/**
 * 🆕 يقرأ خريطة `trips` من الـ Custom Claims دفاعياً.
 *
 * الـ claims تأتي من توكن موقّع من الخادم، لكنها مع ذلك بيانات خارجية بصيغة
 * حرة (`Record<string, unknown>`) وقد تتغيّر صيغتها بين إصدارات الدالة — كما
 * حدث فعلاً في هذا المشروع حين استُبدل العلم القديم `member: true` بخريطة
 * لكل رحلة. لذا نتحقق من النوع بدل الوثوق بالشكل المتوقَّع: الصيغة القديمة
 * (أو أي صيغة غير متوقّعة) تُعامَل كخريطة فارغة فيُطلب الرمز من جديد، بدل أن
 * ترمي القراءة وتُسقط تدفّق المصادقة كاملاً.
 */
function readTripsClaim(claims: Record<string, unknown>): Record<string, boolean> {
  const trips = claims.trips
  if (typeof trips !== 'object' || trips === null || Array.isArray(trips)) return {}
  return trips as Record<string, boolean>
}

export interface UseAuth {
  user: User | null
  isAdmin: boolean
  needsTripPin: boolean
  pinCheckLoading: boolean
  pinError: string | null
  rateLimitSeconds: number | null
  verifyTripPin: (pin: string) => Promise<boolean>
  // 🆕 معرّفات الرحلات التي انضم لها هذا المستخدم فعلاً — مقروءة من خريطة
  // trips في الـ Custom Claims مباشرةً، بلا أي استعلام على Firestore.
  //
  // هذه هي القائمة التي تُبنى منها شاشة «رحلاتي» (TripPicker): المستخدم عضو
  // في هذه الرحلات أصلاً، فقراءة مستند كلٍّ منها يسمح بها isMember(tripId) في
  // firestore.rules دون أي تعديل على القواعد. ⚠️ لا يجوز اشتقاقها باستعلام
  // list على مجموعة trips/ — ذلك الاستعلام لا يرضيه إلا isAdmin().
  joinedTripIds: string[]
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null)
  const [needsTripPin, setNeedsTripPin] = useState(false)
  const [pinCheckLoading, setPinCheckLoading] = useState(true)
  const [pinError, setPinError] = useState<string | null>(null)
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null)

  // حالة الإدارة بناءً على الـ Claims
  const [isAdmin, setIsAdmin] = useState(false)

  // 🆕 رحلات المستخدم — تُقرأ من نفس الـ tokenResult أدناه (لا استدعاء إضافي)
  const [joinedTripIds, setJoinedTripIds] = useState<string[]>([])

  // يمنع إنشاء أكثر من حساب مجهول عند تزامن حدثين — انظر التعليق عند الاستخدام
  const isSigningInAnonymouslyRef = useRef(false)

  // 🆕 عداد فك الحظر التلقائي — يعمل فقط عندما rateLimitSeconds > 0
  // نعتمد على boolean signal عمداً (rateLimitActive بدل rateLimitSeconds نفسه)
  // لتفادي إعادة إنشاء الـ interval كل ثانية أثناء العدّ التنازلي.
  const rateLimitActive = rateLimitSeconds !== null && rateLimitSeconds > 0
  useEffect(() => {
    if (!rateLimitActive) return
    const interval = setInterval(() => {
      setRateLimitSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          setPinError(null)
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [rateLimitActive])

  // 🆕 استدعاء عبر SDK بدل fetch خام على `/api/verifyTripPin`.
  //
  // ⚠️ سبب التحويل معماري لا تجميلي: المسار `/api/...` كان مجرد إعادة توجيه في
  // vercel.json إلى رابط دالة **مكتوب حرفياً بمعرّف المشروع**، ووجهات Vercel لا
  // تقرأ متغيرات البيئة. فكان أي بناء — مهما ضُبطت متغيراته — يخاطب دوال مشروع
  // الإنتاج، فيصادق العميل على مشروع ويستدعي دوال مشروع آخر: توكن من جهة وتحقق
  // من جهة، والنتيجة رفض بـ unauthenticated. أي أن بيئة staging كانت مستحيلة.
  //
  // httpsCallable يشتق الرابط من projectId في إعداد التطبيق، فتتبع الدوال تلقائياً
  // أي مشروع تشير إليه VITE_FIREBASE_* — وتتبع المحاكي في اختبارات E2E
  // (connectFunctionsEmulator في firebase.ts) بلا أي وسيط أو إعداد إضافي.
  const callVerify = useCallback(async (pin: string): Promise<{ success: boolean, retryAfter?: number, message?: string }> => {
    try {
      if (!auth.currentUser) {
        // ⚠️ ليست حالة «رمز خاطئ»: لم يُستدعَ الخادم أصلاً. تحدث حين يفشل الدخول
        // المجهول (مزوّد Anonymous معطَّل، أو تخزين المتصفح محجوب).
        return { success: false, message: 'تعذّر تجهيز الجلسة. أعد تحميل الصفحة وحاول مجدداً.' }
      }
      // تحديث التوكن قبل الاستدعاء: الـ SDK يرفق التوكن المخزَّن، فالتحديث هنا
      // يضمن أن ما يُرسَل حديث (يهم بعد منح صلاحية أو عضوية رحلة جديدة).
      await auth.currentUser.getIdToken(true)

      const verify = httpsCallable<VerifyTripPinRequest, VerifyTripPinResponse>(functions, 'verifyTripPin')
      const result = await verify({ pin: String(pin).trim(), tripId: TRIP_ID })

      // ردٌّ ناجح (200) بلا success — لا يحدث اليوم لأن الدالة ترمي عند كل فشل،
      // لكنه يبقى حارساً. بلا رسالة عمداً: يسقط إلى نص الرمز الخاطئ، وهو أقرب
      // وصف لردٍّ وصل من الخادم دون أن يُقرّ التحقق.
      if (result.data?.success !== true) return { success: false }

      // التوكن الجديد يحمل claim العضوية التي منحتها الدالة للتوّ
      await auth.currentUser.getIdToken(true)
      return { success: true }
    } catch (error) {
      // أخطاء الدوال تصل ككائن FunctionsError: code مثل 'functions/resource-exhausted'
      // وdetails هي الوسيط الثالث في HttpsError خادمياً.
      const fnError = error as { code?: string; message?: string; details?: { retryAfter?: number } }

      if (fnError.code === 'functions/resource-exhausted') {
        return {
          success: false,
          // 900 خط رجوع فقط — الدالة ترسل المتبقي الفعلي في details.retryAfter
          retryAfter: fnError.details?.retryAfter ?? 900,
          message: fnError.message || 'تجاوزت عدد المحاولات.',
        }
      }

      // 🆕 لا نبتلع بقية الأكواد تحت «رمز الرحلة غير صحيح». كانت رسالة واحدة
      // تُخفي ستة أسباب، فأرسلت تشخيص عطل 2026-08-13 في الاتجاه الخاطئ ساعتين
      // (امتداد متصفح يُسقط ترويسة Authorization ⇒ unauthenticated).
      // انظر utils/callableErrors.ts، وقاعدة المساهمة ١٠.
      return { success: false, message: describeCallableError(error).text }
    }
  }, [])

  const verifyTripPin = useCallback(async (pin: string): Promise<boolean> => {
    setPinCheckLoading(true)
    setPinError(null)
    setRateLimitSeconds(null)

    const result = await callVerify(pin)
    if (result.success) {
      // localStorage قد يرمي في وضع التصفح الخاص أو عند امتلاء الحصة — التخزين
      // هنا تحسين اختياري فقط (تذكّر الرمز)، وفشله لا يمنع الدخول للرحلة.
      try {
        window.localStorage.setItem(tripPinStorageKey(), pin)
      } catch {
        // تجاهل متعمّد
      }
      // 🆕 انضم للتو لهذه الرحلة — نضيفها محلياً بدل انتظار انطلاق
      // onAuthStateChanged من جديد (قد لا ينطلق أصلاً بعد تحديث التوكن).
      setJoinedTripIds(prev => prev.includes(TRIP_ID) ? prev : [...prev, TRIP_ID])
      setNeedsTripPin(false)
    } else {
      if (result.retryAfter) {
        setRateLimitSeconds(result.retryAfter)
        setPinError(result.message || 'تجاوزت عدد المحاولات المسموحة.')
      } else {
        // 🆕 الرسالة تأتي مترجَمة من callVerify (utils/callableErrors.ts).
        // خط الرجوع هو نص الرمز الخاطئ لأنه الحالة الأشيع بفارق كبير.
        setPinError(result.message || 'رمز الرحلة غير صحيح، حاول مرة أخرى.')
      }
    }
    setPinCheckLoading(false)
    return result.success
  }, [callVerify])

  useEffect(() => {
    // ⚠️ لا تنقل signInAnonymously خارج هذا المستمع ليُستدعى مباشرةً عند التحميل.
    //
    // كان يُستدعى بلا شرط عند كل تحميل للصفحة، وسلوك Firebase أن
    // signInAnonymously حين يكون المستخدم الحالي **غير مجهول** (مسؤول مسجّل
    // بالبريد) يُنشئ جلسة مجهولة جديدة تحلّ محلّه — أي يطرد المسؤول من جلسته.
    //
    // النتيجة: كل إعادة تحميل تُخرج المسؤول من وضع المسؤول. لم يظهر الأثر بوضوح
    // إلا بعد إضافة التبديل بين الرحلات، لأن التبديل إعادة تحميل كاملة
    // (TRIP_ID يُقرأ مرة واحدة عند تحميل الوحدة — انظر utils/tripId.ts).
    //
    // الصواب: ننتظر Firebase حتى يستعيد الجلسة المحفوظة، ولا ننشئ جلسة مجهولة
    // إلا إذا تبيّن فعلاً أنه لا يوجد مستخدم.
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        // حارس ضد استدعاءين متزامنين: كلٌّ منهما قد يُنشئ حساباً مجهولاً مستقلاً،
        // فيفقد المستخدم عضويات الرحلات المخزّنة في claims الحساب الأول.
        if (!isSigningInAnonymouslyRef.current) {
          isSigningInAnonymouslyRef.current = true
          signInAnonymously(auth)
            .catch(console.error)
            .finally(() => { isSigningInAnonymouslyRef.current = false })
        }
        setIsAdmin(false)
        setJoinedTripIds([])
        setPinCheckLoading(false)
        return
      }

      // 🆕 التحقق من الـ Custom Claim (admin: true)
      const tokenResult = await u.getIdTokenResult()
      const isAdminClaim = tokenResult.claims.admin === true
      setIsAdmin(isAdminClaim)

      // 🆕 رحلات المستخدم من نفس التوكن — تُقرأ قبل أي خروج مبكر أدناه حتى
      // تبقى شاشة «رحلاتي» متاحة للمسؤول أيضاً لا للأعضاء وحدهم.
      const trips = readTripsClaim(tokenResult.claims)
      setJoinedTripIds(Object.keys(trips).filter(id => trips[id] === true))

      if (isAdminClaim) {
        setNeedsTripPin(false)
        setPinCheckLoading(false)
        return
      }

      setPinCheckLoading(true)
      if (trips[TRIP_ID] === true) {
        setNeedsTripPin(false)
        setPinCheckLoading(false)
        return
      }

      let cachedPin: string | null = null
      try {
        cachedPin = window.localStorage.getItem(tripPinStorageKey())
      } catch {
        // تعذّر الوصول لـ localStorage — نكمل بلا رمز مخزّن (سيُطلب من المستخدم)
      }

      if (cachedPin) {
        const result = await callVerify(cachedPin)
        if (result.success) {
          setNeedsTripPin(false)
          setPinCheckLoading(false)
          return
        }
        try {
          window.localStorage.removeItem(tripPinStorageKey())
        } catch {
          // تجاهل متعمّد — الرمز المخزّن لم يعد صالحاً على أي حال
        }
      }

      setNeedsTripPin(true)
      setPinCheckLoading(false)
    })
    return unsub
  }, [callVerify])

  return { user, isAdmin, needsTripPin, pinCheckLoading, pinError, rateLimitSeconds, verifyTripPin, joinedTripIds }
}