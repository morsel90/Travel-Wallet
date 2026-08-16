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
import { setDoc, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import {
  tripDocById, expensesColByTrip, travelersColByTrip, travelerNamesColByTrip, depositLogsColByTrip,
} from '../firestore'
import { haptic } from '../utils/haptics'
import { MAX_SEGMENTS } from '../utils/itinerary'
import { buildTripBackup, downloadTripBackup } from '../utils/backup'
import { TRIP_STATUS_LABEL } from '../types'
import type { BankDetails, DepositLogEntry, Expense, ItinerarySegment, ToastMessage, Traveler, TripStatus } from '../types'
import type { TripSummary } from './useAllTrips'

// عقد استدعاء manageTrip — يطابق ما تقرأه الدالة في functions/index.js
interface ManageTripRequest {
  mode: 'create' | 'resetPin' | 'delete'
  tripId: string
  pin: string
  name: string
}
interface ManageTripResponse { success: boolean; tripId: string }

// 🆕 عقد استدعاء manageMember
interface ManageMemberRequest { mode: 'remove'; tripId: string; uid: string }
interface ManageMemberResponse {
  success: boolean
  uid: string
  tripId: string
  /** false إن لم يكن عضواً في الـ claims أصلاً — نُظِّف سطر السجلّ فقط. */
  claimRemoved: boolean
  /** true إن كان المستهدَف مسؤولاً: صلاحيته عالمية ولا تمرّ بعضوية الرحلة. */
  stillHasAccess: boolean
}

// 🆕 عقد استدعاء restoreTrip — docs/PLAN-backup-recovery.md المرحلة ٢.
// backup: unknown عمداً — الشكل الحقيقي (TripBackup) يُتحقَّق منه خادمياً
// بالكامل (Admin SDK يتجاوز القواعد)، فلا قيمة في تضييق النوع هنا فقط ليُخدَع
// لاحقاً بملف عُدِّل يدوياً بشكل يطابق TripBackup ظاهرياً لكنه فاسد فعلياً.
interface RestoreTripRequest { tripId: string; pin: string; backup: unknown }
interface RestoreTripResponse {
  success: boolean
  tripId: string
  restored: { travelers: number; expenses: number; depositLogs: number }
}

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
  /** 🆕 إزالة عضو من رحلة واحدة — لا تمسّ بقية رحلاته، ولا تُلغي مصاريفه. */
  removeMember: (tripId: string, uid: string) => Promise<boolean>
  /** 🆕 تنزيل نسخة JSON احتياطية لرحلة واحدة — انظر docs/PLAN-backup-recovery.md المرحلة ١. */
  exportBackup: (trip: TripSummary) => Promise<boolean>
  /** 🆕 استعادة رحلة من نسخة JSON — رحلة فارغة أو غير موجودة فقط. المرحلة ٢. */
  restoreTrip: (tripId: string, pin: string, backup: unknown) => Promise<boolean>
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
  // 🆕 عبر httpsCallable لا fetch على `/api/manageTrip`. الرابط يُشتق من معرّف
  // المشروع في إعداد التطبيق، فتتبع الدالة أي بيئة يشير إليها البناء — وهو ما
  // كان مستحيلاً مع إعادة التوجيه في vercel.json (رابط مكتوب حرفياً لا يقرأ
  // متغيرات البيئة). انظر التعليق الأوسع في hooks/useAuth.ts.
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
      // تحديث التوكن ليحمل claim المسؤول الحالي — الدالة تعيد فحصه خادمياً
      await user.getIdToken(true)

      const manageTrip = httpsCallable<ManageTripRequest, ManageTripResponse>(functions, 'manageTrip')
      await manageTrip({ mode, tripId, pin, name })

      haptic.success()
      showToast({ text: successText, type: 'success' })
      return true
    } catch (err) {
      haptic.error()
      // الدالة ترسل رسائل عربية مفهومة (معرّف مكرر، رمز قصير، رحلة غير فارغة…)
      // وتصل في message ضمن FunctionsError — نعرضها كما هي.
      const message = (err as { message?: string })?.message
      const isFunctionsError = typeof (err as { code?: string })?.code === 'string'
        && String((err as { code?: string }).code).startsWith('functions/')

      if (isFunctionsError && message) {
        showToast({ text: message, type: 'error' }, 4000)
      } else {
        handleFirestoreError(err, 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.')
      }
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

  // 🆕 إزالة عضو — دالة مستقلة عن callManageTrip لأن عقدها مختلف (uid بدل
  // pin/name) ولأن رسالة نجاحها مشروطة بما أعادته الدالة، لا نصاً ثابتاً.
  const removeMember = useCallback(async (tripId: string, uid: string): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const manageMember = httpsCallable<ManageMemberRequest, ManageMemberResponse>(functions, 'manageMember')
      const { data } = await manageMember({ mode: 'remove', tripId, uid })

      haptic.success()

      // ⚠️ الرسالة تقول الحقيقة كاملةً بدل «تمت الإزالة» المطمئنة:
      //
      //   • المسؤول لا يستمد وصوله من عضوية الرحلة بل من claim عالمي، فإزالته
      //     منها لا تحجب عنه شيئاً — وإخفاء ذلك يوهم بأن الإجراء فعل ما لم يفعله.
      //   • ومن أُزيل فعلاً يحتفظ بوصوله حتى ساعة: التوكن صالح ٦٠ دقيقة و
      //     firestore.rules تقرأ العضوية منه. هذا ثمن كون isMember() مجانية،
      //     ولا يجوز أن يكتشفه المسؤول بنفسه بعد أن يظنّ الباب أُغلق.
      if (data.stillHasAccess) {
        showToast({
          text: 'أُزيل من قائمة الرحلة، لكنه مسؤول — وصلاحيته عامة ولا تمرّ بعضوية الرحلة.',
          type: 'success',
        }, 6000)
      } else if (!data.claimRemoved) {
        showToast({ text: 'لم يكن عضواً فعلياً — نُظِّف سطره من القائمة.', type: 'success' }, 4000)
      } else {
        showToast({
          text: 'تمت الإزالة. قد يبقى وصوله فعّالاً حتى ساعة حتى تنتهي صلاحية جلسته.',
          type: 'success',
        }, 6000)
      }
      return true
    } catch (err) {
      haptic.error()
      const message = (err as { message?: string })?.message
      const isFunctionsError = typeof (err as { code?: string })?.code === 'string'
        && String((err as { code?: string }).code).startsWith('functions/')

      if (isFunctionsError && message) {
        showToast({ text: message, type: 'error' }, 4000)
      } else {
        handleFirestoreError(err, 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.')
      }
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  // 🆕 تنزيل نسخة احتياطية — قراءة فقط، بلا مسار كتابة جديد ولا دالة سحابية:
  // isAdmin() في القواعد يمنح قراءة expenses/travelers/depositLogs لأي رحلة،
  // لا الرحلة النشطة وحدها (نفس أساس فحص الخلوّ قبل الحذف). depositLogs تُجلب
  // لكل مسافر على حدة (subcollection تحت كل مستند مسافر) بالتوازي — كلفة عدد
  // القراءات مقبولة لأنه إجراء يدوي نادر، لا مسار ساخن.
  const exportBackup = useCallback(async (trip: TripSummary): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const [travelersSnap, expensesSnap, travelerNamesSnap] = await Promise.all([
        getDocs(travelersColByTrip(trip.id)),
        getDocs(expensesColByTrip(trip.id)),
        getDocs(travelerNamesColByTrip(trip.id)),
      ])

      const travelers = travelersSnap.docs.map(d => d.data() as Traveler)
      const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }))
      const travelerNames = travelerNamesSnap.docs.map(d => ({
        shortName: d.id,
        travelerId: (d.data() as { travelerId: number }).travelerId,
      }))

      const depositLogsByTraveler = await Promise.all(
        travelers.map(t => getDocs(depositLogsColByTrip(trip.id, t.id))),
      )
      const depositLogs = depositLogsByTraveler.flatMap(snap =>
        snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DepositLogEntry, 'id'>) })),
      )

      const backup = buildTripBackup({
        tripId: trip.id,
        trip: { name: trip.name, bankDetails: trip.bankDetails, itinerary: trip.itinerary, status: trip.status },
        travelers, expenses, depositLogs, travelerNames,
      })
      downloadTripBackup(backup)

      haptic.success()
      showToast({
        text: `تم تنزيل نسخة احتياطية لـ"${trip.name}" — ${travelers.length} مسافراً و${expenses.length} مصروفاً.`,
        type: 'success',
      }, 4000)
      return true
    } catch (err) {
      haptic.error()
      handleFirestoreError(err, 'تعذّر تنزيل النسخة الاحتياطية.')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  // 🆕 استعادة — دالة مستقلة عن callManageTrip لأن عقدها مختلف تماماً (backup
  // كامل بدل pin/name فقط) ولأن الخادم يعيد إحصاءً (restored) يستحق إظهاره في
  // رسالة النجاح، لا نصاً ثابتاً. كل التحقق الفعلي خادمي — انظر restoreTrip في
  // functions/index.js؛ العميل هنا لا يفحص شكل backup إطلاقاً.
  const restoreTripFn = useCallback(async (tripId: string, pin: string, backup: unknown): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const restoreTripCallable = httpsCallable<RestoreTripRequest, RestoreTripResponse>(functions, 'restoreTrip')
      const { data } = await restoreTripCallable({ tripId, pin, backup })

      haptic.success()
      showToast({
        text: `تمت الاستعادة — ${data.restored.travelers} مسافراً، ${data.restored.expenses} مصروفاً، ${data.restored.depositLogs} سجلّ إيداع.`,
        type: 'success',
      }, 5000)
      return true
    } catch (err) {
      haptic.error()
      // رسائل restoreTrip العربية (رحلة غير فارغة، بنية نسخة غير صالحة…) تصل
      // كما وصلت رسائل manageTrip/manageMember — نعرضها كما هي.
      const message = (err as { message?: string })?.message
      const isFunctionsError = typeof (err as { code?: string })?.code === 'string'
        && String((err as { code?: string }).code).startsWith('functions/')

      if (isFunctionsError && message) {
        showToast({ text: message, type: 'error' }, 5000)
      } else {
        handleFirestoreError(err, 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.')
      }
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  return {
    isSaving, saveBankDetails, saveItinerary, saveTripName, saveTripStatus, createTrip, resetTripPin,
    deleteTrip, removeMember, exportBackup, restoreTrip: restoreTripFn,
  }
}
