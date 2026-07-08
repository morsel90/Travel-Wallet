import { useState, useEffect } from 'react'
import { getDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { tripConfigDoc } from '../firestore'
import { BANK_DETAILS as FALLBACK_BANK_DETAILS } from '../constants'

// ─── useTripConfig ──────────────────────────────────────────────────────────
// 🆕 دعم رحلات متعددة: تفاصيل الحساب البنكي (واسم الرحلة إن وُجد) لم تعد ثابتة
// بالكود لكل الرحلات — تُقرأ من مستند trips/{TRIP_ID} في Firestore (انظر
// firestore.ts وscripts/create-trip.mjs، الأداة التي ينشئ بها المسؤول رحلة
// جديدة). القيم في constants.ts (FALLBACK_BANK_DETAILS) تبقى كخط رجوع آمن
// لرحلات لم يُنشئ لها المسؤول بعد مستند إعدادات — مثال: الرحلة الافتراضية قبل
// تشغيل سكربت الترحيل لأول مرة بعد هذا التحديث.
interface BankDetails {
  bankName: string
  beneficiary: string
  iban: string
}

export interface TripConfig {
  tripName: string | null
  bankDetails: BankDetails
}

const FALLBACK_CONFIG: TripConfig = { tripName: null, bankDetails: FALLBACK_BANK_DETAILS }

// 🆕 مرّر hasAccess ? user : null من App.tsx (تماماً كما مع useTravelers/
// useExpenses) — وليس user مباشرة. وإلا فمحاولة القراءة الأولى (قبل التحقق من
// رمز الرحلة) سترفض بصلاحيات "denied"، ولن تُعاد تلقائياً بعد نجاح التحقق
// لاحقاً لأن مرجع user لا يتغيّر عند تحديث التوكن فقط (نفس السبب الموثّق في
// App.tsx بخصوص hasAccess).
export function useTripConfig(user: User | null): TripConfig {
  const [config, setConfig] = useState<TripConfig>(FALLBACK_CONFIG)

  useEffect(() => {
    if (!user) { setConfig(FALLBACK_CONFIG); return }

    let cancelled = false
    getDoc(tripConfigDoc())
      .then(snap => {
        if (cancelled) return
        // 🆕 لا يوجد مستند إعدادات لهذه الرحلة بعد — نستمر بالقيم الافتراضية
        // بصمت (متوقّع تماماً للرحلة الافتراضية قبل تشغيل سكربت الترحيل)
        if (!snap.exists()) { setConfig(FALLBACK_CONFIG); return }
        const data = snap.data() as { name?: unknown; bankDetails?: Partial<BankDetails> }
        setConfig({
          tripName: typeof data.name === 'string' ? data.name : null,
          bankDetails: {
            bankName:    data.bankDetails?.bankName    ?? FALLBACK_BANK_DETAILS.bankName,
            beneficiary: data.bankDetails?.beneficiary ?? FALLBACK_BANK_DETAILS.beneficiary,
            iban:        data.bankDetails?.iban        ?? FALLBACK_BANK_DETAILS.iban,
          },
        })
      })
      .catch(err => {
        console.error('تعذّرت قراءة إعدادات الرحلة، سيُستخدم الافتراضي:', err)
        if (!cancelled) setConfig(FALLBACK_CONFIG)
      })

    return () => { cancelled = true }
  }, [user])

  return config
}
