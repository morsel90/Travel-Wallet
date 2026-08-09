import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { tripConfigDoc } from '../firestore'
import { BANK_DETAILS as FALLBACK_BANK_DETAILS } from '../constants'
import { normalizeItinerary } from '../utils/itinerary'
import { normalizeTripStatus } from '../utils/tripStatus'
import type { BankDetails, ItinerarySegment, TripStatus } from '../types'

// ─── useTripConfig ──────────────────────────────────────────────────────────
// 🆕 دعم رحلات متعددة: تفاصيل الحساب البنكي (واسم الرحلة إن وُجد) لم تعد ثابتة
// بالكود لكل الرحلات — تُقرأ من مستند trips/{TRIP_ID} في Firestore (انظر
// firestore.ts وscripts/create-trip.mjs، الأداة التي ينشئ بها المسؤول رحلة
// جديدة). القيم في constants.ts (FALLBACK_BANK_DETAILS) تبقى كخط رجوع آمن
// لرحلات لم يُنشئ لها المسؤول بعد مستند إعدادات — مثال: الرحلة الافتراضية قبل
// تشغيل سكربت الترحيل لأول مرة بعد هذا التحديث.
//
// 🆕 صار الاشتراك حيّاً (onSnapshot) بدل قراءة واحدة (getDoc): واجهة إدارة
// الرحلة تعدّل هذا المستند من داخل التطبيق، وبالقراءة الواحدة كان المسؤول يحفظ
// تعديلاً ولا يراه في بطاقة الحساب البنكي ولا في ويدجت المقطع القادم حتى يعيد
// تحميل الصفحة. الاستماع يجعل كل الشاشات تتحدّث فوراً بلا أي تحديث يدوي.

export interface TripConfig {
  tripName: string | null
  bankDetails: BankDetails
  itinerary?: ItinerarySegment[]
  /** 🆕 حالة دورة الحياة — غياب الحقل يُعامَل كـ active (انظر utils/tripStatus.ts). */
  status: TripStatus
}

const FALLBACK_CONFIG: TripConfig = { tripName: null, bankDetails: FALLBACK_BANK_DETAILS, status: 'active' }

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
          bankDetails?: Partial<BankDetails>
          itinerary?: unknown
          status?: unknown
        }

        // normalizeItinerary تُسقط أي مقطع تالف وترتّب الباقي زمنياً — القواعد
        // لا تستطيع التحقق من بنية عناصر القائمة (موثّق في firestore.rules).
        const itinerary = normalizeItinerary(data.itinerary)

        setConfig({
          tripName: typeof data.name === 'string' ? data.name : null,
          bankDetails: {
            bankName:    data.bankDetails?.bankName    ?? FALLBACK_BANK_DETAILS.bankName,
            beneficiary: data.bankDetails?.beneficiary ?? FALLBACK_BANK_DETAILS.beneficiary,
            iban:        data.bankDetails?.iban        ?? FALLBACK_BANK_DETAILS.iban,
          },
          itinerary: itinerary.length > 0 ? itinerary : undefined,
          status: normalizeTripStatus(data.status),
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
