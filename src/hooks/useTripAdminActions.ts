// 🆕 عمليات الكتابة الخاصة بواجهة إدارة الرحلة — تكتب على مستند trips/{TRIP_ID}
// الذي صار مسموحاً للمسؤول وحده (انظر isValidTripConfig في firestore.rules).
//
// ⚠️ كل الكتابات هنا تستخدم setDoc(..., { merge: true }) عمداً:
//   1. الكتابة الكاملة بلا merge تمسح الحقول غير المذكورة — وهذه بالضبط مصيدة
//      scripts/create-trip.mjs، الذي يستدعي .set() بكائن بلا itinerary فيمحو
//      مسار الرحلة بالكامل عند تحديث تفاصيل البنك فقط.
//   2. merge يُنشئ المستند إن لم يكن موجوداً، فلا نحتاج فرعاً منفصلاً لرحلة
//      لم يُنشأ لها مستند إعدادات بعد.
//
// ملاحظة نطاق: رمز PIN وإنشاء رحلة جديدة خارج هذه الواجهة عمداً — كلاهما يمسّ
// tripSecrets/{tripId} المحظور تماماً على العميل، ويبقيان في scripts/create-trip.mjs.
import { useState, useCallback } from 'react'
import { setDoc } from 'firebase/firestore'
import { tripConfigDoc } from '../firestore'
import { haptic } from '../utils/haptics'
import { MAX_SEGMENTS } from '../utils/itinerary'
import type { BankDetails, ItinerarySegment, ToastMessage } from '../types'

interface UseTripAdminActionsParams {
  isAdmin: boolean
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export interface UseTripAdminActionsResult {
  isSaving: boolean
  saveBankDetails: (details: BankDetails) => Promise<boolean>
  saveItinerary: (itinerary: ItinerarySegment[]) => Promise<boolean>
  saveTripName: (name: string) => Promise<boolean>
}

export function useTripAdminActions({
  isAdmin, showToast, handleFirestoreError,
}: UseTripAdminActionsParams): UseTripAdminActionsResult {
  const [isSaving, setIsSaving] = useState(false)

  // كل المسارات تمرّ من هنا: فحص الصلاحية، علم الحفظ، رسالة النجاح، ومعالجة
  // الخطأ — بدل تكرار نفس الأربعة في كل دالة حفظ.
  const write = useCallback(async (
    payload: Record<string, unknown>,
    successText: string,
    errorFallback: string,
  ): Promise<boolean> => {
    // حارس على العميل فقط لرسالة أوضح — القواعد هي التي تمنع فعلياً
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      await setDoc(tripConfigDoc(), payload, { merge: true })
      haptic.success()
      showToast({ text: successText, type: 'success' })
      return true
    } catch (err) {
      haptic.error()
      handleFirestoreError(err, errorFallback)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  const saveBankDetails = useCallback((details: BankDetails) => write(
    {
      bankDetails: {
        bankName: details.bankName.trim(),
        beneficiary: details.beneficiary.trim(),
        iban: details.iban.trim().replace(/\s+/g, ''),
      },
    },
    'تم حفظ تفاصيل الحساب البنكي',
    'تعذّر حفظ تفاصيل الحساب البنكي.',
  ), [write])

  const saveItinerary = useCallback((itinerary: ItinerarySegment[]) => {
    // نفس الحدّ المفروض في firestore.rules — نكشفه هنا برسالة مفهومة بدل ترك
    // القواعد ترفض الكتابة بخطأ صلاحيات غامض.
    if (itinerary.length > MAX_SEGMENTS) {
      showToast({ text: `الحد الأقصى ${MAX_SEGMENTS} مقطعاً في المسار.`, type: 'error' }, 3000)
      return Promise.resolve(false)
    }
    return write(
      { itinerary },
      'تم حفظ مسار الرحلة',
      'تعذّر حفظ مسار الرحلة.',
    )
  }, [write, showToast])

  const saveTripName = useCallback((name: string) => write(
    { name: name.trim() },
    'تم حفظ اسم الرحلة',
    'تعذّر حفظ اسم الرحلة.',
  ), [write])

  return { isSaving, saveBankDetails, saveItinerary, saveTripName }
}
