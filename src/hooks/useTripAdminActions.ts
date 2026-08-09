// 🆕 عمليات الكتابة الخاصة بواجهة إدارة الرحلات.
//
// مساران مختلفان عمداً بحسب حساسية البيانات:
//
// 1. البيانات غير السرّية (الاسم/البنك/المسار) → كتابة مباشرة على
//    trips/{tripId} عبر قواعد Firestore (isValidTripConfig). أخفّ وأسرع، ولا
//    تحتاج نشر دوال عند كل تعديل. القاعدة تشترط isAdmin() فقط ولا تشير للرحلة
//    النشطة، فالمسؤول يعدّل أي رحلة دون مغادرة الرحلة المفتوحة.
//
// 2. إنشاء رحلة أو تغيير رمزها → Cloud Function باسم manageTrip، لأنها تلمس
//    tripSecrets/{tripId} المحظور على العميل تحت أي ظرف. توليد الملح وحساب
//    الهاش يبقيان خادميين فلا يلمس المتصفح أياً منهما.
//
// ⚠️ كل كتابات المسار الأول تستخدم setDoc(..., { merge: true }):
//   - الكتابة الكاملة بلا merge تمسح الحقول غير المذكورة — وهذه مصيدة
//     scripts/create-trip.mjs، الذي يستدعي .set() بكائن بلا itinerary فيمحو
//     مسار الرحلة عند تحديث تفاصيل البنك فقط.
//   - merge يُنشئ المستند إن لم يكن موجوداً.
import { useState, useCallback } from 'react'
import { setDoc } from 'firebase/firestore'
import { auth } from '../firebase'
import { tripDocById } from '../firestore'
import { haptic } from '../utils/haptics'
import { MAX_SEGMENTS } from '../utils/itinerary'
import { TRIP_STATUS_LABEL } from '../types'
import type { BankDetails, ItinerarySegment, ToastMessage, TripStatus } from '../types'

interface UseTripAdminActionsParams {
  isAdmin: boolean
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export interface UseTripAdminActionsResult {
  isSaving: boolean
  saveBankDetails: (tripId: string, details: BankDetails) => Promise<boolean>
  saveItinerary: (tripId: string, itinerary: ItinerarySegment[]) => Promise<boolean>
  saveTripName: (tripId: string, name: string) => Promise<boolean>
  /** 🆕 تغيير حالة دورة حياة الرحلة — القواعد تفرض أثرها، هذا يكتب الحقل فقط. */
  saveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  createTrip: (tripId: string, name: string, pin: string) => Promise<boolean>
  resetTripPin: (tripId: string, pin: string) => Promise<boolean>
  /** حذف نهائي — للرحلات الفارغة فقط، والخادم هو من يفرض ذلك (انظر functions/index.js). */
  deleteTrip: (tripId: string) => Promise<boolean>
}

export function useTripAdminActions({
  isAdmin, showToast, handleFirestoreError,
}: UseTripAdminActionsParams): UseTripAdminActionsResult {
  const [isSaving, setIsSaving] = useState(false)

  // كل مسارات الكتابة المباشرة تمرّ من هنا: فحص الصلاحية، علم الحفظ، رسالة
  // النجاح، ومعالجة الخطأ — بدل تكرار الأربعة في كل دالة.
  const write = useCallback(async (
    tripId: string,
    payload: Record<string, unknown>,
    successText: string,
    errorFallback: string,
  ): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      await setDoc(tripDocById(tripId), payload, { merge: true })
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

  const saveBankDetails = useCallback((tripId: string, details: BankDetails) => write(
    tripId,
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

  const saveItinerary = useCallback((tripId: string, itinerary: ItinerarySegment[]) => {
    // نفس الحدّ المفروض في firestore.rules — نكشفه برسالة مفهومة بدل ترك
    // القواعد ترفض الكتابة بخطأ صلاحيات غامض.
    if (itinerary.length > MAX_SEGMENTS) {
      showToast({ text: `الحد الأقصى ${MAX_SEGMENTS} مقطعاً في المسار.`, type: 'error' }, 3000)
      return Promise.resolve(false)
    }
    return write(tripId, { itinerary }, 'تم حفظ مسار الرحلة', 'تعذّر حفظ مسار الرحلة.')
  }, [write, showToast])

  const saveTripName = useCallback((tripId: string, name: string) => write(
    tripId,
    { name: name.trim() },
    'تم حفظ اسم الرحلة',
    'تعذّر حفظ اسم الرحلة.',
  ), [write])

  const saveTripStatus = useCallback((tripId: string, status: TripStatus) => write(
    tripId,
    { status },
    `تم تغيير حالة الرحلة إلى «${TRIP_STATUS_LABEL[status]}»`,
    'تعذّر تغيير حالة الرحلة.',
  ), [write])

  // ── المسار الخادمي (manageTrip) ─────────────────────────────────────────
  // نستدعيها عبر إعادة التوجيه في vercel.json (/api/manageTrip) لا عبر رابط
  // الدالة المباشر — نفس نمط verifyTripPin، لتفادي CORS.
  const callManageTrip = useCallback(async (
    mode: 'create' | 'resetPin' | 'delete',
    tripId: string,
    pin: string,
    name: string,
    successText: string,
  ): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      const idToken = await user.getIdToken(true)

      const response = await fetch('/api/manageTrip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ data: { mode, tripId, pin, name } }),
      })
      const resData = await response.json().catch(() => ({}))

      if (!response.ok) {
        // الدالة ترسل رسائل عربية مفهومة (معرّف مكرر، رمز قصير…) فنعرضها كما هي
        const message = resData?.error?.message || 'تعذّر تنفيذ العملية.'
        haptic.error()
        showToast({ text: message, type: 'error' }, 4000)
        return false
      }

      haptic.success()
      showToast({ text: successText, type: 'success' })
      return true
    } catch (err) {
      haptic.error()
      handleFirestoreError(err, 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  const createTrip = useCallback(
    (tripId: string, name: string, pin: string) =>
      callManageTrip('create', tripId, pin, name, `تم إنشاء الرحلة "${tripId}"`),
    [callManageTrip]
  )

  const resetTripPin = useCallback(
    (tripId: string, pin: string) =>
      callManageTrip('resetPin', tripId, pin, '', 'تم تغيير رمز الرحلة'),
    [callManageTrip]
  )

  // الرمز والاسم فارغان: الحذف لا يحتاجهما، والدالة الخادمية لا تفرضهما في هذا
  // الوضع. ورسالة «الرحلة ليست فارغة» تأتي من الخادم وتُعرض كما هي (انظر أعلاه).
  const deleteTrip = useCallback(
    (tripId: string) =>
      callManageTrip('delete', tripId, '', '', `تم حذف الرحلة "${tripId}"`),
    [callManageTrip]
  )

  return { isSaving, saveBankDetails, saveItinerary, saveTripName, saveTripStatus, createTrip, resetTripPin, deleteTrip }
}
