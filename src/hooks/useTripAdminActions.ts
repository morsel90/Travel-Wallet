// 🆕 عمليات الكتابة الخاصة بواجهة إدارة الرحلات.
//
// مساران مختلفان عمداً بحسب طبيعة العملية:
//
// 1. البيانات غير السرّية (الاسم/المسار/الحالة) → كتابة مباشرة على
//    trips/{tripId} عبر قواعد Firestore (isValidTripConfig). أخفّ وأسرع، ولا
//    تحتاج نشر دوال عند كل تعديل. القاعدة تشترط isAdmin() فقط ولا تشير للرحلة
//    النشطة، فالمسؤول يعدّل أي رحلة دون مغادرة الرحلة المفتوحة.
//
// 2. كل ما يحتاج Admin SDK (إنشاء/حذف رحلة، الأعضاء، الدعوات، ربط الحسابات،
//    الاستعادة) → دالة سحابية عبر `call` أدناه. انظر functions/index.js لسبب
//    احتياج كل واحدة منها للخادم.
//
// ⚠️ كل كتابات المسار الأول تستخدم setDoc(..., { merge: true }):
//   - الكتابة الكاملة بلا merge تمسح الحقول غير المذكورة — وهذه مصيدة
//     scripts/create-trip.mjs، الذي يستدعي .set() بكائن بلا itinerary فيمحو
//     مسار الرحلة عند تحديث الاسم وحده.
//   - merge يُنشئ المستند إن لم يكن موجوداً.
//
// 🆕 لا bankDetails هنا بعد اليوم — بيانات البنك مصدرها الوحيد بروفايل المنظّم
// (users/{organizerUid})، تُقرأ حيّة عبر useOrganizerBankDetails، لا تُكتب على
// مستند الرحلة إطلاقاً. انظر docs/DECISIONS.md.
import { useState, useCallback } from 'react'
import * as Sentry from '@sentry/react'
import { setDoc, getDoc } from 'firebase/firestore'
import { auth } from '../firebase'
import { tripDocById } from '../firestore'
import { haptic } from '../utils/haptics'
import { MAX_SEGMENTS, deriveTripType, normalizeItineraryRev } from '../utils/itinerary'
import { currentPeriodKey } from '../utils/period'
import { downloadTripBackup, BackupNotPortableError } from '../utils/backup'
import { TRIP_STATUS_LABEL } from '../types'
import type { ItinerarySegment, ToastMessage, TripStatus, TripType } from '../types'
import type { TripSummary } from './useAllTrips'
import { callableMessage } from '../utils/callableErrors'
import { readTripBackup } from './readTripBackup'
import { callable, type CallableName, type CallableRequest, type CallableResponse } from './callables'

// 🆕 نصّا الرفض المحلي — مختلفان عمداً (القاعدة ٢٤): الأول لما يملكه المنظّم في
// رحلته لكن ليس في هذه، والثاني لما ليس من صلاحيات المنظّم أصلاً.
const ORGANIZER_ONLY = 'هذا الإجراء متاح لمنظّم الرحلة فقط.'
const NOT_ORGANIZER_POWER = 'هذا الإجراء ليس من صلاحيات منظّم الرحلة.'

/** توست بمدّته الاختيارية — يُمرَّر لـ showToast كما هو. */
type ToastArgs = [ToastMessage] | [ToastMessage, number]

interface CallOptions<Res> {
  /** فحص واجهة فقط — false يرفض محلياً بـ deniedText بلا استدعاء. */
  allowed: boolean
  deniedText: string
  /** توست النجاح من ردّ الخادم، أو null: لا توست ولا اهتزاز (المستدعي يُعلن النتيجة). */
  onSuccess: (data: Res) => ToastArgs | null
  /** مدّة توست رسالة رفض الخادم — 4000 افتراضياً. */
  errorMs?: number
  /** تجديد ثانٍ للتوكن بعد النجاح — لـ claim مُنح داخل الاستدعاء نفسه. */
  refreshTokenAfter?: boolean
}

