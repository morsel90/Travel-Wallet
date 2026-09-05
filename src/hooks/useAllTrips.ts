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
import { normalizeItinerary, normalizeItineraryRev } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import { normalizeTripType } from '../utils/tripType'
import type { ItinerarySegment, TripStatus, TripType } from '../types'

export interface TripSummary {
  id: string
  name: string
  /** 🆕 uid منظّم الرحلة الحالي — غيابه يعني رحلة قديمة بلا منظّم معروف بعد. */
  organizerUid?: string
  itinerary: ItinerarySegment[]
  /**
   * 🆕 نسخة المسار — يرفعها كل حفظ بمقدار واحد، ويفرض ذلك firestore.rules
   * (itineraryRevIsBumped). المحرّر يحتفظ بالقيمة التي فتح عليها ويرسلها +1،
   * فيُرفض حفظه إن كان غيره قد حفظ بينهما بدل أن يمحوه بصمت. غياب الحقل = 0.
   */
  itineraryRev: number
  /** 🆕 حالة دورة الحياة — غياب الحقل = active (توافق خلفي، انظر utils/tripStatus.ts). */
  status: TripStatus
  /** 🆕 متى تغيّرت status آخر مرة — غيابها يعني "غير معروف" (انظر useTripConfig.ts). */
  statusChangedAt?: number
  /** 🆕 نمط الرحلة — غيابه يعني standard (انظر utils/tripType.ts). تحتاجه TripDetailPanel لاشتقاق الترقية التلقائية عند حفظ المسار. */
  tripType: TripType
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
            statusChangedAt?: unknown; tripType?: unknown; itineraryRev?: unknown
          }
          return {
            id: d.id,
            name: typeof data.name === 'string' && data.name ? data.name : d.id,
            organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : undefined,
            status: normalizeTripStatus(data.status),
            statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
            itinerary: normalizeItinerary(data.itinerary),
            itineraryRev: normalizeItineraryRev(data.itineraryRev),
            tripType: normalizeTripType(data.tripType),
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
