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
import type { BankDetails, ItinerarySegment } from '../types'

export interface TripSummary {
  id: string
  name: string
  bankDetails: BankDetails
  itinerary: ItinerarySegment[]
}

const EMPTY_BANK: BankDetails = { bankName: '', beneficiary: '', iban: '' }

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
          const data = d.data() as { name?: unknown; bankDetails?: Partial<BankDetails>; itinerary?: unknown }
          return {
            id: d.id,
            name: typeof data.name === 'string' && data.name ? data.name : d.id,
            bankDetails: {
              bankName:    data.bankDetails?.bankName    ?? EMPTY_BANK.bankName,
              beneficiary: data.bankDetails?.beneficiary ?? EMPTY_BANK.beneficiary,
              iban:        data.bankDetails?.iban        ?? EMPTY_BANK.iban,
            },
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