interface UseTripAdminActionsParams {
  isAdmin: boolean
  /**
   * معرّف الرحلة التي يملك فيها المستخدم الحالي دور «منظّم»، أو null. التعديل
   * كله (لغير المسؤول) يمرّ الآن عبر اسم الرحلة في الهيدر — أي عبر الرحلة
   * المفتوحة حالياً حصراً، فلا حاجة لأكثر من معرّف واحد (انظر useAppCoordinator.ts
   * وcomponents/modals/EditTripModal.tsx).
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
  saveItinerary: (tripId: string, itinerary: ItinerarySegment[], currentType: TripType, baseRev: number) => Promise<boolean>
  saveTripName: (tripId: string, name: string) => Promise<boolean>
  /** 🆕 تغيير حالة دورة حياة الرحلة — القواعد تفرض أثرها، هذا يكتب الحقل فقط. */
  saveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  /**
   * 🆕 تخفيض يدوي صريح من long_term إلى standard — الاتجاه الوحيد الذي
   * تبقّى بعد أن صار الترقّي تلقائياً في saveItinerary (انظر deriveTripType).
   * لا يلمس currentPeriod/lastClosedPeriod: التخفيض يُخفي واجهة «الشهر
   * المحاسبي» فقط، ولا يُلغي أثر أي شهر أُغلق فعلياً — انظر docs/DECISIONS.md.
   */
  saveTripType: (tripId: string, type: TripType) => Promise<boolean>
  /** 🆕 متاحة لأي حساب حقيقي مسجّل دخوله، لا المسؤول فقط — من ينشئ يصبح منظّم رحلته. */
  createTrip: (tripId: string, name: string) => Promise<boolean>
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

  // المسؤول يتصرّف على أي رحلة، والمنظّم على رحلته وحدها — بالضبط نفس الحدّ
  // الذي تفرضه firestore.rules (isAdmin() || isOrganizer(tripId)). هذا فحص
  // واجهة فقط (انظر تعليق organizerTripId في الأعلى)، وليس مصدر الحماية.
  const canAct = useCallback(
    (tripId: string) => isAdmin || tripId === organizerTripId,
    [isAdmin, organizerTripId],
  )

