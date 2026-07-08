import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
import type { Traveler, Expense, CurrencyMap } from '../types'

export interface DataContextType {
  // ─ بيانات مشتركة
  travelers: Traveler[]
  expenses: Expense[]

  // ─ مصادقة
  user: User | null
  isAdmin: boolean

  // ─ أسعار الصرف
  currencies: CurrencyMap
  ratesUpdatedAt: Date | null
}

export const DataContext = createContext<DataContextType | null>(null)

export function useData(): DataContextType {
  const ctx = useContext(DataContext)
  if (!ctx) {
    throw new Error('useData يجب أن يُستخدم داخل <DataContext.Provider>')
  }
  return ctx
}