import { createContext, useContext } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Traveler, Expense, Repayment, CurrencyMap, AppUser } from '../types'
import type { DepositSubmission } from '../hooks/useDepositActions'

// ─── مخزن Zustand للمكوّنات المتكرّرة ────────────────────────────────────────
//
// ⚠️ الفصل بين الشريحتين حِمل أداء (DECISIONS.md): انكساره لا يُظهر عطلاً، فقط
// يعيد رسم كل صفّ وكل بطاقة مع كل ضغطة مفتاح. القاعدة ١٦.
//
// عند إضافة حقل: هل له مستهلك متكرّر (ExpenseListItem، TravelerCard)؟ إن لا،
// مرّره خاصيةً من App.tsx. وإن نعم، ضعه بحسب تقلّبه لا موضوعه:
//   • data    — للقراءة، تتغيّر مع Firestore/المصادقة/الأسعار.
//   • actions — دوال ثابتة الهوية عملياً.

export interface TripDataSlice {
  travelers: Traveler[]
  expenses: Expense[]
  /** قيود السداد غير المحذوفة — لكشف حساب كل مسافر. */
  repayments: Repayment[]
  user: AppUser | null
  isAdmin: boolean
  /** منظّم الرحلة الحالية — يفتح سجلّ تعديلات الرصيد في ملف المسافر. */
  isOrganizer: boolean
  currencies: CurrencyMap
}

export interface TripActionsSlice {
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  /** تعديل رصيد من `DepositEditor` داخل ملف المسافر. false = مبلغ مرفوض. */
  submitDeposit: (traveler: Traveler, submission: DepositSubmission) => boolean
}

export interface TripStoreState {
  data: TripDataSlice
  actions: TripActionsSlice
}

export type TripStore = ReturnType<typeof createTripStore>

/** نسخة لكل استدعاء، لا Singleton — Storybook يعرض عدة قصص ببيانات مختلفة معاً. */
export function createTripStore(initial: TripStoreState) {
  return createStore<TripStoreState>()(() => initial)
}

// ─── Context + selectors — منفصلة عن المزوّد كي لا يتعطّل Fast Refresh ──────

export const TripStoreContext = createContext<TripStore | null>(null)

function useTripStore(): TripStore {
  const store = useContext(TripStoreContext)
  if (!store) {
    throw new Error('هذا الخطاف يجب أن يُستخدم داخل <TripStoreProvider>')
  }
  return store
}

export function useTripData(): TripDataSlice {
  return useStore(useTripStore(), s => s.data)
}

export function useTripActions(): TripActionsSlice {
  return useStore(useTripStore(), s => s.actions)
}
