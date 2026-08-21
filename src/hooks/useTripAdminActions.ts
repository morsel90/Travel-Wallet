// 🆕 عمليات الكتابة الخاصة بواجهة إدارة الرحلات.
//
// مساران مختلفان عمداً بحسب طبيعة العملية:
//
// 1. البيانات غير السرّية (الاسم/البنك/المسار) → كتابة مباشرة على
//    trips/{tripId} عبر قواعد Firestore (isValidTripConfig). أخفّ وأسرع، ولا
//    تحتاج نشر دوال عند كل تعديل. القاعدة تشترط isAdmin() فقط ولا تشير للرحلة
//    النشطة، فالمسؤول يعدّل أي رحلة دون مغادرة الرحلة المفتوحة.
//
// 2. إنشاء رحلة أو حذفها → Cloud Function باسم manageTrip — انظر تعليقها في
//    functions/index.js لماذا الحذف تحديداً يحتاج صلاحيات Admin SDK.
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
  mode: 'create' | 'delete'
  tripId: string
  name: string
  /** 🆕 اختياري، mode: 'create' فقط — يُعبَّأ من بروفايل المُنشئ (useUserProfile). */
  bankDetails?: BankDetails
}
interface ManageTripResponse { success: boolean; tripId: string }

// 🆕 عقد استدعاء manageMember — 'remove' (المسؤول أو منظّم الرحلة) و
// 🆕 'setRole' (المسؤول العالمي حصراً — المرحلة ٣، انظر functions/index.js)
type ManageMemberRequest =
  | { mode: 'remove'; tripId: string; uid: string }
  | { mode: 'setRole'; tripId: string; uid: string; role: 'organizer' | 'member' }
interface ManageMemberResponse {
  success: boolean
  uid: string
  tripId: string
  /** false إن لم يكن عضواً في الـ claims أصلاً — نُظِّف سطر السجلّ فقط. (mode: 'remove' فقط) */
  claimRemoved?: boolean
  /** true إن كان المستهدَف مسؤولاً: صلاحيته عالمية ولا تمرّ بعضوية الرحلة. (mode: 'remove' فقط) */
  stillHasAccess?: boolean
}

// 🆕 عقد استدعاء manageInvite — 'create' (يحذف أي رابط سابق لنفس الرحلة وينشئ
// توكناً جديداً) و'revoke' (يحذف الرابط النشط بلا استبدال). كلاهما متاح للمسؤول
// أو منظّم *هذه* الرحلة تحديداً — نفس شرط canAct أدناه، والفحص الحقيقي خادمي
// بالكامل في manageInvite. انظر functions/index.js.
interface ManageInviteRequest { mode: 'create' | 'revoke'; tripId: string }
interface ManageInviteResponse { success: boolean; token?: string }

// 🆕 عقد استدعاء linkTravelerAccount — نموذج الهوية الهجين. متاح للمسؤول أو
// منظّم *هذه* الرحلة تحديداً (نفس شرط canAct)؛ الفحص الحقيقي (المسافر غير
// مربوط بالفعل، والحساب المستهدَف غير مربوط بمسافر آخر) خادمي بالكامل. انظر
// functions/index.js.
interface LinkTravelerAccountRequest { tripId: string; travelerId: number; targetUid: string }
interface LinkTravelerAccountResponse { success: boolean; tripId: string; travelerId: number; targetUid: string }

// 🆕 عقد استدعاء restoreTrip — docs/PLAN-backup-recovery.md المرحلة ٢.
// backup: unknown عمداً — الشكل الحقيقي (TripBackup) يُتحقَّق منه خادمياً
// بالكامل (Admin SDK يتجاوز القواعد)، فلا قيمة في تضييق النوع هنا فقط ليُخدَع
// لاحقاً بملف عُدِّل يدوياً بشكل يطابق TripBackup ظاهرياً لكنه فاسد فعلياً.
interface RestoreTripRequest { tripId: string; backup: unknown }
interface RestoreTripResponse {
  success: boolean
  tripId: string
  restored: { travelers: number; expenses: number; depositLogs: number }
}

