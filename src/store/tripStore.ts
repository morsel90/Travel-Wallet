import { createContext, useContext } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import type { Traveler, Expense, ExpenseFormData, CurrencyMap } from '../types'

// ─── مخزن Zustand بدل ثلاث React Contexts ────────────────────────────────────
//
// ⚠️ هذا الملف بديل مباشر لـ context/DataContext.ts + context/UIContext.ts —
// نفس الأنواع الثلاثة حرفياً، بمفاتيح علوية بدل Context منفصل لكل واحد.
// اقرأ التعليق الطويل الذي كان في context/UIContext.ts (والآن docs/DECISIONS.md)
// قبل تعديل أي شيء هنا: الفصل بين المفاتيح الثلاثة **حِمل أداء حقيقي** —
// انكساره لا يُنتج خطأً ولا عطلاً ظاهراً، فقط إعادة رسم كل صف مصروف وكل بطاقة
// مسافر مع كل ضغطة مفتاح في نموذج المصروف.
//
// القاعدة عند إضافة حقل: **ضعه بحسب تقلّبه لا بحسب موضوعه.**
//   • data    — بيانات للقراءة فقط، تتغير مع Firestore/المصادقة/الأسعار.
//   • actions — دوال ثابتة الهوية عملياً (useCallback بلا اعتماديات غالباً)،
//     تتغير فقط حين تتغير قائمة المسافرين النشطين (نادر).
//   • form    — حالة نموذج المصروف المتقلّبة، تتغير مع كل حرف، ومستهلكها
//     الوحيد ExpenseForm.

export interface TripDataSlice {
  travelers: Traveler[]
  expenses: Expense[]
  user: User | null
  isAdmin: boolean
  /** 🆕 منظّم الرحلة الحالية (docs/PLAN-member-management.md المرحلة ٣) —
   *  محسوبة أصلاً في useAppCoordinator، تُضاف هنا لتصل TravelerSection/
   *  TravelerProfileModal (قراءة سجل تعديلات الرصيد — انظر firestore.rules). */
  isOrganizer: boolean
  currencies: CurrencyMap
  ratesUpdatedAt: Date | null
}

export interface TripActionsSlice {
  cancelExpenseForm: () => void
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  openDepositHistory: (traveler: Traveler) => void
}

export interface TripFormSlice {
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void
}

export interface TripStoreState {
  data: TripDataSlice
  actions: TripActionsSlice
  form: TripFormSlice
}

export type TripStore = ReturnType<typeof createTripStore>

/**
 * نسخة جديدة لكل استدعاء — عمداً لا Singleton عالمي واحد. `TripStoreProvider`
 * ينشئ واحدة بـ useRef لكل تركيب. راجع docs/DECISIONS.md لسبب هذا القرار
 * (صفحات Storybook تعرض عدة قصص لنفس المكوّن ببيانات مختلفة في آن واحد).
 */
export function createTripStore(initial: TripStoreState) {
  return createStore<TripStoreState>()(() => initial)
}

// ─── Context + selectors ──────────────────────────────────────────────────────
//
// في ملف منفصل عن TripStoreProvider.tsx عمداً: ملف يُصدّر مكوّناً وخطافات معاً
// يُعطّل Fast Refresh (react-refresh/only-export-components) — نفس السبب الذي
// كان يبقي useData/useUIActions/useUIForm في context/*.ts منفصلة عن
// components/AppProviders.tsx القديم.

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

export function useTripFormState(): TripFormSlice {
  return useStore(useTripStore(), s => s.form)
}
