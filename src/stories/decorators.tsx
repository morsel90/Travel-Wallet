// 🆕 مزوّدات مخزن الرحلة للقصص.
//
// مكوّنان متكرّران فقط يقرآن من المخزن (ExpenseListItem في ExpenseSection،
// وTravelerCard في TravelerSection)، والباقي يعمل بـ props مباشرةً ولا يحتاج
// شيئاً من هنا. 🆕 ExpenseForm منها: خصائصه الافتراضية في baseExpenseFormProps.
//
// المعالجات كلها no-op مع تسجيل في actions: القصة مكان لفحص الشكل والحالة، لا
// لتنفيذ كتابات فعلية على Firestore. تمريرها فارغة يجعل الضغط على زر يبدو
// معطّلاً؛ تسجيلها يجعل الأثر مرئياً في لوحة Actions.
import type { ReactNode } from 'react'
import type { Decorator } from '@storybook/react-vite'
import { TripStoreProvider } from '../store/TripStoreProvider'
import type { TripDataSlice, TripActionsSlice } from '../store/tripStore'
import type { ExpenseFormProps } from '../components/ExpenseSection'
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

export const baseData: TripDataSlice = {
  travelers: fx.travelers,
  expenses: fx.expenses,
  repayments: [],
  user: null,
  isAdmin: false,
  isOrganizer: false,
  currencies,
}

export const baseUIActions: TripActionsSlice = {
  startEditExpense: log('startEditExpense'),
  requestDeleteExpense: log('requestDeleteExpense'),
  requestDeleteTraveler: log('requestDeleteTraveler'),
  submitDeposit: (traveler, submission) => { log('submitDeposit')(traveler, submission); return true },
}

/** خصائص ExpenseForm الافتراضية — تُمرَّر مباشرةً، لا عبر المخزن. */
export const baseExpenseFormProps: ExpenseFormProps = {
  travelers: fx.travelers,
  expenses: fx.expenses,
  currencies,
  // تاريخ ثابت لا Date.now(): القصة يجب أن تُعرض متطابقة في كل تشغيل
  ratesUpdatedAt: new Date('2026-07-21T09:00:00'),
  user: null,
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
    paidBy: 'fund',
  },
  setExpenseForm: log('setExpenseForm'),
  isExpenseFormOpen: false,
  isEditingExpense: false,
  submitExpense: log('submitExpense'),
  toggleParticipant: log('toggleParticipant'),
  toggleAllParticipants: log('toggleAllParticipants'),
  cancelExpenseForm: log('cancelExpenseForm'),
}

interface ProvidersProps {
  children: ReactNode
  data?: Partial<TripDataSlice>
  uiActions?: Partial<TripActionsSlice>
}

export function Providers({ children, data, uiActions }: ProvidersProps) {
  return (
    <TripStoreProvider
      {...{ ...baseData, ...data }}
      {...{ ...baseUIActions, ...uiActions }}
    >
      {children}
    </TripStoreProvider>
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
