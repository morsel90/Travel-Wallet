// 🆕 حالة المودالات موحّدة في reducer واحد (activeModal) — استُخرجت من App.tsx.
// الفكرة: بدل عدّة حالات boolean/nullable متناثرة لكل مودال، نمثّل «المودال المفتوح حالياً»
// بنوع اتحاد مميّز (discriminated union). هذا يضمن فتح مودال واحد فقط في كل مرة،
// ويجمّع منطق الفتح/الإغلاق في مكان واحد، ويمهّد لاستخراج مكوّن ModalManager لاحقاً.
//
// ملاحظة نطاق: تسجيل دخول المسؤول يبقى ضمن useAdminAuth لأن حالته مرتبطة بنطاقه؛
// هذا الـ hook يوحّد بقية المودالات.
//
// 🆕 **ثلاث حالات غادرت هذا الاتحاد ولم تُستبدل بأخرى** — وهي أهمّ ما يُقرأ هنا:
//   • `deleteTraveler` — نافذة تأكيد حُذفت: الحذف ليّن ويحمل تنبيهُه «تراجع»،
//     والمسافر يبقى في سلة المهملات. انظر `confirmDeleteTraveler`.
//   • `deposit` — «تعديل الرصيد» صار قسماً مضمّناً (inline) داخل ملف المسافر،
//     لا نافذةً تُفتح فوق نافذة. انظر `DepositEditor` في TravelerProfileModal.
//   • `depositHistory` — سجلّ التعديلات كان **نسخة ثانية أضعف** من بيانات
//     معروضة أصلاً: `buildMergedTimeline` يدمج نفس `depositLogs` في كشف الحساب
//     التفصيلي داخل الملف نفسه، وبنفس حارس الصلاحية (isAdmin||isOrganizer||isSelf).
// لا تُعِد أيّاً منها كنافذة مستقلّة قبل قراءة docs/DECISIONS.md.
import { useReducer, useCallback } from 'react'
import type { TravelerBalance } from '../types'

export type ModalState =
  | { type: 'none' }
  | { type: 'reports' }
  | { type: 'trashBin' }
  | { type: 'userProfile' } // 🆕 بروفايل المستخدم العام (اسم/بنك) — مستقل عن أي رحلة
  /** 🆕 تعديل الرحلة المفتوحة حالياً — يُفتح من اسمها في الهيدر أو من «المزيد». */
  | { type: 'editTrip' }
  // 🆕 ثلاثة أقسام كانت في تدفّق الشاشة الرئيسية وانتقلت خلف زرّ «المزيد»
  // (MoreMenu) — الشاشة صارت المصاريف/الأرصدة/المسافرون لا أكثر. كونها في
  // هذا الاتحاد يعني أن فتح أيّها يُغلق ما قبله تلقائياً بلا شرط إضافي.
  | { type: 'charts' }
  | { type: 'itinerary' }
  | { type: 'longTermPanel' }
  // 🆕 الرحلات طويلة المدى — لا تُفتح إطلاقاً في رحلة قياسية (App.tsx لا يعرض
  // القسم الذي يفتحهما أصلاً). التسجيل هنا لأن القاعدة ٧ تفرض أن كل مودال عام
  // يعيش في هذا الاتحاد لا في حالة منفصلة تسمح بمودالين مفتوحين معاً.
  | { type: 'monthlyRollover' }
  | { type: 'exitTraveler'; traveler: TravelerBalance }

type ModalAction =
  | { type: 'OPEN_REPORTS' }
  | { type: 'OPEN_TRASH_BIN' }
  | { type: 'OPEN_USER_PROFILE' }
  | { type: 'OPEN_EDIT_TRIP' }
  | { type: 'OPEN_CHARTS' }
  | { type: 'OPEN_ITINERARY' }
  | { type: 'OPEN_LONG_TERM_PANEL' }
  | { type: 'OPEN_MONTHLY_ROLLOVER' }
  | { type: 'OPEN_EXIT_TRAVELER';    traveler: TravelerBalance }
  | { type: 'CLOSE' }

const CLOSED: ModalState = { type: 'none' }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_REPORTS':         return { type: 'reports' }
    case 'OPEN_TRASH_BIN':       return { type: 'trashBin' }
    case 'OPEN_USER_PROFILE':    return { type: 'userProfile' }
    case 'OPEN_EDIT_TRIP':       return { type: 'editTrip' }
    case 'OPEN_CHARTS':          return { type: 'charts' }
    case 'OPEN_ITINERARY':       return { type: 'itinerary' }
    case 'OPEN_LONG_TERM_PANEL': return { type: 'longTermPanel' }
    case 'OPEN_MONTHLY_ROLLOVER': return { type: 'monthlyRollover' }
    case 'OPEN_EXIT_TRAVELER':   return { type: 'exitTraveler', traveler: action.traveler }
    case 'CLOSE':                return CLOSED
    default:                     return state
  }
}

export function useModals() {
  const [modal, dispatch] = useReducer(modalReducer, CLOSED)

  const openReports        = useCallback(() => dispatch({ type: 'OPEN_REPORTS' }), [])
  const openTrashBin       = useCallback(() => dispatch({ type: 'OPEN_TRASH_BIN' }), [])
  const openUserProfile    = useCallback(() => dispatch({ type: 'OPEN_USER_PROFILE' }), [])
  const openEditTrip       = useCallback(() => dispatch({ type: 'OPEN_EDIT_TRIP' }), [])
  const openCharts         = useCallback(() => dispatch({ type: 'OPEN_CHARTS' }), [])
  const openItinerary      = useCallback(() => dispatch({ type: 'OPEN_ITINERARY' }), [])
  const openLongTermPanel  = useCallback(() => dispatch({ type: 'OPEN_LONG_TERM_PANEL' }), [])
  const openMonthlyRollover = useCallback(() => dispatch({ type: 'OPEN_MONTHLY_ROLLOVER' }), [])
  const openExitTraveler   = useCallback((traveler: TravelerBalance) => dispatch({ type: 'OPEN_EXIT_TRAVELER', traveler }), [])
  const closeModal         = useCallback(() => dispatch({ type: 'CLOSE' }), [])

  return {
    modal,
    openReports,
    openTrashBin,
    openUserProfile,
    openEditTrip,
    openCharts,
    openItinerary,
    openLongTermPanel,
    openMonthlyRollover,
    openExitTraveler,
    closeModal,
  }
}
