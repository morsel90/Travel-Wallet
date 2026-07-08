import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth'
import { auth } from '../firebase'
import { ADMIN_EMAILS }    from '../constants'
import { TRIP_ID }         from '../utils/tripId'

// ─── useAuth ──────────────────────────────────────────────────────────────────
// 🆕 مفتاح تخزين رمز الرحلة محلياً (localStorage) أصبح خاصاً بكل رحلة (يتضمن
// TRIP_ID) بدل مفتاح عالمي واحد — حتى لا يحاول التطبيق إعادة استخدام رمز رحلة
// أخرى مخزَّن سابقاً بالخطأ عند فتح رابط رحلة مختلفة (?trip=xyz آخر) من نفس الجهاز.
const tripPinStorageKey = () => `travelapp_trip_pin_${TRIP_ID}`

export interface UseAuth {
  user: User | null
  isAdmin: boolean
  needsTripPin: boolean
  pinCheckLoading: boolean
  pinError: string | null
  verifyTripPin: (pin: string) => Promise<boolean>
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null)
  const [needsTripPin, setNeedsTripPin] = useState(false)
  const [pinCheckLoading, setPinCheckLoading] = useState(true)
  const [pinError, setPinError] = useState<string | null>(null)

  // يستدعي الـ Rewrite المحلي عبر fetch للتحقق من الرمز خادميًا وتفادي حظر الترويسات (CORS / Cross-Site)
  const callVerify = useCallback(async (pin: string): Promise<boolean> => {
    try {
      if (!auth.currentUser) return false

      // 1️⃣ جلب التوكن الحالي للمستخدم المجهول (Anonymous) وإجبار تحديثه لضمان صلاحيته
      const idToken = await auth.currentUser.getIdToken(true)

      // 2️⃣ 🚀 استدعاء الـ API عبر الـ Rewrite المحلي لتفادي تجريد ترويسة Authorization من قِبل المتصفح
      // 🆕 نُرسل tripId مع الرمز — الخادم يبحث عن هاش رمز هذه الرحلة تحديداً
      // ضمن مجموعة tripSecrets/{tripId} بدل سر عالمي واحد (انظر functions/index.js)
      const response = await fetch('/api/verifyTripPin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ data: { pin: String(pin).trim(), tripId: TRIP_ID } }) // البنية المتوقعة خادميًا لـ Firebase Cloud Functions
      })

      if (!response.ok) {
        console.error("فشل التحقق من الخادم، كود الرد:", response.status)
        return false
      }

      const resData = await response.json()
      
      // 3️⃣ فرض تحديث التوكن محليًا فورًا لاستقبال الـ Custom Claim الجديد (trips: { [tripId]: true }) الذي منحه الباك-إند
      await auth.currentUser.getIdToken(true)
      
      // 🚀 فحص مرن للاستجابة: Firebase Callable عبر fetch قد تُرجع النتيجة داخل { result: { success: true } }
      // نقوم بالتحقق من كائن result أو التحقق المباشر في حال قام الـ proxy بتبسيطه
      const isSuccess = 
        resData?.result?.success === true || 
        resData?.result?.data?.success === true ||
        resData?.success === true

      return isSuccess
    } catch (error) {
      console.error("فشل استدعاء verifyTripPin المباشر:", error)
      return false
    }
  }, [])

  const verifyTripPin = useCallback(async (pin: string): Promise<boolean> => {
    setPinCheckLoading(true)
    setPinError(null)
    const ok = await callVerify(pin)
    if (ok) {
      try { window.localStorage.setItem(tripPinStorageKey(), pin) } catch { /* تجاهل بصمت */ }
      setNeedsTripPin(false)
    } else {
      setPinError('رمز الرحلة غير صحيح، حاول مرة أخرى.')
    }
    setPinCheckLoading(false)
    return ok
  }, [callVerify])

  useEffect(() => {
    signInAnonymously(auth).catch(console.error)

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)

      if (!u) { setPinCheckLoading(false); return }

      const isAdminUser = !u.isAnonymous && ADMIN_EMAILS.includes(u.email ?? '')
      if (isAdminUser) {
        setNeedsTripPin(false)
        setPinCheckLoading(false)
        return
      }

      setPinCheckLoading(true)
      try {
        const tokenResult = await u.getIdTokenResult()
        // 🆕 عضوية خاصة بهذه الرحلة تحديداً — خريطة trips: { [tripId]: true }
        // بدل علم member العالمي القديم (انظر شرح مطوّل في firestore.rules:
        // isMember). مستخدم تحقق من رحلة أخرى فقط لا يُعتبر عضواً هنا.
        const trips = tokenResult.claims.trips as Record<string, boolean> | undefined
        if (trips?.[TRIP_ID] === true) {
          setNeedsTripPin(false)
          setPinCheckLoading(false)
          return
        }
      } catch {
        // تعذّر قراءة التوكن
      }

      let cachedPin: string | null = null
      try { cachedPin = window.localStorage.getItem(tripPinStorageKey()) } catch { /* تجاهل */ }

      if (cachedPin) {
        const ok = await callVerify(cachedPin)
        if (ok) {
          setNeedsTripPin(false)
          setPinCheckLoading(false)
          return
        }
        try { window.localStorage.removeItem(tripPinStorageKey()) } catch { /* تجاهل */ }
      }

      setNeedsTripPin(true)
      setPinCheckLoading(false)
    })

    return unsub
  }, [callVerify])

  const isAdmin = !!(user && !user.isAnonymous && ADMIN_EMAILS.includes(user.email ?? ''))

  return { user, isAdmin, needsTripPin, pinCheckLoading, pinError, verifyTripPin }
}