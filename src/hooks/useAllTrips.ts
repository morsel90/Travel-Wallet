// 🆕 قائمة كل الرحلات — لواجهة إدارة الرحلات (للمسؤول فقط).
//
// استعلام القائمة على trips/ ينجح للمسؤول فقط: شرط القراءة
// `isMember(tripId) || isAdmin()` — الشق الأول يعتمد على معرّف كل رحلة على حدة
// فلا يُرضي استعلاماً عامًّا، والثاني صحيح أو خاطئ للمستخدم كله بغض النظر عن
// المستندات. لذلك لا نشترك إطلاقاً ما لم يكن المستخدم مسؤولاً — وإلا كان كل
// عضو عادي سيولّد خطأ صلاحيات في الكونسول عند فتح التطبيق.
import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { tripsCol } from '../firestore'
import { normalizeItinerary } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import type { ItinerarySegment, TripStatus } from '../types'

export interface TripSummary {
  id: string
  name: string
  /** 🆕 uid منظّم الرحلة الحالي — غيابه يعني رحلة قديمة بلا منظّم معروف بعد. */
  organizerUid?: string
  itinerary: ItinerarySegment[]
  /** 🆕 حالة دورة الحياة — غياب الحقل = active (توافق خلفي، انظر utils/tripStatus.ts). */
  status: TripStatus
  /** 🆕 متى تغيّرت status آخر مرة — غيابها يعني "غير معروف" (انظر useTripConfig.ts). */
  statusChangedAt?: number
}

export interface UseAllTripsResult {
  trips: TripSummary[]
  loading: boolean
  error: string | null
}

export function useAllTrips(enabled: boolean): UseAllTripsResult {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setTrips([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    const unsub = onSnapshot(
      tripsCol(),
      snap => {
        const list: TripSummary[] = snap.docs.map(d => {
          const data = d.data() as {
            name?: unknown; organizerUid?: unknown; itinerary?: unknown; status?: unknown
            statusChangedAt?: unknown
          }
          return {
            id: d.id,
            name: typeof data.name === 'string' && data.name ? data.name : d.id,
            organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : undefined,
            status: normalizeTripStatus(data.status),
            statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
            itinerary: normalizeItinerary(data.itinerary),
          }
        })
        list.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        setTrips(list)
        setLoading(false)
        setError(null)
      },
      err => {
        console.error('تعذّر جلب قائمة الرحلات:', err)
        setError('تعذّر جلب قائمة الرحلات — تحقّق من صلاحياتك واتصالك.')
        setLoading(false)
      }
    )

    return unsub
  }, [enabled])

  return { trips, loading, error }
}
