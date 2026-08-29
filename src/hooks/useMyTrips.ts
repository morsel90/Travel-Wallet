// 🆕 رحلات المستخدم الحالي — الرحلات التي انضم لها فعلاً (شاشة «رحلاتي»).
//
// ⚠️ لماذا getDoc لكل رحلة على حدة بدل استعلام واحد على المجموعة؟
// شرط القراءة في firestore.rules هو `isMember(tripId) || isAdmin()`. الشق
// الأول يُقيَّم لكل مستند بمعرّفه، فيصلح لقراءة مستند بعينه لكنه لا يُرضي
// استعلام list عامًّا إطلاقاً (استعلام القائمة يحتاج شرطاً صحيحاً للمستخدم
// كله بغض النظر عن المستندات — أي isAdmin وحده، انظر useAllTrips).
//
// أي أن قراءة مستند كل رحلة منفردةً هي *بالضبط* ما تسمح به القواعد الحالية
// لعضو عادي — فهذه الشاشة لا تحتاج أي تعديل على firestore.rules ولا تكشف
// شيئاً لا يملك المستخدم صلاحيته أصلاً. لا تستبدلها باستعلام قائمة «لتحسين
// الأداء»: سيفشل لكل من ليس مسؤولاً.
//
// عدد الرحلات لكل مستخدم صغير عملياً (رحلات شخص واحد)، فتوازي getDoc عبر
// Promise.all كافٍ تماماً ولا يستدعي أي تعقيد إضافي.
//
// 🆕 الشكل مطابق حرفياً لـ TripSummary (useAllTrips): بعد دمج «رحلاتي» و«إدارة
// الرحلات» في شاشة واحدة، يحتاج كل صفّ هنا نفس الحقول التي تحتاجها لوحة تفاصيل
// الرحلة (TripDetailPanel) لتعديل رحلة ينظّمها هذا المستخدم — المستند مقروء
// بالكامل هنا أصلاً، فلا كلفة إضافية لكشف itinerary/organizerUid أيضاً.
import { useState, useEffect, useCallback } from 'react'
import type { User } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import { tripDocById } from '../firestore'
import { normalizeItinerary } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import type { TripSummary } from './useAllTrips'

export type MyTrip = TripSummary

export interface UseMyTripsResult {
  trips: MyTrip[]
  loading: boolean
  error: string | null
}

/**
 * @param tripIds معرّفات الرحلات من claims المستخدم (انظر joinedTripIds في useAuth)
 * @param user المستخدم الحالي — لا نقرأ شيئاً قبل اكتمال المصادقة
 */
export function useMyTrips(tripIds: string[], user: User | null): UseMyTripsResult {
  const [trips, setTrips] = useState<MyTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // المصفوفة تُبنى من جديد في كل عرض داخل useAuth، فمقارنة المرجع تُعيد
  // التنفيذ بلا داعٍ — نعتمد على المحتوى نفسه كمفتاح للتأثير.
  const key = tripIds.join(',')

  const load = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!user || ids.length === 0) {
      setTrips([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(ids.map(async (id): Promise<MyTrip | null> => {
        try {
          const snap = await getDoc(tripDocById(id))
          // رحلة في claims المستخدم لكن مستندها غير موجود = رحلة حُذفت من
          // قاعدة البيانات بعد انضمامه (الحذف ممنوع من الواجهة لكنه ممكن
          // بـ Admin SDK). نُسقطها بصمت بدل عرض صف مكسور لا يفتح شيئاً.
          if (!snap.exists()) return null
          const data = snap.data() as {
            name?: unknown; organizerUid?: unknown; itinerary?: unknown; status?: unknown
            statusChangedAt?: unknown
          }
          return {
            id,
            name: typeof data.name === 'string' && data.name ? data.name : id,
            organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : undefined,
            itinerary: normalizeItinerary(data.itinerary),
            status: normalizeTripStatus(data.status),
            statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
          }
        } catch {
          // فشل قراءة رحلة واحدة (صلاحية سُحبت، أو انقطاع لحظي) يجب ألا
          // يُسقط بقية القائمة — نعرض ما نجح ونتجاهل ما فشل.
          return null
        }
      }))

      const list = results.filter((t): t is MyTrip => t !== null)
      list.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      setTrips(list)
      // لم تنجح ولا رحلة واحدة رغم وجود معرّفات = مشكلة عامة (اتصال/صلاحيات)
      // لا حالة فردية، وحينها الصمت يترك المستخدم أمام شاشة فارغة بلا تفسير.
      setError(list.length === 0 ? 'تعذّر جلب رحلاتك — تحقّق من اتصالك وحاول مجدداً.' : null)
    } finally {
      setLoading(false)
    }
  }, [key, user])

  useEffect(() => { void load() }, [load])

  return { trips, loading, error }
}
