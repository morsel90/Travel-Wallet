import { useLayoutEffect, useRef } from 'react'
import type { ReactNode, Dispatch, FormEvent, SetStateAction } from 'react'
import type { User } from 'firebase/auth'
import type { Traveler, Expense, ExpenseFormData, CurrencyMap } from '../types'
import { createTripStore, TripStoreContext } from './tripStore'
import type { TripStore } from './tripStore'

// ─── مزوّد مخزن الرحلة (Zustand) ───────────────────────────────────────────────
//
// ⚠️⚠️ اقرأ store/tripStore.ts وdocs/DECISIONS.md قبل تعديل أي شيء هنا ⚠️⚠️
//
// بديل مباشر لـ components/AppProviders.tsx (React Context سابقاً). نفس توقيع
// الـ props تماماً؛ App.tsx لا يحتاج أي تعديل غير اسم المكوّن والاستيراد.
//
// ⚠️ خطافات القراءة (useTripData/useTripActions/useTripFormState) تعيش في
// store/tripStore.ts لا هنا — ملف يُصدّر مكوّناً وخطافات معاً يُعطّل Fast
// Refresh. المكوّنات المستهلِكة تستورد الخطافات من tripStore.ts مباشرة.
//
// القيمة الثلاث تُبنى في هذا الملف وحده، وهذا مقصود — نفس سبب AppProviders.tsx
// القديم: مقارنة الحقول الثلاثة ممكنة بالعين المجرّدة بدل أن تكون متباعدة.
//
// آلية المزامنة: نسخة Zustand واحدة لكل تركيب (useRef، لا Singleton عالمي —
// انظر docs/DECISIONS.md لسبب ذلك)، مُهيَّأة من أول رسم مباشرة (بلا فليكر
// فراغ أولي)، ثم ثلاث useLayoutEffect منفصلة (واحدة لكل مفتاح) تُحدّث المخزن
// فقط حين تتغيّر مدخلات ذلك المفتاح تحديداً — بنفس مصفوفات الاعتماديات التي
// كانت تستخدمها useMemo الثلاث في AppProviders.tsx القديم.
//
// useLayoutEffect لا setState أثناء الرسم مباشرة: الكتابة إلى مخزن خارجي أثناء
// الرسم تجعل دالة الرسم غير نقية (ما يكشفه React 18 Strict Mode تحديداً)،
// وZustand نفسها توصي بالمزامنة داخل effect لا أثناء الرسم. useLayoutEffect
// يعمل قبل الطلاء فلا يظهر أي وميض بيانات قديمة للمستخدم.
//
// هذا المكوّن لا يقرأ من المخزن إطلاقاً — كاتب فقط. تدفّق البيانات باتجاه واحد
// صارم: Firestore/Auth ← useState الخطاف الأصلي ← useAppCoordinator ← props هنا
// ← مخزن Zustand ← selectors في المكوّنات الطرفية. كل قطعة بيانات لها مالك واحد
// فقط؛ Zustand يحمل نسخة مُزامَنة فقط لأجل الاشتراك الدقيق.

interface TripStoreProviderProps {
  // — data
  travelers: Traveler[]
  expenses: Expense[]
  user: User | null
  isAdmin: boolean
  currencies: CurrencyMap
  ratesUpdatedAt: Date | null

  // — actions
  cancelExpenseForm: () => void
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  openDepositHistory: (traveler: Traveler) => void

  // — form
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void

  children: ReactNode
}

export function TripStoreProvider({
  travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt,
  cancelExpenseForm, startEditExpense, requestDeleteExpense,
  openDeposit, requestDeleteTraveler, openDepositHistory,
  expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense,
  submitExpense, toggleParticipant, toggleAllParticipants,
  children,
}: TripStoreProviderProps) {
  const storeRef = useRef<TripStore>()
  storeRef.current ??= createTripStore({
    data: { travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt },
    actions: {
      cancelExpenseForm, startEditExpense, requestDeleteExpense,
      openDeposit, requestDeleteTraveler, openDepositHistory,
    },
    form: {
      expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense,
      submitExpense, toggleParticipant, toggleAllParticipants,
    },
  })
  const store = storeRef.current

  useLayoutEffect(() => {
    store.setState({
      data: { travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt },
    })
  }, [store, travelers, expenses, user, isAdmin, currencies, ratesUpdatedAt])

  // ⚠️ كل ما فيها دوال، أكثرها useCallback بلا اعتماديات. تتغير عملياً عند
  // تغيّر قائمة المسافرين النشطين فقط (نادر). لا تُضف إليها أي قيمة متغيّرة —
  // سيُبطل ذلك الفصل بصمت ويعيد إعادة الرسم الواسعة عند كل ضغطة مفتاح.
  useLayoutEffect(() => {
    store.setState({
      actions: {
        cancelExpenseForm, startEditExpense, requestDeleteExpense,
        openDeposit, requestDeleteTraveler, openDepositHistory,
      },
    })
  }, [store, cancelExpenseForm, startEditExpense, requestDeleteExpense, openDeposit, requestDeleteTraveler, openDepositHistory])

  // وهذه تتغير مع كل حرف يُكتب في نموذج المصروف — وهذا صحيح ومقصود: مستهلكها
  // الوحيد ExpenseForm، وهو نسخة واحدة يجب أن تعكس ما يُكتب فيها فوراً.
  useLayoutEffect(() => {
    store.setState({
      form: {
        expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense,
        submitExpense, toggleParticipant, toggleAllParticipants,
      },
    })
  }, [store, expenseForm, setExpenseForm, isExpenseFormOpen, isEditingExpense, submitExpense, toggleParticipant, toggleAllParticipants])

  return (
    <TripStoreContext.Provider value={store}>
      {children}
    </TripStoreContext.Provider>
  )
}
