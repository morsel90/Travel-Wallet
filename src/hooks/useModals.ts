// 🆕 حالة المودالات موحّدة في reducer واحد (activeModal) — استُخرجت من App.tsx.
// الفكرة: بدل عدّة حالات boolean/nullable متناثرة لكل مودال، نمثّل «المودال المفتوح حالياً»
// بنوع اتحاد مميّز (discriminated union). هذا يضمن فتح مودال واحد فقط في كل مرة،
// ويجمّع منطق الفتح/الإغلاق في مكان واحد، ويمهّد لاستخراج مكوّن ModalManager لاحقاً.
//
// ملاحظة نطاق: تأكيد حذف المصروف يبقى ضمن useExpenseActions، وتسجيل دخول المسؤول ضمن
// useAdminAuth — لأن لكلٍّ منهما حالته الخاصة المرتبطة بنطاقه؛ هذا الـ hook يوحّد بقية المودالات.
import { useReducer, useCallback } from 'react'
import type { Traveler } from '../types'

export type ModalState =
  | { type: 'none' }
  | { type: 'reports' }
  | { type: 'trashBin' }
  | { type: 'tripAdmin' }
  | { type: 'deleteTraveler';  traveler: Traveler }
  | { type: 'deposit';         traveler: Traveler }
  | { type: 'depositHistory';  traveler: Traveler }

type ModalAction =
  | { type: 'OPEN_REPORTS' }
  | { type: 'OPEN_TRASH_BIN' }
  | { type: 'OPEN_TRIP_ADMIN' }
  | { type: 'OPEN_DELETE_TRAVELER';  traveler: Traveler }
  | { type: 'OPEN_DEPOSIT';          traveler: Traveler }
  | { type: 'OPEN_DEPOSIT_HISTORY';  traveler: Traveler }
  | { type: 'CLOSE' }

const CLOSED: ModalState = { type: 'none' }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_REPORTS':         return { type: 'reports' }
    case 'OPEN_TRASH_BIN':       return { type: 'trashBin' }
    case 'OPEN_TRIP_ADMIN':      return { type: 'tripAdmin' }
    case 'OPEN_DELETE_TRAVELER': return { type: 'deleteTraveler', traveler: action.traveler }
    case 'OPEN_DEPOSIT':         return { type: 'deposit', traveler: action.traveler }
    case 'OPEN_DEPOSIT_HISTORY': return { type: 'depositHistory', traveler: action.traveler }
    case 'CLOSE':                return CLOSED
    default:                     return state
  }
}

export function useModals() {
  const [modal, dispatch] = useReducer(modalReducer, CLOSED)

  const openReports        = useCallback(() => dispatch({ type: 'OPEN_REPORTS' }), [])
  const openTrashBin       = useCallback(() => dispatch({ type: 'OPEN_TRASH_BIN' }), [])
  const openTripAdmin      = useCallback(() => dispatch({ type: 'OPEN_TRIP_ADMIN' }), [])
  const openDeleteTraveler = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DELETE_TRAVELER', traveler }), [])
  const openDeposit        = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DEPOSIT', traveler }), [])
  const openDepositHistory = useCallback((traveler: Traveler) => dispatch({ type: 'OPEN_DEPOSIT_HISTORY', traveler }), [])
  const closeModal         = useCallback(() => dispatch({ type: 'CLOSE' }), [])

  return {
    modal,
    openReports,
    openTrashBin,
    openTripAdmin,
    openDeleteTraveler,
    openDeposit,
    openDepositHistory,
    closeModal,
  }
}
