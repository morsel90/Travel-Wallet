// 🆕 حالة المودالات موحّدة في reducer واحد (activeModal) — استُخرجت من App.tsx.
// الفكرة: بدل عدّة حالات boolean/nullable متناثرة لكل مودال، نمثّل «المودال المفتوح حالياً»
// بنوع اتحاد مميّز (discriminated union). هذا يضمن فتح مودال واحد فقط في كل مرة،
// ويجمّع منطق الفتح/الإغلاق في مكان واحد، ويمهّد لاستخراج مكوّن ModalManager لاحقاً.
//
// ملاحظة نطاق: لم يعد هناك تدفّق مصادقة ثانٍ يُستثنى هنا — حُذف بالكامل؛
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
//
// 🆕 **وحالتان أخريان بعدها، لنفس السبب: نافذة تُغلق نفسها لتفتح أخرى.**
//   • `monthlyRollover` — تأكيد إغلاق الشهر صار خطوة داخل «هذا الشهر»
//     (LongTermModal)، لا نافذة تحلّ محلّها.
//   • `exitTraveler` — «تسوية وخروج» صار قسماً داخل ملف المسافر
//     (TravelerProfileModal)، كما صار «تعديل الرصيد» قبله.
// ما بقي في الاتحاد وجهاتٌ يفتحها المستخدم عمداً، لا تسليمٌ من نافذة لأخرى.
// لا تُعِد أيّاً منها كنافذة مستقلّة قبل قراءة docs/DECISIONS.md.
import { useReducer, useCallback } from 'react'

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

type ModalAction =
  | { type: 'OPEN_REPORTS' }
  | { type: 'OPEN_TRASH_BIN' }
  | { type: 'OPEN_USER_PROFILE' }
  | { type: 'OPEN_EDIT_TRIP' }
  | { type: 'OPEN_CHARTS' }
  | { type: 'OPEN_ITINERARY' }
  | { type: 'OPEN_LONG_TERM_PANEL' }
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
    closeModal,
  }
}
