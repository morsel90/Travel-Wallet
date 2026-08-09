import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { Traveler, Expense, ExpenseFormData } from '../types'

// ─── سياقان لا واحد: الفصل بحسب معدّل التغيّر ────────────────────────────────
//
// ⚠️ كان سياقاً واحداً يجمع حالة النموذج والإجراءات معاً، وهذا كان يُنتج إعادة
// رسم واسعة بلا أي داعٍ:
//
// أي مكوّن يستهلك سياقاً يُعاد رسمه عند تغيّر *قيمة* السياق كاملةً — لا عند
// تغيّر ما يستهلكه منها فقط، و`memo()` لا تحمي من ذلك لأن استهلاك السياق يتجاوزها.
// وبما أن `expenseForm` كانت ضمن نفس القيمة، فإن **كل ضغطة مفتاح** في نموذج
// المصروف كانت تُنشئ قيمة جديدة فيُعاد رسم كل صفوف المصاريف وبطاقات المسافرين
// المعروضة — رغم أن كل ما تستهلكه تلك الصفوف دالتان ثابتتان لم تتغيّرا إطلاقاً.
//
// الفصل يحلّ ذلك ببنية React وحدها، دون مكتبة إدارة حالة إضافية:
//
//   • UIActionsContext — دوال فقط، هويتها لا تتغير إلا عند تغيّر قائمة المسافرين
//     النشطين (نادر). هذا ما تستهلكه المكوّنات المتكررة (ExpenseListItem و
//     TravelerCard)، فلا يُعاد رسمها عند الكتابة إطلاقاً.
//   • UIFormContext — حالة النموذج المتقلبة وما يرتبط بها من دوال تتغير معها.
//     يستهلكه ExpenseForm وحده، وهو نسخة واحدة يجب أن تُعاد رسمها مع كل حرف فعلاً.
//
// ⚠️ عند إضافة حقل جديد: ضعه بحسب تقلّبه لا بحسب موضوعه. حقل متغيّر يوضع في
// سياق الإجراءات يُبطل الفصل بالكامل ويعيد المشكلة صامتةً.
//
// 🗑️ حُذفت من السياق حقول نموذج المسافر (newTravelerName وأخواتها) وopenExpenseForm
// وisAddingTraveler وstartAddTraveler وsubmitTraveler: لم يكن أي مكوّن يقرأها عبر
// السياق أصلاً — تُمرَّر كخصائص (props) من App.tsx — فكانت حمولة ميتة تُقلّب قيمة
// السياق مع كل حرف يُكتب في اسم المسافر بلا فائدة لأحد.

// ─── الإجراءات (ثابتة الهوية عملياً) ─────────────────────────────────────────
export interface UIActionsContextType {
  cancelExpenseForm: () => void
  // إجراءات المصروف (لكل عنصر في القائمة)
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  // إجراءات المسافر (لكل بطاقة)
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  /** 🆕 سجل تدقيق تعديلات الرصيد (مرئي للمسؤول فقط) */
  openDepositHistory: (traveler: Traveler) => void
}

// ─── حالة النموذج (تتغير مع كل ضغطة مفتاح) ───────────────────────────────────
export interface UIFormContextType {
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  // مرتبطة بحالة النموذج فتتغير معها — مكانها هنا لا مع الإجراءات الثابتة
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void
}

export const UIActionsContext = createContext<UIActionsContextType | null>(null)
export const UIFormContext    = createContext<UIFormContextType | null>(null)

export function useUIActions(): UIActionsContextType {
  const ctx = useContext(UIActionsContext)
  if (!ctx) {
    throw new Error('useUIActions يجب أن يُستخدم داخل <UIActionsContext.Provider>')
  }
  return ctx
}

export function useUIForm(): UIFormContextType {
  const ctx = useContext(UIFormContext)
  if (!ctx) {
    throw new Error('useUIForm يجب أن يُستخدم داخل <UIFormContext.Provider>')
  }
  return ctx
}