interface UseTripAdminActionsParams {
  isAdmin: boolean
  /**
   * 🆕 المرحلة ٣: معرّف الرحلة التي يملك فيها المستخدم الحالي دور «منظّم»، أو
   * null. القيمة الحقيقية الوحيدة الممكنة عملياً هي TRIP_ID الحالي — منظّم لا
   * يرى رحلة أخرى في الواجهة أصلاً ليكتب لها (انظر useAppCoordinator.ts).
   *
   * ⚠️ هذا **تحسين تجربة استخدام لا حماية**: الحارس الحقيقي في firestore.rules
   * (isOrganizer) وfunctions/index.js (manageMember). قيمة خاطئة هنا تعني في
   * أسوأ الأحوال محاولة كتابة تُرفض من الخادم برسالة صلاحيات — لا ثغرة.
   */
  organizerTripId: string | null
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
  /** 🆕 متاحة لأي حساب حقيقي مسجّل دخوله، لا المسؤول فقط — من ينشئ يصبح منظّم رحلته. */
  createTrip: (tripId: string, name: string, bankDetails?: BankDetails) => Promise<boolean>
  /** حذف نهائي — للرحلات الفارغة فقط، والخادم هو من يفرض ذلك (انظر functions/index.js). */
  deleteTrip: (tripId: string) => Promise<boolean>
  /** 🆕 إزالة عضو من رحلة واحدة — لا تمسّ بقية رحلاته، ولا تُلغي مصاريفه. */
  removeMember: (tripId: string, uid: string) => Promise<boolean>
  /** 🆕 تعيين/إلغاء دور «منظّم الرحلة» (المرحلة ٣) — المسؤول العالمي حصراً. */
  setMemberRole: (tripId: string, uid: string, role: 'organizer' | 'member') => Promise<boolean>
  /** 🆕 تنزيل نسخة JSON احتياطية لرحلة واحدة — انظر docs/PLAN-backup-recovery.md المرحلة ١. */
  exportBackup: (trip: TripSummary) => Promise<boolean>
  /** 🆕 استعادة رحلة من نسخة JSON — رحلة فارغة أو غير موجودة فقط. المرحلة ٢. */
  restoreTrip: (tripId: string, backup: unknown) => Promise<boolean>
  /** 🆕 رابط دعوة بنقرة واحدة — ينشئ توكناً جديداً (يُبطل أي رابط سابق لنفس الرحلة ضمنياً). null عند الفشل (توست يُعرض هنا). */
  createInvite: (tripId: string) => Promise<string | null>
  /** 🆕 يُبطل الرابط النشط لهذه الرحلة، إن وُجد. */
  revokeInvite: (tripId: string) => Promise<boolean>
  /** 🆕 ربط مسافر "شبح" (uid == null) بحساب عضو انضمّ فعلاً — نموذج الهوية الهجين. */
  linkTravelerAccount: (tripId: string, travelerId: number, targetUid: string) => Promise<boolean>
}

