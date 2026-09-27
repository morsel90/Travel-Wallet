import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { tripConfigDoc } from '../firestore'
import { normalizeItinerary, normalizeItineraryRev } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import { normalizeTripType } from '../utils/tripType'
import { normalizePeriodKey, isValidPeriodKey } from '../utils/period'
import type { ItinerarySegment, PeriodKey, TripStatus, TripType } from '../types'

// ─── useTripConfig ──────────────────────────────────────────────────────────
// اشتراك حيّ في trips/{TRIP_ID} — تعديلات لوحة الإدارة تظهر فوراً.
// ⚠️ لا bankDetails هنا: مصدرها الوحيد بروفايل المنظّم (useOrganizerBankDetails).

export interface TripConfig {
  tripName: string | null
  /**
   * الخادم أكّد أن مستند الرحلة غير موجود.
   *
   * ⚠️ من الخادم وحده لا الكاش: كاش لم يحمل المستند بعد يطرد المستخدم من رحلة
   * حقيقية، أما الخطأ المعاكس فيُبقي شاشة تحميل فقط.
   */
  deleted: boolean
  /** غيابه = رحلة قديمة بلا منظّم معروف. */
  organizerUid?: string
  itinerary?: ItinerarySegment[]
  /** نسخة المسار للقفل التفاؤلي — الغياب = 0. */
  itineraryRev: number
  /** الغياب = active. */
  status: TripStatus
  /** آخر تغيّر في status. الغياب = «غير معروف» لا «الآن». */
  statusChangedAt?: number
  /** الغياب = standard. ⚠️ الشرط الوحيد الذي يفتح مكوّنات components/longterm/. */
  tripType: TripType
  /** الشهر المفتوح (الرحلات الطويلة وحدها). الغياب = الشهر الجاري. */
  currentPeriod: PeriodKey
  /** الغياب = «لم يُغلق أي شهر بعد». */
  lastClosedPeriod?: PeriodKey
  /** الغياب = «غير معروف». */
  lastClosedAt?: number
}

const FALLBACK_CONFIG: TripConfig = {
  tripName: null,
  deleted: false,
  itineraryRev: 0,
  status: 'active',
  // ⚠️ رحلة بلا مستند إعدادات هي رحلة قياسية بالتعريف — لا واجهة ترحيل لها.
  tripType: 'standard',
  currentPeriod: normalizePeriodKey(undefined),
}

// ⚠️ مرّر `hasAccess ? user : null` لا user: قراءة قبل الصلاحية تُرفض ولا تُعاد
// تلقائياً، لأن مرجع user لا يتغيّر عند تحديث التوكن.
export function useTripConfig(user: User | null): TripConfig {
  const [config, setConfig] = useState<TripConfig>(FALLBACK_CONFIG)

  useEffect(() => {
    if (!user) {
      setConfig(FALLBACK_CONFIG)
      return
    }

    // ⚠️ includeMetadataChanges: حين يؤكّد الخادم ما قاله الكاش («غير موجود»)
    // لا تتغيّر البيانات بل fromCache وحده — وبلا هذا الخيار لا يصل ذلك
    // التأكيد أبداً، فتبقى `deleted` false وتبقى رحلةٌ محذوفة شاشةَ تحميل.
    const unsub = onSnapshot(
      tripConfigDoc(),
      { includeMetadataChanges: true },
      snap => {
        if (!snap.exists()) {
          setConfig(snap.metadata.fromCache ? FALLBACK_CONFIG : { ...FALLBACK_CONFIG, deleted: true })
          return
        }

        const data = snap.data() as {
          name?: unknown
          organizerUid?: unknown
          itinerary?: unknown
          itineraryRev?: unknown
          status?: unknown
          statusChangedAt?: unknown
          tripType?: unknown
          currentPeriod?: unknown
          lastClosedPeriod?: unknown
          lastClosedAt?: unknown
        }

        // normalizeItinerary تُسقط أي مقطع تالف وترتّب الباقي زمنياً — القواعد
        // لا تستطيع التحقق من بنية عناصر القائمة (موثّق في firestore.rules).
        const itinerary = normalizeItinerary(data.itinerary)

        setConfig({
          tripName: typeof data.name === 'string' ? data.name : null,
          deleted: false,
          organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : undefined,
          itinerary: itinerary.length > 0 ? itinerary : undefined,
          itineraryRev: normalizeItineraryRev(data.itineraryRev),
          status: normalizeTripStatus(data.status),
          statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
          tripType: normalizeTripType(data.tripType),
          currentPeriod: normalizePeriodKey(data.currentPeriod),
          // ⚠️ لا سقوط للشهر الجاري: «لم يُغلق شيء» غير «أُغلق الجاري».
          lastClosedPeriod: isValidPeriodKey(data.lastClosedPeriod) ? data.lastClosedPeriod : undefined,
          lastClosedAt: typeof data.lastClosedAt === 'number' ? data.lastClosedAt : undefined,
        })
      },
      err => {
        console.error('تعذّرت قراءة إعدادات الرحلة، سيُستخدم الافتراضي:', err)
        setConfig(FALLBACK_CONFIG)
      }
    )

    return unsub
  }, [user])

  return config
}
