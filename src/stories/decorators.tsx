// 🆕 مزوّدات السياق للقصص.
//
// ثلاثة مكوّنات فقط من أصل 32 تقرأ من السياق (TravelerSection, ExpenseSection,
// ChartsSection)، والباقي يعمل بـ props مباشرةً ولا يحتاج شيئاً من هنا.
//
// المعالجات كلها no-op مع تسجيل في actions: القصة مكان لفحص الشكل والحالة، لا
// لتنفيذ كتابات فعلية على Firestore. تمريرها فارغة يجعل الضغط على زر يبدو
// معطّلاً؛ تسجيلها يجعل الأثر مرئياً في لوحة Actions.
import type { ReactNode } from 'react'
import type { Decorator } from '@storybook/react-vite'
import { DataContext } from '../context/DataContext'
import type { DataContextType } from '../context/DataContext'
import { UIActionsContext, UIFormContext } from '../context/UIContext'
import type { UIActionsContextType, UIFormContextType } from '../context/UIContext'
import { CURRENCY_LABELS, FALLBACK_RATES } from '../constants'
import * as fx from '../fixtures'
import type { CurrencyMap } from '../types'

const log = (name: string) => (...args: unknown[]) => {
  console.log(`[story action] ${name}`, ...args)
}

const currencies: CurrencyMap = Object.fromEntries(
  Object.entries(CURRENCY_LABELS).map(([code, label]) => [
    code,
    { label, rate: (FALLBACK_RATES as Record<string, number>)[code] ?? 1 },
  ])
)

export const baseData: DataContextType = {
  travelers: fx.travelers,
  expenses: fx.expenses,
  user: null,
  isAdmin: false,
  currencies,
  // تاريخ ثابت لا Date.now(): القصة يجب أن تُعرض متطابقة في كل تشغيل
  ratesUpdatedAt: new Date('2026-07-21T09:00:00'),
}

export const baseUIActions: UIActionsContextType = {
  cancelExpenseForm: log('cancelExpenseForm'),
  startEditExpense: log('startEditExpense'),
  requestDeleteExpense: log('requestDeleteExpense'),
  openDeposit: log('openDeposit'),
  requestDeleteTraveler: log('requestDeleteTraveler'),
  openDepositHistory: log('openDepositHistory'),
}

export const baseUIForm: UIFormContextType = {
  expenseForm: {
    date: '2026-07-21',
    description: '',
    amount: '',
    currency: 'SAR',
    exchangeRate: '1',
    participants: fx.travelers.map(t => t.id),
    category: 'مطاعم',
    splitMode: 'equal',
    shares: {},
  },
  setExpenseForm: log('setExpenseForm'),
  isExpenseFormOpen: false,
  isEditingExpense: false,
  submitExpense: log('submitExpense'),
  toggleParticipant: log('toggleParticipant'),
  toggleAllParticipants: log('toggleAllParticipants'),
}

interface ProvidersProps {
  children: ReactNode
  data?: Partial<DataContextType>
  uiActions?: Partial<UIActionsContextType>
  uiForm?: Partial<UIFormContextType>
}

export function Providers({ children, data, uiActions, uiForm }: ProvidersProps) {
  return (
    <DataContext.Provider value={{ ...baseData, ...data }}>
      <UIActionsContext.Provider value={{ ...baseUIActions, ...uiActions }}>
        <UIFormContext.Provider value={{ ...baseUIForm, ...uiForm }}>
          {children}
        </UIFormContext.Provider>
      </UIActionsContext.Provider>
    </DataContext.Provider>
  )
}

/** الاستخدام المعتاد: عضو عادي (لا تظهر أزرار الإدارة). */
export const withContext: Decorator = Story => (
  <Providers><Story /></Providers>
)

/** وضع المسؤول: يكشف أزرار التعديل والحذف وسجل الإيداع في بطاقة المسافر. */
export const withAdminContext: Decorator = Story => (
  <Providers data={{ isAdmin: true }}><Story /></Providers>
)

/**
 * رحلة بلا بيانات — يعرض EmptyState بدل القوائم. حالة يمر بها كل مستخدم جديد
 * مرة واحدة، ويصعب العودة إليها بعد إدخال أول مصروف.
 */
export const withEmptyContext: Decorator = Story => (
  <Providers data={{ travelers: fx.noTravelers, expenses: fx.noExpenses, isAdmin: true }}>
    <Story />
  </Providers>
)
