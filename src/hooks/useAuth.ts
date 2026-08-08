import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth'
import { auth } from '../firebase'
import { TRIP_ID } from '../utils/tripId'

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

  const callVerify = useCallback(async (pin: string): Promise<{ success: boolean, retryAfter?: number, message?: string }> => {
    try {
      if (!auth.currentUser) return { success: false }
      const idToken = await auth.currentUser.getIdToken(true)

      const response = await fetch('/api/verifyTripPin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ data: { pin: String(pin).trim(), tripId: TRIP_ID } })
      })

      const resData = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 429 || resData?.error?.status === 'RESOURCE_EXHAUSTED' || resData?.error?.status === 'resource-exhausted') {
          return {
            success: false,
            retryAfter: resData?.error?.details?.retryAfter || 900,
            message: resData?.error?.message || 'تجاوزت عدد المحاولات.'
          }
        }
        return { success: false }
      }

      await auth.currentUser.getIdToken(true)
      const isSuccess = resData?.result?.success === true || resData?.result?.data?.success === true || resData?.success === true
      return { success: isSuccess }
    } catch (error) {
      return { success: false }
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
        setPinError('رمز الرحلة غير صحيح، حاول مرة أخرى.')
      }
    }
    setPinCheckLoading(false)
    return result.success
  }, [callVerify])

  useEffect(() => {
    signInAnonymously(auth).catch(console.error)

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) { setPinCheckLoading(false); return }

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