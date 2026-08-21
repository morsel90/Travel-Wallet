import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { tripConfigDoc } from '../firestore'
import { normalizeItinerary } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import type { ItinerarySegment, TripStatus } from '../types'

// ─── useTripConfig ──────────────────────────────────────────────────────────
// 🆕 دعم رحلات متعددة: اسم الرحلة ومسارها لم يعودا ثابتَين بالكود لكل الرحلات
// — تُقرأان من مستند trips/{TRIP_ID} في Firestore (انظر firestore.ts).
//
// 🆕 لا bankDetails هنا بعد اليوم — بيانات البنك مصدرها الوحيد بروفايل المنظّم
// (users/{organizerUid}، عبر useOrganizerBankDetails)، لا نسخة محلية على مستند
// الرحلة. organizerUid وحده ما تحتاجه هذه الواجهة لبناء ذلك المسار.
//
// 🆕 صار الاشتراك حيّاً (onSnapshot) بدل قراءة واحدة (getDoc): واجهة إدارة
// الرحلة تعدّل هذا المستند من داخل التطبيق، وبالقراءة الواحدة كان المسؤول يحفظ
// تعديلاً ولا يراه في ويدجت المقطع القادم حتى يعيد تحميل الصفحة. الاستماع
// يجعل كل الشاشات تتحدّث فوراً بلا أي تحديث يدوي.

export interface TripConfig {
  tripName: string | null
  /** 🆕 uid منظّم الرحلة الحالي — غيابه يعني رحلة قديمة بلا منظّم معروف بعد. */
  organizerUid?: string
  itinerary?: ItinerarySegment[]
  /** 🆕 حالة دورة الحياة — غياب الحقل يُعامَل كـ active (انظر utils/tripStatus.ts). */
  status: TripStatus
  /**
   * 🆕 متى تغيّرت status آخر مرة — يدوياً أو عبر advanceTripLifecycle
   * (functions/index.js). غيابه يعني "غير معروف" لا "الآن"؛ لا افتراض
   * رجعي لرحلة لم تُلمَس منذ هذه الميزة (نفس فلسفة organizerUid/createdByUid).
   */
  statusChangedAt?: number
}

const FALLBACK_CONFIG: TripConfig = { tripName: null, status: 'active' }

// 🆕 مرّر hasAccess ? user : null من App.tsx (تماماً كما مع useTravelers/
// useExpenses) — وليس user مباشرة. وإلا فمحاولة القراءة الأولى (قبل التحقق من
// رمز الرحلة) سترفض بصلاحيات "denied"، ولن تُعاد تلقائياً بعد نجاح التحقق
// لاحقاً لأن مرجع user لا يتغيّر عند تحديث التوكن فقط (نفس السبب الموثّق في
// App.tsx بخصوص hasAccess).
export function useTripConfig(user: User | null): TripConfig {
  const [config, setConfig] = useState<TripConfig>(FALLBACK_CONFIG)

  useEffect(() => {
    if (!user) {
      setConfig(FALLBACK_CONFIG)
      return
    }

    const unsub = onSnapshot(
      tripConfigDoc(),
      snap => {
        // 🆕 لا يوجد مستند إعدادات لهذه الرحلة بعد — نستمر بالقيم الافتراضية
        // بصمت (متوقّع تماماً للرحلة الافتراضية قبل تشغيل سكربت الترحيل)
        if (!snap.exists()) {
          setConfig(FALLBACK_CONFIG)
          return
        }

        const data = snap.data() as {
          name?: unknown
          organizerUid?: unknown
          itinerary?: unknown
          status?: unknown
          statusChangedAt?: unknown
        }

        // normalizeItinerary تُسقط أي مقطع تالف وترتّب الباقي زمنياً — القواعد
        // لا تستطيع التحقق من بنية عناصر القائمة (موثّق في firestore.rules).
        const itinerary = normalizeItinerary(data.itinerary)

        setConfig({
          tripName: typeof data.name === 'string' ? data.name : null,
          organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : undefined,
          itinerary: itinerary.length > 0 ? itinerary : undefined,
          status: normalizeTripStatus(data.status),
          statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
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
