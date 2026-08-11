import { useMemo } from 'react'
import type { ReactNode, Dispatch, FormEvent, SetStateAction } from 'react'
import type { User } from 'firebase/auth'
import type { Traveler, Expense, ExpenseFormData, CurrencyMap } from '../types'
import { DataContext } from '../context/DataContext'
import { UIActionsContext, UIFormContext } from '../context/UIContext'

// ─── مزوّدو السياق ────────────────────────────────────────────────────────────
//
// ⚠️⚠️ اقرأ context/UIContext.ts قبل تعديل أي شيء هنا ⚠️⚠️
//
// القيم الثلاث تُبنى في هذا الملف وحده، وهذا مقصود: الفصل بين UIActionsContext
// وUIFormContext **حِمل أداء حقيقي**، وانكساره لا يُنتج خطأً ولا عطلاً ظاهراً —
// فقط إعادة رسم كل صف مصروف وكل بطاقة مسافر مع كل ضغطة مفتاح. جمعها هنا يجعل
// المقارنة بينها ممكنة بالعين المجرّدة بدل أن تكون متباعدة داخل App.tsx.
//
// القاعدة عند إضافة حقل: **ضعه بحسب تقلّبه لا بحسب موضوعه.**

interface AppProvidersProps {
  // — DataContext: بيانات للقراءة فقط
  travelers: Traveler[]
  expenses: Expense[]
  user: User | null
  isAdmin: boolean
  currencies: CurrencyMap
  ratesUpdatedAt: Date | null

  // — UIActionsContext: دوال فقط
  cancelExpenseForm: () => void
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  openDepositHistory: (traveler: Traveler) => void

  // — UIFormContext: حالة النموذج المتقلّبة
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void

  children: ReactNode
}

export const AppProviders = ({
  travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt,
  cancelExpenseForm, startEditExpense, requestDeleteExpense,
  openDeposit, requestDeleteTraveler, openDepositHistory,
  expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense,
  submitExpense, toggleParticipant, toggleAllParticipants,
  children,
}: AppProvidersProps) => {
  const dataValue = useMemo(() => ({
    travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt,
  }), [travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt])

  // ⚠️ كل ما فيها دوال، وأكثرها useCallback بلا اعتماديات. تتغير عملياً عند
  // تغيّر قائمة المسافرين النشطين فقط (نادر). لا تُضف إليها أي قيمة متغيّرة —
  // سيُبطل ذلك الفصل بصمت ويعيد إعادة الرسم الواسعة عند كل ضغطة مفتاح.
  const actionsValue = useMemo(() => ({
    cancelExpenseForm,
    startEditExpense,
    requestDeleteExpense,
    openDeposit,
    requestDeleteTraveler,
    openDepositHistory,
  }), [
    cancelExpenseForm, startEditExpense, requestDeleteExpense,
    openDeposit, requestDeleteTraveler, openDepositHistory,
  ])

  // وهذه تتغير مع كل حرف يُكتب في نموذج المصروف — وهذا صحيح ومقصود: مستهلكها
  // الوحيد ExpenseForm، وهو نسخة واحدة يجب أن تعكس ما يُكتب فيها فوراً.
  const formValue = useMemo(() => ({
    expenseForm,
    setExpenseForm,
    isExpenseFormOpen,
    isEditingExpense,
    submitExpense,
    toggleParticipant,
    toggleAllParticipants,
  }), [
    expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense,
    submitExpense, toggleParticipant, toggleAllParticipants,
  ])

  return (
    <DataContext.Provider value={dataValue}>
      <UIActionsContext.Provider value={actionsValue}>
        <UIFormContext.Provider value={formValue}>
          {children}
        </UIFormContext.Provider>
      </UIActionsContext.Provider>
    </DataContext.Provider>
  )
}