export function useTripAdminActions({
  isAdmin, organizerTripId, showToast, handleFirestoreError,
}: UseTripAdminActionsParams): UseTripAdminActionsResult {
  const [isSaving, setIsSaving] = useState(false)

  // 🆕 المرحلة ٣: المسؤول يتصرّف على أي رحلة، والمنظّم على رحلته وحدها —
  // بالضبط نفس الحدّ الذي تفرضه firestore.rules (isAdmin() || isOrganizer(tripId)).
  // هذا فحص واجهة فقط (انظر تعليق organizerTripId في الأعلى)، وليس مصدر الحماية.
  const canAct = useCallback(
    (tripId: string) => isAdmin || tripId === organizerTripId,
    [isAdmin, organizerTripId],
  )

  // كل مسارات الكتابة المباشرة تمرّ من هنا: فحص الصلاحية، علم الحفظ، رسالة
  // النجاح، ومعالجة الخطأ — بدل تكرار الأربعة في كل دالة.
  const write = useCallback(async (
    tripId: string,
    payload: Record<string, unknown>,
    successText: string,
    errorFallback: string,
  ): Promise<boolean> => {
    if (!canAct(tripId)) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.', type: 'error' }, 3000)
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
  }, [canAct, showToast, handleFirestoreError])

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
    mode: 'create' | 'delete',
    tripId: string,
    name: string,
    successText: string,
    bankDetails?: BankDetails,
  ): Promise<boolean> => {
    // 🆕 الحذف يبقى للمسؤول فقط — نفس الحدّ المفروض خادمياً في manageTrip.
    // الإنشاء متاح لأي حساب حقيقي مسجّل دخوله (نموذج واتساب)، والحدّ الحقيقي
    // (جلسة غير مجهولة، حدّ زمني) خادمي بالكامل — هذا فحص واجهة فقط.
    if (mode === 'delete' && !isAdmin) {
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
      await manageTrip({ mode, tripId, name, ...(bankDetails ? { bankDetails } : {}) })

      // 🆕 الإنشاء الذاتي (غير المسؤول) يمنح المُنشئ claim عضوية *جديداً* داخل
      // manageTrip نفسها — لم يكن موجوداً في التوكن المُحدَّث أعلاه لأنه لم
      // يُمنح بعد وقتها. بلا هذا التحديث الثاني، التوجيه الفوري لصفحة الرحلة
      // (openTrip في TripPicker.tsx) يُحمَّل بتوكن لا يحمل العضوية بعد فيفشل
      // isMember() — نفس المشكلة ونفس الحل اللذين تعالجهما useInviteJoin.ts
      // بعد joinViaInvite بالضبط.
      if (mode === 'create' && !isAdmin) {
        await user.getIdToken(true)
      }

      haptic.success()
      showToast({ text: successText, type: 'success' })
      return true
    } catch (err) {
      haptic.error()
      // الدالة ترسل رسائل عربية مفهومة (معرّف مكرر، رحلة غير فارغة…) وتصل في
      // message ضمن FunctionsError — نعرضها كما هي.
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
    (tripId: string, name: string, bankDetails?: BankDetails) =>
      callManageTrip('create', tripId, name, `تم إنشاء الرحلة "${tripId}"`, bankDetails),
    [callManageTrip]
  )

  // الاسم فارغ: الحذف لا يحتاجه، والدالة الخادمية لا تفرضه في هذا الوضع.
  // ورسالة «الرحلة ليست فارغة» تأتي من الخادم وتُعرض كما هي (انظر أعلاه).
  const deleteTrip = useCallback(
    (tripId: string) =>
      callManageTrip('delete', tripId, '', `تم حذف الرحلة "${tripId}"`),
    [callManageTrip]
  )

  // 🆕 إزالة عضو — دالة مستقلة عن callManageTrip لأن عقدها مختلف (uid بدل
  // name) ولأن رسالة نجاحها مشروطة بما أعادته الدالة، لا نصاً ثابتاً.
  // 🆕 المرحلة ٣: متاحة للمسؤول أو منظّم هذه الرحلة تحديداً — الفحص الحقيقي
  // (منظّم لا يزيل مسؤولاً ولا منظّماً آخر) يبقى خادمياً بالكامل في manageMember.
  const removeMember = useCallback(async (tripId: string, uid: string): Promise<boolean> => {
    if (!canAct(tripId)) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.', type: 'error' }, 3000)
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
  }, [canAct, showToast, handleFirestoreError])

  // 🆕 تعيين/إلغاء دور «منظّم الرحلة» — المسؤول العالمي حصراً (functions/index.js
  // يفرض هذا خادمياً أيضاً؛ لا يجوز لمنظّم تفويض دوره لآخر — انظر التعليق هناك).
  const setMemberRole = useCallback(async (
    tripId: string, uid: string, role: 'organizer' | 'member',
  ): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: 'تعيين دور منظّم الرحلة متاح للمسؤول فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const manageMember = httpsCallable<ManageMemberRequest, ManageMemberResponse>(functions, 'manageMember')
      await manageMember({ mode: 'setRole', tripId, uid, role })

      haptic.success()
      showToast({
        text: role === 'organizer' ? 'صار العضو منظّماً لهذه الرحلة.' : 'أُلغي دور المنظّم عن هذا العضو.',
        type: 'success',
      })
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

  // 🆕 رابط دعوة — createInvite/revokeInvite دالتان مستقلتان عن callManageTrip
  // لأن عقدهما مختلف (tripId فقط، لا name) ولأن createInvite يُعيد توكناً
  // يستهلكه المستدعي فوراً (بناء رابط المشاركة)، لا نص نجاح ثابت.
  const createInvite = useCallback(async (tripId: string): Promise<string | null> => {
    if (!canAct(tripId)) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.', type: 'error' }, 3000)
      return null
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const manageInvite = httpsCallable<ManageInviteRequest, ManageInviteResponse>(functions, 'manageInvite')
      const { data } = await manageInvite({ mode: 'create', tripId })
      return data.token ?? null
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
      return null
    } finally {
      setIsSaving(false)
    }
  }, [canAct, showToast, handleFirestoreError])

  const revokeInvite = useCallback(async (tripId: string): Promise<boolean> => {
    if (!canAct(tripId)) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const manageInvite = httpsCallable<ManageInviteRequest, ManageInviteResponse>(functions, 'manageInvite')
      await manageInvite({ mode: 'revoke', tripId })

      haptic.success()
      showToast({ text: 'تم إبطال رابط الدعوة.', type: 'success' })
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
  }, [canAct, showToast, handleFirestoreError])

  // 🆕 ربط مسافر شبح بحساب — دالة مستقلة عن callManageTrip لأن عقدها مختلف
  // (travelerId/targetUid بدل name) ولأن رسالة الخطأ الأشيع (مسافر مربوط
  // بالفعل، أو الحساب مربوط بمسافر آخر) خادمية بالكامل وتُعرض كما هي.
  const linkTravelerAccount = useCallback(async (
    tripId: string, travelerId: number, targetUid: string,
  ): Promise<boolean> => {
    if (!canAct(tripId)) {
      showToast({ text: 'هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.', type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const linkTravelerAccountCallable =
        httpsCallable<LinkTravelerAccountRequest, LinkTravelerAccountResponse>(functions, 'linkTravelerAccount')
      await linkTravelerAccountCallable({ tripId, travelerId, targetUid })

      haptic.success()
      showToast({ text: 'تم ربط المسافر بحسابه.', type: 'success' })
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
  }, [canAct, showToast, handleFirestoreError])

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
  // كامل بدل الاسم فقط) ولأن الخادم يعيد إحصاءً (restored) يستحق إظهاره في
  // رسالة النجاح، لا نصاً ثابتاً. كل التحقق الفعلي خادمي — انظر restoreTrip في
  // functions/index.js؛ العميل هنا لا يفحص شكل backup إطلاقاً.
  const restoreTripFn = useCallback(async (tripId: string, backup: unknown): Promise<boolean> => {
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
      const { data } = await restoreTripCallable({ tripId, backup })

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
    isSaving, saveBankDetails, saveItinerary, saveTripName, saveTripStatus, createTrip,
    deleteTrip, removeMember, setMemberRole, exportBackup, restoreTrip: restoreTripFn,
    createInvite, revokeInvite, linkTravelerAccount,
  }
}
