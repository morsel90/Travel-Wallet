import { createContext, useContext } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Traveler, Expense, Repayment, CurrencyMap, AppUser } from '../types'
import type { DepositSubmission } from '../hooks/useDepositActions'

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
//
// 🆕 **وقبلها سؤال: هل يحتاج الحقل أن يكون هنا أصلاً؟** المتجر لمكوّنات
// *متكرّرة* — صفوف ExpenseListItem داخل Virtuoso وبطاقات TravelerCard — لا
// يصحّ تمرير الخصائص إليها عبر القائمة، ويجب ألا تُعاد رسمها مع كل حرف. ما له
// مستهلك واحد يرسمه App.tsx مباشرةً يُمرَّر خاصيةً. هكذا خرجت شريحة `form`
// الثالثة كلها (مستهلكها الوحيد ExpenseForm)، ومعها cancelExpenseForm
// وratesUpdatedAt — انظر docs/DECISIONS.md. فلا حالة تتغيّر مع كل حرف هنا بعد
// اليوم، وهذا بالضبط ما تحرسه القاعدة ١٦.

export interface TripDataSlice {
  travelers: Traveler[]
  expenses: Expense[]
  /** 🆕 قيود السداد غير المحذوفة — لكشف حساب كل مسافر (TravelerProfileModal). */
  repayments: Repayment[]
  user: AppUser | null
  isAdmin: boolean
  /** 🆕 منظّم الرحلة الحالية (docs/PLAN-member-management.md المرحلة ٣) —
   *  محسوبة أصلاً في useAppCoordinator، تُضاف هنا لتصل TravelerSection/
   *  TravelerProfileModal (قراءة سجل تعديلات الرصيد — انظر firestore.rules). */
  isOrganizer: boolean
  currencies: CurrencyMap
}

export interface TripActionsSlice {
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  /** 🆕 تعديل رصيد مسافر — فعلٌ واحد يُستدعى من `DepositEditor` المضمَّن داخل
   *  ملف المسافر، لا فتحُ نافذة. يعيد false حين يرفض المبلغ. */
  submitDeposit: (traveler: Traveler, submission: DepositSubmission) => boolean
}

export interface TripStoreState {
  data: TripDataSlice
  actions: TripActionsSlice
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