  // كل مسارات الكتابة المباشرة تمرّ من هنا: فحص الصلاحية، علم الحفظ، رسالة
  // النجاح، ومعالجة الخطأ — بدل تكرار الأربعة في كل دالة.
  /**
   * @param explainDenial 🆕 يُستدعى عند `permission-denied` وحده ليُنتج رسالة
   * أدقّ من «هذا الإجراء متاح للمسؤول أو المنظّم». الرفض هنا ليس دائماً نقص
   * صلاحية: القفل التفاؤلي على المسار يرفض بنفس الكود حين يسبقك غيرُك بحفظ
   * (انظر itineraryRevIsBumped في firestore.rules). قراءة إضافية واحدة على
   * مسار نادر تُميّز الحالتين بدل تضليل المستخدم بأنه لا يملك الصلاحية.
   */
  const write = useCallback(async (
    tripId: string,
    payload: Record<string, unknown>,
    successText: string,
    errorFallback: string,
    explainDenial?: () => Promise<string | null>,
  ): Promise<boolean> => {
    if (!canAct(tripId)) {
      showToast({ text: ORGANIZER_ONLY, type: 'error' }, 3000)
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
      const denialText = explainDenial ? await explainDenial().catch(() => null) : null
      if (denialText) showToast({ text: denialText, type: 'error' }, 6000)
      else handleFirestoreError(err, errorFallback)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [canAct, showToast, handleFirestoreError])

  // 🆕 تحويل الرحلة إلى طويلة المدى لم يعد يحتاج سكربت set-trip-type.mjs
  // يدوياً — يُشتَقّ تلقائياً من مدّة المسار نفسه عند حفظه (انظر deriveTripType
  // في utils/itinerary.ts). اتجاه واحد فقط (standard→long_term)، فلا حاجة
  // لأي تأكيد إضافي من المستخدم.
  /**
   * @param baseRev 🆕 نسخة المسار التي فتح عليها المحرّر — تُرسَل +1، وتفرض
   * firestore.rules أن يكون ذلك مساوياً لـ(الحالي + 1) بالضبط. فإن حفظ غيرُه
   * بينهما رُفضت الكتابة بدل أن تمحو عمله بصمت. انظر itineraryRevIsBumped هناك.
   */
  const saveItinerary = useCallback(async (
    tripId: string, itinerary: ItinerarySegment[], currentType: TripType, baseRev: number,
  ): Promise<boolean> => {
    // نفس الحدّ المفروض في firestore.rules — نكشفه برسالة مفهومة بدل ترك
    // القواعد ترفض الكتابة بخطأ صلاحيات غامض.
    if (itinerary.length > MAX_SEGMENTS) {
      showToast({ text: `الحد الأقصى ${MAX_SEGMENTS} مقطعاً في المسار.`, type: 'error' }, 3000)
      return false
    }

    const nextType = deriveTripType(currentType, itinerary)
    const payload: Record<string, unknown> = { itinerary, itineraryRev: baseRev + 1 }

    if (nextType !== currentType) {
      payload.tripType = nextType
      // 🆕 نفس منطق set-trip-type.mjs بالضبط: لا نلمس currentPeriod إن كان
      // مضبوطاً أصلاً (رحلة أُعيدت إلى standard يدوياً بعد إغلاق شهور فعلياً،
      // ثم رقّاها المسار تلقائياً مجدداً) — قراءة إضافية هنا فقط عند الترقية
      // الفعلية (نادرة)، لا عند كل حفظ مسار.
      const snap = await getDoc(tripDocById(tripId))
      if (!(snap.exists() && typeof snap.data().currentPeriod === 'string')) {
        payload.currentPeriod = currentPeriodKey()
      }
    }

    return write(
      tripId,
      payload,
      nextType !== currentType
        ? 'تم حفظ مسار الرحلة — وتحويلها تلقائياً إلى «طويلة المدى» لتجاوز مدّتها 14 يوماً'
        : 'تم حفظ مسار الرحلة',
      'تعذّر حفظ مسار الرحلة.',
      // 🆕 تمييز التعارض عن نقص الصلاحية: كلاهما permission-denied. النسخة على
      // الخادم تجاوزت ما فتحنا عليه ⇒ حفظ غيرُنا بيننا. ولا حاجة لطلب إعادة
      // التحميل: رفض الخادم يُسقط التعديل المحلي ويُطلق onSnapshot بلقطة
      // مصحّحة (انظر utils/writeErrors.ts)، فالمحرّر يستقبل الأحدث من تلقائه.
      async () => {
        const snap = await getDoc(tripDocById(tripId))
        const serverRev = normalizeItineraryRev(snap.data()?.itineraryRev)
        return serverRev === baseRev
          ? null
          : 'لم يُحفظ: عدّل أحدهم مسار الرحلة قبلك من جهاز آخر. ظهرت لك نسخته الأحدث الآن — راجعها ثم أعد تعديلك فوقها.'
      },
    )
  }, [write, showToast])

  const saveTripName = useCallback((tripId: string, name: string) => write(
    tripId,
    { name: name.trim() },
    'تم حفظ اسم الرحلة',
    'تعذّر حفظ اسم الرحلة.',
  ), [write])

  // 🆕 statusChangedAt يُكتب مع status في نفس الطلب دائماً — لا تعديل منفصل.
  // هذا ما يمنح رحلة أُرشفت يدوياً هنا نفس بداية عدّاد الأهلية للحذف النهائي
  // (المرحلة ٢، لاحقاً) التي تحصل عليها رحلة انتقلت تلقائياً عبر
  // advanceTripLifecycle في functions/index.js.
  const saveTripStatus = useCallback((tripId: string, status: TripStatus) => write(
    tripId,
    { status, statusChangedAt: Date.now() },
    `تم تغيير حالة الرحلة إلى «${TRIP_STATUS_LABEL[status]}»`,
    'تعذّر تغيير حالة الرحلة.',
  ), [write])

  const saveTripType = useCallback((tripId: string, type: TripType) => write(
    tripId,
    { tripType: type },
    type === 'standard' ? 'تم تحويل الرحلة إلى قياسية' : 'تم تحويل الرحلة إلى طويلة المدى',
    'تعذّر تغيير نوع الرحلة.',
  ), [write])

  // ── المسار الخادمي (الدوال السحابية) ──────────────────────────────────────
  // 🆕 عبر httpsCallable لا fetch على `/api/...`. الرابط يُشتق من معرّف المشروع
  // في إعداد التطبيق، فتتبع الدالة أي بيئة يشير إليها البناء — وهو ما كان
  // مستحيلاً مع إعادة التوجيه في vercel.json (رابط مكتوب حرفياً لا يقرأ
  // متغيرات البيئة). انظر التعليق الأوسع في hooks/useAuth.ts.
  //
  // 🆕 كل استدعاء لدالة سحابية يمرّ من هنا — نظير `write` للمسار المباشر. كانت
  // هذه الكتلة مكرّرة سبع مرات بنصّها، والفروق الحقيقية بين الدوال (من يُرفض
  // محلياً، نصّ النجاح ومدّته، مدّة توست الخطأ) صارت خيارات مسمّاة بدل أن
  // تُلتقط بمقارنة سبع نسخ. عقد كل فرق منها مثبّت في useTripAdminActions.test.ts.
  //
  // تُعيد `{ data }` عند النجاح أو null عند أي فشل (رفض محلي، رفض الخادم، شبكة)
  // — والتوست في كل حالات الفشل مسؤوليتها هي، لا المستدعي.
  const call = useCallback(async <N extends CallableName>(
    name: N,
    request: CallableRequest<N>,
    opts: CallOptions<CallableResponse<N>>,
  ): Promise<{ data: CallableResponse<N> } | null> => {
    // فحص واجهة فقط — الحدّ الحقيقي خادمي بالكامل في كل دالة.
    if (!opts.allowed) {
      showToast({ text: opts.deniedText, type: 'error' }, 3000)
      return null
    }

    setIsSaving(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      // تحديث التوكن ليحمل الـ claims الحالية — الدالة تعيد فحصها خادمياً.
      await user.getIdToken(true)

      const { data } = await callable(name)(request)

      if (opts.refreshTokenAfter) await user.getIdToken(true)

      const toast = opts.onSuccess(data)
      if (toast) {
        haptic.success()
        const [msg, durationMs] = toast
        // بلا مدّة ⇒ بلا وسيط ثانٍ إطلاقاً، فتأخذ showToast افتراضيّها كما كانت.
        if (durationMs === undefined) showToast(msg)
        else showToast(msg, durationMs)
      }
      return { data }
    } catch (err) {
      haptic.error()
      // الدوال ترسل رسائل عربية مفهومة (معرّف مكرر، رحلة غير فارغة، مسافر
      // مربوط بالفعل…) وتصل في message ضمن FunctionsError — نعرضها كما هي.
      const message = callableMessage(err)
      if (message) showToast({ text: message, type: 'error' }, opts.errorMs ?? 4000)
      else handleFirestoreError(err, 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.')
      return null
    } finally {
      setIsSaving(false)
    }
  }, [showToast, handleFirestoreError])

  // 🆕 الحذف يبقى للمسؤول فقط — نفس الحدّ المفروض خادمياً في manageTrip.
  // الإنشاء متاح لأي حساب حقيقي مسجّل دخوله (نموذج واتساب)، والحدّ الحقيقي
  // (جلسة غير مجهولة، حدّ زمني) خادمي بالكامل.
  const createTrip = useCallback(async (tripId: string, name: string) =>
    (await call('manageTrip', { mode: 'create', tripId, name }, {
      allowed: true,
      deniedText: NOT_ORGANIZER_POWER,
      // 🆕 الإنشاء الذاتي (غير المسؤول) يمنح المُنشئ claim عضوية *جديداً* داخل
      // manageTrip نفسها — لم يكن موجوداً في التوكن المُحدَّث قبل الاستدعاء لأنه
      // لم يُمنح بعد وقتها. بلا هذا التحديث الثاني، التوجيه الفوري لصفحة الرحلة
      // (openTrip في TripPicker.tsx) يُحمَّل بتوكن لا يحمل العضوية بعد فيفشل
      // isMember() — نفس المشكلة ونفس الحل اللذين تعالجهما useInviteJoin.ts
      // بعد joinViaInvite بالضبط.
      refreshTokenAfter: !isAdmin,
      onSuccess: () => [{ text: `تم إنشاء الرحلة "${tripId}"`, type: 'success' }],
    })) !== null, [call, isAdmin])

  // الاسم فارغ: الحذف لا يحتاجه، والدالة الخادمية لا تفرضه في هذا الوضع.
  // ورسالة «الرحلة ليست فارغة» تأتي من الخادم وتُعرض كما هي (انظر call).
  // 🆕 المسؤول أو منشئ الرحلة (organizerUid) — هذا الحارس يسمح لمنظّم الرحلة
  // عموماً، والتمييز بين المنشئ والمساعد خادمي في manageTrip (والواجهة لا تعرض
  // القسم إلا للمنشئ — TripDetailPanel).
  const deleteTrip = useCallback(async (tripId: string) =>
    (await call('manageTrip', { mode: 'delete', tripId, name: '' }, {
      allowed: canAct(tripId),
      deniedText: NOT_ORGANIZER_POWER,
      onSuccess: () => [{ text: `تم حذف الرحلة "${tripId}"`, type: 'success' }],
    })) !== null, [call, canAct])

  // 🆕 إزالة عضو — رسالة نجاحها مشروطة بما أعادته الدالة، لا نصاً ثابتاً.
  // 🆕 المرحلة ٣: متاحة للمسؤول أو منظّم هذه الرحلة تحديداً — الفحص الحقيقي
  // (منظّم لا يزيل مسؤولاً ولا منظّماً آخر) يبقى خادمياً بالكامل في manageMember.
  const removeMember = useCallback(async (tripId: string, uid: string) =>
    (await call('manageMember', { mode: 'remove', tripId, uid }, {
      allowed: canAct(tripId),
      deniedText: ORGANIZER_ONLY,
      // ⚠️ الرسالة تقول الحقيقة كاملةً بدل «تمت الإزالة» المطمئنة:
      //
      //   • المسؤول لا يستمد وصوله من عضوية الرحلة بل من claim عالمي، فإزالته
      //     منها لا تحجب عنه شيئاً — وإخفاء ذلك يوهم بأن الإجراء فعل ما لم يفعله.
      //   • ومن أُزيل فعلاً يحتفظ بوصوله حتى ساعة: التوكن صالح ٦٠ دقيقة و
      //     firestore.rules تقرأ العضوية منه. هذا ثمن كون isMember() مجانية،
      //     ولا يجوز أن يكتشفه المسؤول بنفسه بعد أن يظنّ الباب أُغلق.
      onSuccess: data => {
        if (data.stillHasAccess) {
          return [{ text: 'أُزيل من قائمة الرحلة، لكن صلاحيته عامة ولا تمرّ بهذه الرحلة.', type: 'success' }, 6000]
        }
        if (!data.claimRemoved) {
          return [{ text: 'لم يكن منضمّاً فعلياً — نُظِّف سطره من القائمة.', type: 'success' }, 4000]
        }
        return [{ text: 'تمت الإزالة. قد يبقى وصوله فعّالاً حتى ساعة حتى تنتهي صلاحية جلسته.', type: 'success' }, 6000]
      },
    })) !== null, [call, canAct])

  // 🆕 تعيين/إلغاء دور المنظّم — المسؤول ينقل الملكية، ومنظّم الرحلة يعيّن
  // «منظّماً مساعداً» (organizerUid لا يتغيّر). الحدود خادمية في manageMember.
  const setMemberRole = useCallback(async (tripId: string, uid: string, role: 'organizer' | 'member') =>
    (await call('manageMember', { mode: 'setRole', tripId, uid, role }, {
      allowed: canAct(tripId),
      deniedText: ORGANIZER_ONLY,
      onSuccess: () => [{
        text: role === 'organizer'
          ? (isAdmin ? 'صار هذا المسافر منظّماً لهذه الرحلة.' : 'صار هذا المسافر منظّماً مساعداً.')
          : 'أُلغي دور المنظّم عن هذا المسافر.',
        type: 'success',
      }],
    })) !== null, [call, isAdmin, canAct])

  // 🆕 رابط دعوة — createInvite يُعيد توكناً يستهلكه المستدعي فوراً (بناء رابط
  // المشاركة)، فلا توست ولا اهتزاز عند نجاحه: المستدعي هو من يُعلن النتيجة.
  const createInvite = useCallback(async (tripId: string) =>
    (await call('manageInvite', { mode: 'create', tripId }, {
      allowed: canAct(tripId),
      deniedText: ORGANIZER_ONLY,
      onSuccess: () => null,
    }))?.data.token ?? null, [call, canAct])

  const revokeInvite = useCallback(async (tripId: string) =>
    (await call('manageInvite', { mode: 'revoke', tripId }, {
      allowed: canAct(tripId),
      deniedText: ORGANIZER_ONLY,
      onSuccess: () => [{ text: 'تم إبطال رابط الدعوة.', type: 'success' }],
    })) !== null, [call, canAct])

  // 🆕 ربط مسافر شبح بحساب — رسالة الخطأ الأشيع (مسافر مربوط بالفعل، أو
  // الحساب مربوط بمسافر آخر) خادمية بالكامل وتُعرض كما هي.
  const linkTravelerAccount = useCallback(async (tripId: string, travelerId: number, targetUid: string) =>
    (await call(
      'linkTravelerAccount', { tripId, travelerId, targetUid }, {
        allowed: canAct(tripId),
        deniedText: ORGANIZER_ONLY,
        onSuccess: () => [{ text: 'تم ربط المسافر بحسابه.', type: 'success' }],
      },
    )) !== null, [call, canAct])

  // 🆕 تنزيل نسخة احتياطية — قراءة فقط، بلا مسار كتابة جديد ولا دالة سحابية.
  // القراءة والتجميع في readTripBackup.ts؛ هنا الصلاحية والرسائل وحدها.
  const exportBackup = useCallback(async (trip: TripSummary): Promise<boolean> => {
    if (!isAdmin) {
      showToast({ text: NOT_ORGANIZER_POWER, type: 'error' }, 3000)
      return false
    }

    setIsSaving(true)
    try {
      const backup = await readTripBackup(trip)
      downloadTripBackup(backup)

      haptic.success()
      showToast({
        text: `تم تنزيل نسخة احتياطية لـ"${trip.name}" — ${backup.travelers.length} مسافراً و${backup.expenses.length} مصروفاً.`,
        type: 'success',
      }, 4000)
      return true
    } catch (err) {
      haptic.error()
      // 🆕 خطأ بيانات لا خطأ Firestore: handleFirestoreError لا يجد له code
      // فيعرض نصاً عاماً بلا موضع. المسار هو ما يحتاجه من سيصلح المستند.
      if (err instanceof BackupNotPortableError) {
        Sentry.captureException(err, { tags: { source: 'backup-export' }, extra: { tripId: trip.id } })
        showToast({
          text: `لم تُنزَّل النسخة: في "${trip.name}" قيمة لن تُستعاد كما هي عند ${err.path}.`,
          type: 'error',
        }, 8000)
        return false
      }
      handleFirestoreError(err, 'تعذّر تنزيل النسخة الاحتياطية.')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isAdmin, showToast, handleFirestoreError])

  // 🆕 استعادة — الخادم يعيد إحصاءً (restored) يستحق إظهاره في رسالة النجاح.
  // كل التحقق الفعلي خادمي — انظر restoreTrip في functions/index.js؛ العميل هنا
  // لا يفحص شكل backup إطلاقاً.
  const restoreTrip = useCallback(async (tripId: string, backup: unknown) =>
    (await call('restoreTrip', { tripId, backup }, {
      allowed: isAdmin,
      deniedText: NOT_ORGANIZER_POWER,
      onSuccess: ({ restored }) => [{
        text: `تمت الاستعادة — ${restored.travelers} مسافراً، ${restored.expenses} مصروفاً، ${restored.depositLogs} سجلّ إيداع.`,
        type: 'success',
      }, 5000],
      // رسائل رفض الاستعادة أطول (بنية نسخة غير صالحة، رحلة غير فارغة…).
      errorMs: 5000,
    })) !== null, [call, isAdmin])

  return {
    isSaving, saveItinerary, saveTripName, saveTripStatus, saveTripType, createTrip,
    deleteTrip, removeMember, setMemberRole, exportBackup, restoreTrip,
    createInvite, revokeInvite, linkTravelerAccount,
  }
}
