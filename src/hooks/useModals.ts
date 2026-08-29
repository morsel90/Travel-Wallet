// 🆕 حالة المودالات موحّدة في reducer واحد (activeModal) — استُخرجت من App.tsx.
// الفكرة: بدل عدّة حالات boolean/nullable متناثرة لكل مودال، نمثّل «المودال المفتوح حالياً»
// بنوع اتحاد مميّز (discriminated union). هذا يضمن فتح مودال واحد فقط في كل مرة،
// ويجمّع منطق الفتح/الإغلاق في مكان واحد، ويمهّد لاستخراج مكوّن ModalManager لاحقاً.
//
// ملاحظة نطاق: تأكيد حذف المصروف يبقى ضمن useExpenseActions، وتسجيل دخول المسؤول ضمن
// useAdminAuth — لأن لكلٍّ منهما حالته الخاصة المرتبطة بنطاقه؛ هذا الـ hook يوحّد بقية المودالات.
import { useReducer, useCallback } from 'react'
import type { Traveler, TravelerBalance } from '../types'

export type ModalState =
  | { type: 'none' }
  | { type: 'reports' }
  | { type: 'trashBin' }
  | { type: 'deleteTraveler';  traveler: Traveler }
  | { type: 'deposit';         traveler: Traveler }
  | { type: 'depositHistory';  traveler: Traveler }
  | { type: 'userProfile' } // 🆕 بروفايل المستخدم العام (اسم/بنك) — مستقل عن أي رحلة
  /** 🆕 تعديل الرحلة المفتوحة حالياً — يُفتح من اسمها في الهيدر. */
  | { type: 'editTrip' }
  // 🆕 الرحلات طويلة المدى — لا تُفتح إطلاقاً في رحلة قياسية (App.tsx لا يعرض
  // القسم الذي يفتحهما أصلاً). التسجيل هنا لأن القاعدة ٧ تفرض أن كل مودال عام
  // يعيش في هذا الاتحاد لا في حالة منفصلة تسمح بمودالين مفتوحين معاً.
  | { type: 'monthlyRollover' }
  | { type: 'exitTraveler'; traveler: TravelerBalance }

type ModalAction =
  | { type: 'OPEN_REPORTS' }
  | { type: 'OPEN_TRASH_BIN' }
  | { type: 'OPEN_DELETE_TRAVELER';  traveler: Traveler }
  | { type: 'OPEN_DEPOSIT';          traveler: Traveler }
  | { type: 'OPEN_DEPOSIT_HISTORY';  traveler: Traveler }
  | { type: 'OPEN_USER_PROFILE' }
  | { type: 'OPEN_EDIT_TRIP' }
  | { type: 'OPEN_MONTHLY_ROLLOVER' }
  | { type: 'OPEN_EXIT_TRAVELER';    traveler: TravelerBalance }
  | { type: 'CLOSE' }

const CLOSED: ModalState = { type: 'none' }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_REPORTS':         return { type: 'reports' }
    case 'OPEN_TRASH_BIN':       return { type: 'trashBin' }
    case 'OPEN_DELETE_TRAVELER': return { type: 'deleteTraveler', traveler: action.traveler }
    case 'OPEN_DEPOSIT':         return { type: 'deposit', traveler: action.traveler }
    case 'OPEN_DEPOSIT_HISTORY': return { type: 'depositHistory', traveler: action.traveler }
    case 'OPEN_USER_PROFILE':    return { type: 'userProfile' }
    case 'OPEN_EDIT_TRIP':       return { type: 'editTrip' }
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
  const openDeleteTraveler = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DELETE_TRAVELER', traveler }), [])
  const openDeposit        = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DEPOSIT', traveler }), [])
  const openDepositHistory = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DEPOSIT_HISTORY', traveler }), [])
  const openUserProfile    = useCallback(() => dispatch({ type: 'OPEN_USER_PROFILE' }), [])
  const openEditTrip       = useCallback(() => dispatch({ type: 'OPEN_EDIT_TRIP' }), [])
  const openMonthlyRollover = useCallback(() => dispatch({ type: 'OPEN_MONTHLY_ROLLOVER' }), [])
  const openExitTraveler   = useCallback((traveler: TravelerBalance) => dispatch({ type: 'OPEN_EXIT_TRAVELER', traveler }), [])
  const closeModal         = useCallback(() => dispatch({ type: 'CLOSE' }), [])

  return {
    modal,
    openReports,
    openTrashBin,
    openDeleteTraveler,
    openDeposit,
    openDepositHistory,
    openUserProfile,
    openEditTrip,
    openMonthlyRollover,
    openExitTraveler,
    closeModal,
  }
}
