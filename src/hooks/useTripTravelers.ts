// 🆕 قائمة مسافري رحلة بعينها — من travelersColByTrip. مستقلّة عن useData()/
// DataContext لأن TripDetailPanel يعمل على *أي* رحلة بمعرّفها، لا الرحلة
// المفتوحة حالياً فقط (نفس منطق useTripMembers بالضبط — التوأم الطبيعي لها،
// إذ ربط الهوية يحتاج القائمتين معاً: من هو مسافر "شبح" في الدفتر، ومن هو
// عضو غير مربوط بعد في سجلّ العضوية).
//
// جلب لمرة واحدة لا onSnapshot — نفس تبرير useTripMembers: تُفتح عند الحاجة
// ولا تتغيّر إلا بفعل من يشاهدها في نفس الشاشة عبر refresh().
import { useCallback, useEffect, useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { travelersColByTrip } from '../firestore'
import type { Traveler } from '../types'

export interface UseTripTravelersResult {
  /** null أثناء التحميل أو عند التعطيل؛ مصفوفة عند النجاح. */
  travelers: Traveler[] | null
  error: boolean
  /** إعادة الجلب — يستدعيها المسؤول/المنظّم بعد ربط مسافر بحساب. */
  refresh: () => void
}

export function useTripTravelers(tripId: string | null, enabled: boolean): UseTripTravelersResult {
  const [travelers, setTravelers] = useState<Traveler[] | null>(null)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!enabled || !tripId) {
      setTravelers(null)
      setError(false)
      return
    }
    let cancelled = false
    setTravelers(null)
    setError(false)

    getDocs(travelersColByTrip(tripId))
      .then(snap => {
        if (cancelled) return
        setTravelers(snap.docs.map(d => d.data() as Traveler))
      })
      .catch(() => { if (!cancelled) setError(true) })

    return () => { cancelled = true }
  }, [tripId, enabled, nonce])

  return { travelers, error, refresh }
}
