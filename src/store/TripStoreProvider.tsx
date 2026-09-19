import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Traveler, Expense, Repayment, CurrencyMap, AppUser } from '../types'
import { createTripStore, TripStoreContext } from './tripStore'
import type { TripActionsSlice } from './tripStore'

// ─── مزوّد مخزن الرحلة (Zustand) ───────────────────────────────────────────────
//
// ⚠️⚠️ اقرأ store/tripStore.ts وdocs/DECISIONS.md قبل تعديل أي شيء هنا ⚠️⚠️
//
// بديل مباشر لـ components/AppProviders.tsx (React Context سابقاً). نفس توقيع
// الـ props تماماً؛ App.tsx لا يحتاج أي تعديل غير اسم المكوّن والاستيراد.
//
// ⚠️ خطافات القراءة (useTripData/useTripActions) تعيش في
// store/tripStore.ts لا هنا — ملف يُصدّر مكوّناً وخطافات معاً يُعطّل Fast
// Refresh. المكوّنات المستهلِكة تستورد الخطافات من tripStore.ts مباشرة.
//
// القيمتان تُبنيان في هذا الملف وحده، وهذا مقصود — نفس سبب AppProviders.tsx
// القديم: مقارنة الشريحتين ممكنة بالعين المجرّدة بدل أن تكونا متباعدتين.
//
// 🆕 كانت ثلاثاً: شريحة `form` (حالة نموذج المصروف، تتغيّر مع كل حرف) خرجت
// إلى خصائص ExpenseForm مباشرةً من App.tsx — مستهلكها الوحيد نسخة واحدة يرسمها
// App نفسه، فلا مكان لها في حالة عامة. انظر store/tripStore.ts.
//
// آلية المزامنة: نسخة Zustand واحدة لكل تركيب (مُهيّئ useState الكسول، لا
// Singleton عالمي — انظر docs/DECISIONS.md لسبب ذلك)، مُهيَّأة من أول رسم
// مباشرة (بلا فليكر فراغ أولي)، ثم useLayoutEffect منفصلة لكل مفتاح تُحدّث المخزن فقط حين تتغيّر مدخلات ذلك المفتاح تحديداً — بنفس
// مصفوفات الاعتماديات التي كانت تستخدمها useMemo في AppProviders.tsx
// القديم.
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
  // 🆕 مُهيّئ useState الكسول لا `useRef.current ??=`. السلوك واحد بالحرف
  // (المُهيّئ يعمل مرّة واحدة لكل تركيب، والقيمة ثابتة بعدها فلا setter لها)،
  // لكن النمط السابق كان يقرأ مرجعاً **ويكتب فيه** أثناء الرسم — وهو ما يمنعه
  // React صراحةً ويرصده `react-hooks/refs`: سبع مخالفات كلها من هذا السطر
  // وحده. التهيئة الكسولة عبر useState هي البديل الذي يوصي به React لهذا
  // الغرض بالضبط، فتزول المخالفات بلا أي تغيير في السلوك.
  const [store] = useState(() => createTripStore({
    data: { travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies },
    actions: { startEditExpense, requestDeleteExpense, submitDeposit, requestDeleteTraveler },
  }))

  useLayoutEffect(() => {
    store.setState({
      data: { travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies },
    })
  }, [store, travelers, expenses, repayments, user, isAdmin, isOrganizer, currencies])

  // ⚠️ كل ما فيها دوال، أكثرها useCallback بلا اعتماديات. تتغير عملياً عند
  // تغيّر قائمة المسافرين النشطين فقط (نادر). لا تُضف إليها أي قيمة متغيّرة —
  // سيُبطل ذلك الفصل بصمت ويعيد إعادة الرسم الواسعة عند كل ضغطة مفتاح.
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
