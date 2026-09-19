import { useState, useMemo } from 'react'
import type { User } from 'firebase/auth'
import type { ToastMessage } from '../types'
import {
  useTripConfig, useOrganizerBankDetails, useMyTripRole, useTripAdminActions,
  useAllTrips, useMyTrips, useTripStats,
} from './index'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID } from '../utils/tripId'
import { acceptsExpenses, closedTripNotice } from '../utils/tripStatus'

// ─── الرحلة: أيّ رحلة، ومن يديرها؟ ─────────────────────────────────────────────
//
// ثانية المجموعات الثلاث في useAppCoordinator. إعدادات الرحلة المفتوحة حالياً
// ودورها ودورة حياتها وتعديلها، وقائمة «رحلاتي» للتنقّل بين الرحلات. لا تقرأ
// مصروفاً ولا مسافراً — ذلك في useTripWorkspace، الذي يستهلك من هنا نوع الرحلة
// وشهرها ودور المستخدم فيها.

interface UseAppTripArgs {
  user: User | null
  isAdmin: boolean
  hasAccess: boolean
  authLoading: boolean
  joinedTripIds: string[]
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export function useAppTrip({
  user, isAdmin, hasAccess, authLoading, joinedTripIds, showToast, handleFirestoreError,
}: UseAppTripArgs) {
  // 🆕 شاشة «رحلاتي» — تُعرض حين يُفتح التطبيق بلا `?trip=`، أي بلا رحلة مقصودة.
  const [showTripPicker, setShowTripPicker] = useState(false)
  const { trips: myTrips, loading: myTripsLoading, error: myTripsError } = useMyTrips(joinedTripIds, user)

  // organizerUid للبطاقة البنكية، والمسار للويدجت والتقارير. 🆕 tripName وبقية
  // الحقول تُستهلك أيضاً في currentTripSummary أدناه.
  const config = useTripConfig(hasAccess ? user : null)
  const {
    tripName, deleted: tripDeleted, organizerUid, itinerary, itineraryRev, status: tripStatus, statusChangedAt,
    tripType,
  } = config
  // 🆕 قراءة حيّة لبيانات بنك منظّم *هذه* الرحلة — المصدر الوحيد المعروض في
  // BankDetailsCard. organizerUid قد يكون undefined (رحلة قديمة بلا منظّم
  // معروف)، وuseOrganizerBankDetails تتعامل مع ذلك بحالة فارغة فوراً بلا اشتراك.
  const organizerBank = useOrganizerBankDetails(organizerUid)

  // 🆕 المرحلة ٣ — «هل أنا منظّم هذه الرحلة؟» قراءة ذاتية واحدة، لا تُستهلك
  // إلا حين لا يكون المستخدم مسؤولاً عالمياً أصلاً (المسؤول يرى كل شيء بلا هذا).
  const isOrganizer = useMyTripRole(TRIP_ID, !isAdmin && hasAccess ? user : null)

  // 🆕 دورة حياة الرحلة. ⚠️ هذه إخفاء وتفسير فقط — الحماية الحقيقية في
  // firestore.rules (tripAcceptsExpenses/tripAcceptsWrites). الغرض ألا يضغط
  // المستخدم زراً سترفضه القواعد بخطأ صلاحيات غامض.
  const canAddExpenses = acceptsExpenses(tripStatus)
  const tripClosedNotice = closedTripNotice(tripStatus)

  // إدارة الرحلات — لا نشترك في قائمة الرحلات إلا للمسؤول: استعلام القائمة على
  // trips/ يرضيه isAdmin() وحده، فطلبه لعضو عادي مجرّد خطأ صلاحيات في الكونسول.
  const { trips, loading: tripsLoading, error: tripsError } = useAllTrips(isAdmin)

  // منظّم لا يستطيع استعلام trips/ (isAdmin() وحده يرضيه)، فبدل ذلك نبني
  // ملخّص رحلته الوحيدة من useTripConfig — وهو أصلاً حيّ (onSnapshot) ومسموح
  // له بقراءته (isMember). 🆕 يُستهلك الآن من قِبل المسؤول أيضاً — كلاهما يعدّل
  // فقط عبر اسم الرحلة في الهيدر (Header.tsx)، أي الرحلة المفتوحة حالياً حصراً
  // (انظر tripEdit أدناه وcomponents/modals/EditTripModal.tsx).
  const organizerTripId = isOrganizer ? TRIP_ID : null
  const currentTripSummary = useMemo(() => ({
    id: TRIP_ID,
    name: tripName ?? TRIP_ID,
    organizerUid,
    itinerary: itinerary ?? [],
    itineraryRev,
    status: tripStatus,
    statusChangedAt,
    tripType,
  }), [tripName, organizerUid, itinerary, itineraryRev, tripStatus, statusChangedAt, tripType])

  const tripAdmin = useTripAdminActions({ isAdmin, organizerTripId, showToast, handleFirestoreError })

  // ─── شاشة «رحلاتي» ────────────────────────────────────────────────────────
  // 🆕 المسؤول يرى كل الرحلات (استعلام القائمة يرضيه isAdmin وحده)، والعضو
  // العادي يرى ما انضم له فقط. بدون هذا التفريق كانت الشاشة تختفي عن المسؤول
  // تماماً: هو يتجاوز رمز الرحلة أصلاً فقد لا يملك خريطة trips في توكنه إطلاقاً.
  //
  // 🆕 المؤرشفة تُطوى في قسم منفصل قابل للفتح — نمط «الدردشات المؤرشفة» في
  // واتساب: لا تختفي نهائياً (كانت كذلك سابقاً، فلا سبيل للوصول لرحلة مؤرشفة
  // لا تملك رابطها المباشر) ولا تزدحم مع القائمة النشطة يومياً. تبقى الرحلة
  // المفتوحة حالياً في القائمة الرئيسية دائماً ولو كانت مؤرشفة، وإلا اختفت من
  // تحت المستخدم بينما هو داخلها.
  //
  // ⚠️ للتنقّل المحض فقط (فتح/إنشاء/استعادة) — لا تعديل من هنا. تعديل أي رحلة
  // يمرّ عبر اسمها في الهيدر بعد فتحها (انظر tripEdit أدناه).
  const pickerAllTrips = useMemo(
    () => (isAdmin
      ? trips.map(t => ({ id: t.id, name: t.name, status: t.status }))
      : myTrips),
    [isAdmin, trips, myTrips],
  )
  const pickerTrips = useMemo(
    () => pickerAllTrips.filter(t => t.status !== 'archived' || t.id === TRIP_ID),
    [pickerAllTrips],
  )
  const archivedTrips = useMemo(
    () => pickerAllTrips.filter(t => t.status === 'archived' && t.id !== TRIP_ID),
    [pickerAllTrips],
  )
  const pickerLoading = isAdmin ? tripsLoading : myTripsLoading
  const pickerError   = isAdmin ? tripsError   : myTripsError

  // 🆕 رقما البطاقة — عدد المسافرين وإجمالي المصروف، ولا ثالث لهما (انظر
  // useTripStats.ts وTripPicker.tsx). يُجلبان لكل ما تعرضه الشاشة فعلاً، بما
  // فيه المؤرشف: قائمة المؤرشف مطويّة لكنها قصيرة، وتأجيل جلبها حتى فتحها
  // يوفّر أقل بكثير مما يكلّفه تسريب حالة الطيّ من TripPicker إلى هنا.
  //
  // ⚠️ المسؤول يرى كل رحلات النظام (useAllTrips)، فعدد الاستعلامات هنا ينمو
  // بعددها. مقبول لأن البطاقات نفسها تُرسم كلها أصلاً، ولأن التجميع خادمي لا
  // يقرأ المستندات — لكنه الموضع الذي يستحقّ النظر أولاً إن كبر عدد الرحلات.
  const pickerStatIds = useMemo(
    () => [...pickerTrips, ...archivedTrips].map(t => t.id),
    [pickerTrips, archivedTrips],
  )
  const tripStats = useTripStats(pickerStatIds, user)

  // تُعرض حين فُتح التطبيق بلا `?trip=` — أي بلا رحلة مقصودة — أو حين طلبها
  // المستخدم صراحةً من الهيدر. اختيار رحلة ينقل إلى `?trip=X` فيصبح المعرّف
  // صريحاً ولا تظهر الشاشة مجدداً.
  //
  // ⚠️ لا نشترط عضوية الرحلة الافتراضية هنا: كان ذلك يخفي الشاشة عن كل عضو في
  // الرحلة الافتراضية (وهم الأغلبية)، فلا يراها أحد عملياً — القاعدة ١٧.
  //
  // 🆕 ولا نشترط pickerTrips.length > 0 بعد الآن: قبل الإنشاء الذاتي كانت
  // شاشة فارغة عديمة الفائدة لعضو بلا أي رحلة (0 عناصر، لا فعل ممكن)، فسقط
  // للمسار الأعمّ (NotAMemberScreen). أما الآن فحالتها الفارغة نفسها تحمل زرّ
  // «إنشاء رحلة جديدة» — وهذا بالضبط أول مكان يحتاجه عضو جديد لا رحلة له
  // إطلاقاً، فإخفاؤها عنه بالذات كان يقفل الباب الوحيد الذي فتحته هذه الميزة.
  const isPickerVisible =
    showTripPicker ||
    (!HAS_EXPLICIT_TRIP_ID && !authLoading && !pickerLoading)

  return {
    /** الإعدادات الخام — useTripWorkspace يستهلك منها نوع الرحلة وشهرها ومنظّمها. */
    config,
    isOrganizer,
    organizerBank,
    /** إعدادات الرحلة الحالية ودورة حياتها. */
    // 🆕 `name` مكشوف هنا — الهيدر يعرض اسم الرحلة المفتوحة بدل اسم التطبيق
    // الثابت. القيمة نفسها المستخدَمة في currentTripSummary أعلاه، لا مصدر ثانٍ
    // يمكن أن ينحرف عنه.
    trip: { name: tripName ?? TRIP_ID, deleted: tripDeleted, itinerary, canAddExpenses, tripClosedNotice, tripType },
    /** شاشة «رحلاتي» — تنقّل بحت (فتح/إنشاء/استعادة)، بلا تعديل من القائمة. */
    picker: {
      trips: pickerTrips, archivedTrips, loading: pickerLoading, error: pickerError,
      // 🆕 خريطة الإحصاءات منفصلة عن قائمة الرحلات لأنها تصل بعدها (وقد لا تصل
      // بلا اتصال) — الرحلة الغائبة منها تُرسم بالاسم والحالة وحدهما.
      stats: tripStats,
      isVisible: isPickerVisible,
      show: () => setShowTripPicker(true),
      // 🆕 الإنشاء الذاتي (نموذج واتساب) — أي مستخدم مسجّل دخوله، لا المسؤول
      // فقط. نفس دالة tripAdmin.createTrip المستخدمة في تعديل الرحلة؛ الحدّ
      // الحقيقي (جلسة حقيقية، حدّ زمني) خادمي بالكامل في manageTrip.
      onCreateTrip: tripAdmin.createTrip,
      // 🆕 يظهر معرّف كل رحلة تحت اسمها (المسؤول يتصفّح رحلات لا يعرفها
      // بالاسم فقط)، ويتيح تبويب «استعادة من نسخة احتياطية» عند الإنشاء.
      isAdmin,
      isSaving: tripAdmin.isSaving,
      onRestoreTrip: tripAdmin.restoreTrip,
    },
    /**
     * 🆕 تعديل الرحلة *المفتوحة حالياً* — يُفتح بالضغط على اسمها في الهيدر
     * (Header.tsx)، لا من قائمة «رحلاتي». لتعديل رحلة أخرى يفتحها المستخدم
     * أولاً من «رحلاتي» (المسؤول يرى كل الرحلات هناك ويمكنه الدخول لأيّ منها)
     * ثم يعدّلها من هنا بعد أن تصبح هي المفتوحة. انظر docs/DECISIONS.md.
     */
    tripEdit: {
      canEdit: isAdmin || isOrganizer,
      trip: currentTripSummary,
      viewerRole: isAdmin ? 'admin' as const : 'organizer' as const,
      isSaving: tripAdmin.isSaving,
      onSaveTripName: tripAdmin.saveTripName,
      onSaveItinerary: tripAdmin.saveItinerary,
      onSaveTripStatus: tripAdmin.saveTripStatus,
      onSaveTripType: tripAdmin.saveTripType,
      onDeleteTrip: tripAdmin.deleteTrip,
      onRemoveMember: tripAdmin.removeMember,
      onSetMemberRole: tripAdmin.setMemberRole,
      onLinkTravelerAccount: tripAdmin.linkTravelerAccount,
      onExportBackup: tripAdmin.exportBackup,
      onCreateInvite: tripAdmin.createInvite,
      onRevokeInvite: tripAdmin.revokeInvite,
    },
  }
}
