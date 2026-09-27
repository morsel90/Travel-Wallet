import { useState, useMemo } from 'react'
import type { User } from 'firebase/auth'
import type { ToastMessage } from '../types'
import {
  useTripConfig, useOrganizerBankDetails, useMyTripRole, useTripAdminActions,
  useAllTrips, useMyTrips, useTripStats,
} from './index'
import { useShareInvite } from './useShareInvite'
import { TRIP_ID, HAS_EXPLICIT_TRIP_ID } from '../utils/tripId'
import { acceptsExpenses, closedTripNotice } from '../utils/tripStatus'

// ─── الرحلة: أيّ رحلة، ومن يديرها؟ ─────────────────────────────────────────────
//
// إعدادات الرحلة المفتوحة ودورها ودورة حياتها وتعديلها، وقائمة «رحلاتي».
// لا مصاريف ولا مسافرين — ذلك في useTripWorkspace.

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
  const [showTripPicker, setShowTripPicker] = useState(false)
  const { trips: myTrips, loading: myTripsLoading, error: myTripsError } = useMyTrips(joinedTripIds, user)

  const config = useTripConfig(hasAccess ? user : null)
  const {
    tripName, deleted: tripDeleted, organizerUid, itinerary, itineraryRev, status: tripStatus, statusChangedAt,
    tripType,
  } = config
  // المصدر الوحيد لـ BankDetailsCard. organizerUid غائب = حالة فارغة بلا اشتراك.
  const organizerBank = useOrganizerBankDetails(organizerUid)

  // للمسؤول لا حاجة لها — يرى كل شيء.
  const isOrganizer = useMyTripRole(TRIP_ID, !isAdmin && hasAccess ? user : null)

  // ⚠️ إخفاء وتفسير فقط — الحماية في firestore.rules.
  const canAddExpenses = acceptsExpenses(tripStatus)
  const tripClosedNotice = closedTripNotice(tripStatus)

  // للمسؤول وحده — استعلام القائمة على trips/ يُرفض لغيره.
  const { trips, loading: tripsLoading, error: tripsError } = useAllTrips(isAdmin)

  // ملخّص الرحلة المفتوحة من useTripConfig (حيّ ومسموح للعضو) — المنظّم لا يستعلم
  // trips/. التعديل للرحلة المفتوحة حصراً، للمنظّم والمسؤول معاً.
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
  // يُعرض حين tripEdit.canEdit فقط (الخادم يقصر manageInvite على المنظّم والمسؤول).
  const invite = useShareInvite({
    tripId: TRIP_ID, tripName: tripName ?? TRIP_ID, onCreateInvite: tripAdmin.createInvite, showToast,
  })

  // ─── شاشة «رحلاتي» ────────────────────────────────────────────────────────
  // المسؤول يرى كل الرحلات (قد لا يملك خريطة trips في توكنه)، والعضو ما انضم له.
  // المؤرشفة مطويّة في قسم منفصل — عدا المفتوحة حالياً، كي لا تختفي من تحته.
  // ⚠️ تنقّل فقط (فتح/إنشاء/استعادة) — التعديل عبر اسم الرحلة في الهيدر.
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

  // يشمل المؤرشف المطويّ: قصير، وتأجيله يسرّب حالة الطيّ من TripPicker إلى هنا.
  // ⚠️ للمسؤول تنمو الاستعلامات بعدد رحلات النظام — أول موضع يُنظر فيه إن كبر.
  const pickerStatIds = useMemo(
    () => [...pickerTrips, ...archivedTrips].map(t => t.id),
    [pickerTrips, archivedTrips],
  )
  const tripStats = useTripStats(pickerStatIds, user)

  // بلا `?trip=` أو بطلب صريح من الهيدر.
  // ⚠️ لا تشترط عضوية الرحلة الافتراضية (يخفيها عن الأغلبية — القاعدة ١٧)، ولا
  // pickerTrips.length > 0 (حالتها الفارغة تحمل «إنشاء رحلة» لعضو جديد).
  const isPickerVisible =
    showTripPicker ||
    (!HAS_EXPLICIT_TRIP_ID && !authLoading && !pickerLoading)

  return {
    /** الإعدادات الخام — useTripWorkspace يستهلك منها نوع الرحلة وشهرها ومنظّمها. */
    config,
    isOrganizer,
    organizerBank,
    /** إعدادات الرحلة الحالية ودورة حياتها. */
    trip: { name: tripName ?? TRIP_ID, deleted: tripDeleted, itinerary, canAddExpenses, tripClosedNotice, tripType },
    /** شاشة «رحلاتي» — تنقّل بحت (فتح/إنشاء/استعادة)، بلا تعديل من القائمة. */
    picker: {
      trips: pickerTrips, archivedTrips, loading: pickerLoading, error: pickerError,
      // منفصلة لأنها تصل بعد القائمة، وقد لا تصل بلا اتصال.
      stats: tripStats,
      isVisible: isPickerVisible,
      show: () => setShowTripPicker(true),
      // لأي مستخدم مسجّل؛ الحدود خادمية في manageTrip.
      onCreateTrip: tripAdmin.createTrip,
      // يتيح تبويب «استعادة من نسخة احتياطية» عند الإنشاء.
      isAdmin,
      isSaving: tripAdmin.isSaving,
      onRestoreTrip: tripAdmin.restoreTrip,
    },
    /** تعديل الرحلة المفتوحة حصراً، من اسمها في الهيدر. رحلة أخرى تُفتح أولاً. */
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
      viewerUid: user?.uid,
      onLinkTravelerAccount: tripAdmin.linkTravelerAccount,
      onExportBackup: tripAdmin.exportBackup,
      onCreateInvite: tripAdmin.createInvite,
      onRevokeInvite: tripAdmin.revokeInvite,
      invite,
    },
  }
}
