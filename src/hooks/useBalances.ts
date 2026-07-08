import { useMemo } from 'react'
import type { Traveler, TravelerBalance, Expense } from '../types'
import {
  calculateBalances,
  calculateTotalSpent,
  calculateTotalDeposited,
} from '../utils/calculations'

// ─── useBalances ──────────────────────────────────────────────────────────────
// غلاف React رفيع حول دوال الحساب النقية في utils/calculations.
// يحفظ النتيجة بـ useMemo ويُعاد حسابها فقط عند تغيّر travelers أو expenses.
export interface UseBalances {
  balances: TravelerBalance[]
  totalSpent: number
  totalDeposited: number
  totalRemaining: number
}

export function useBalances(travelers: Traveler[], expenses: Expense[]): UseBalances {
  return useMemo<UseBalances>(() => {
    const balances        = calculateBalances(travelers, expenses)
    const totalSpent      = calculateTotalSpent(expenses)
    const totalDeposited  = calculateTotalDeposited(travelers)
    return { balances, totalSpent, totalDeposited, totalRemaining: totalDeposited - totalSpent }
  }, [travelers, expenses])
}
