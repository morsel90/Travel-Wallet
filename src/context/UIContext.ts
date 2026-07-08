import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { Traveler, Expense, ExpenseFormData } from '../types'

export interface UIContextType {
  // ─ نموذج المصروف
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  openExpenseForm: () => void
  cancelExpenseForm: () => void
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void

  // ─ إجراءات المصروف (لكل عنصر)
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void

  // ─ نموذج إضافة مسافر
  isAddingTraveler: boolean
  startAddTraveler: () => void
  cancelAddTraveler: () => void
  newTravelerName: string
  setNewTravelerName: Dispatch<SetStateAction<string>>
  newTravelerDeposit: string
  setNewTravelerDeposit: Dispatch<SetStateAction<string>>
  submitTraveler: (e: FormEvent<HTMLFormElement>) => void

  // ─ إجراءات المسافر (لكل عنصر)
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  // 🆕 سجل تدقيق تعديلات الرصيد (مرئي للمسؤول فقط)
  openDepositHistory: (traveler: Traveler) => void
}

export const UIContext = createContext<UIContextType | null>(null)

export function useUI(): UIContextType {
  const ctx = useContext(UIContext)
  if (!ctx) {
    throw new Error('useUI يجب أن يُستخدم داخل <UIContext.Provider>')
  }
  return ctx
}