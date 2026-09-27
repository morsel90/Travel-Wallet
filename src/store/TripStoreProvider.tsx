import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Traveler, Expense, Repayment, CurrencyMap, AppUser } from '../types'
import { createTripStore, TripStoreContext } from './tripStore'
import type { TripActionsSlice } from './tripStore'

// ─── مزوّد مخزن الرحلة (Zustand) ───────────────────────────────────────────────
// ⚠️ اقرأ store/tripStore.ts وdocs/DECISIONS.md قبل التعديل.
//
// كاتب فقط، لا يقرأ من المخزن: Firestore ← useAppCoordinator ← props هنا ←
// المخزن ← selectors في المكوّنات الطرفية. نسخة مخزن لكل تركيب (لا Singleton).
//
// ⚠️ الخطافات في tripStore.ts لا هنا — تصدير مكوّن وخطافات معاً يعطّل Fast Refresh.
// ⚠️ المزامنة في useLayoutEffect لا أثناء الرسم (نقاء الرسم)، وقبل الطلاء فلا وميض.

interface TripStoreProviderProps {
  // — data
  travelers: Traveler[]
  expenses: Expense[]
  repayments: Repayment[]
  user: AppUser | null
  isAdmin: boolean
  isOrganizer: boolean
  currencies: CurrencyMap

  // — actions
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  submitDeposit: TripActionsSlice['submitDeposit']
  requestDeleteTraveler: (traveler: Traveler) => void

  children: ReactNode
}

export function TripStoreProvider({
  travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies,
  startEditExpense, requestDeleteExpense, submitDeposit, requestDeleteTraveler,
  children,
}: TripStoreProviderProps) {
  // مُهيّئ useState الكسول لا `useRef.current ??=` — الكتابة في مرجع أثناء الرسم
  // ممنوعة (`react-hooks/refs`).
  const [store] = useState(() => createTripStore({
    data: { travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies },
    actions: { startEditExpense, requestDeleteExpense, submitDeposit, requestDeleteTraveler },
  }))

  useLayoutEffect(() => {
    store.setState({
      data: { travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies },
    })
  }, [store, travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies])

  // ⚠️ دوال مستقرّة فقط — قيمة متغيّرة هنا تُبطل الفصل بصمت وتعيد الرسم الواسع.
  useLayoutEffect(() => {
    store.setState({
      actions: { startEditExpense, requestDeleteExpense, submitDeposit, requestDeleteTraveler },
    })
  }, [store, startEditExpense, requestDeleteExpense, submitDeposit, requestDeleteTraveler])

  return (
    <TripStoreContext.Provider value={store}>
      {children}
    </TripStoreContext.Provider>
  )
}
