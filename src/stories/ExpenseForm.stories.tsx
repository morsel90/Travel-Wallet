// 🆕 أهم نموذج في التطبيق يستحق مدخلاً في الورشة: مسار تسجيل المصروف
// (المبلغ → ماذا كان؟ → من دفع؟ → المشاركون → حفظ). القصة تفاعلية بحق —
// حالة حقيقية لا معالجات صامتة — لأن نصف ما يُراد فحصه هنا سلوك لا شكل:
// الفئة تُشتقّ أثناء الكتابة، والعملة لا تظهر إلا بطلبها، وكبسولات الدافع
// تنطوي حين يكبر عدد المسافرين.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExpenseForm } from '../components/ExpenseSection'
import { Providers, baseUIForm } from './decorators'
import * as fx from '../fixtures'
import type { ExpenseFormData, Traveler, Expense } from '../types'

interface InteractiveProps {
  initial: ExpenseFormData
  isEditing?: boolean
  /** دفتر المسافرين — يُمرَّر لفحص أثر العدد على قسم "من دفع؟". */
  travelers?: Traveler[]
  expenses?: Expense[]
  /** حساب مربوط بمسافر: يُظهر كبسولة «(أنا)» في مقدّمة الدافعين. */
  myUid?: string
}

function InteractiveExpenseForm({ initial, isEditing = false, travelers = fx.travelers, expenses = fx.expenses, myUid }: InteractiveProps) {
  const [expenseForm, setExpenseForm] = useState<ExpenseFormData>(initial)
  const toggleParticipant = (id: number) =>
    setExpenseForm(prev => ({
      ...prev,
      participants: prev.participants.includes(id)
        ? prev.participants.filter(n => n !== id)
        : [...prev.participants, id],
    }))
  const toggleAllParticipants = () =>
    setExpenseForm(prev => ({
      ...prev,
      participants: prev.participants.length === travelers.length ? [] : travelers.map(t => t.id),
    }))

  return (
    <Providers
      data={{ travelers, expenses, user: myUid ? ({ uid: myUid } as never) : null }}
      uiForm={{
        ...baseUIForm,
        expenseForm,
        setExpenseForm,
        isExpenseFormOpen: true,
        isEditingExpense: isEditing,
        submitExpense: e => e.preventDefault(),
        toggleParticipant,
        toggleAllParticipants,
      }}
    >
      <ExpenseForm />
    </Providers>
  )
}

const emptyForm: ExpenseFormData = {
  ...baseUIForm.expenseForm,
  participants: fx.travelers.map(t => t.id),
  category: 'أخرى',
}

// رحلة طويلة واقعية: أربعة عشر مسافراً، وحسابي مربوط بأحدهم.
const bigTripNames = [
  'محمد', 'عبدالعزيز', 'الجاسر', 'باسل', 'ابوسليم', 'جعفر', 'مشعل',
  'طاهر', 'عواض', 'خليفة', 'حسين', 'ماجد', 'سلطان', 'نايف',
]
const BIG_TRIP_UID = 'story-big-trip-uid'
const bigTripTravelers: Traveler[] = bigTripNames.map((shortName, i) => ({
  id: i + 1,
  name: shortName,
  shortName,
  deposited: 500,
  deletedAt: null,
  ...(i === 0 ? { uid: BIG_TRIP_UID } : {}),
}))
// مصروفان دفعهما مسافران بعينهما — مصدر ترتيب "الأحدث دفعاً" في الكبسولات.
const bigTripExpenses: Expense[] = [
  { id: 'b1', date: '2026-09-08', description: 'وقود', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1, participants: [1, 5], paidBy: 5, createdAt: 1757000000000, category: 'مواصلات', deletedAt: null },
  { id: 'b2', date: '2026-09-09', description: 'قهوة', amount: 60, originalAmount: 60, currency: 'SAR', exchangeRate: 1, participants: [1, 9], paidBy: 9, createdAt: 1757100000000, category: 'طعام وشراب', deletedAt: null },
]

const meta = {
  title: 'المصاريف/نموذج المصروف',
  component: InteractiveExpenseForm,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'المسار: المبلغ ← ماذا كان؟ ← من دفع؟ ← المشاركون ← حفظ. ' +
          'العملة والتقسيم غير المتساوي والتاريخ خيارات متقدمة لا تظهر إلا عند طلبها، ' +
          'والفئة تُشتقّ من الوصف (utils/categoryGuess.ts) بدل أن تُسأل.',
      },
    },
  },
} satisfies Meta<typeof InteractiveExpenseForm>

export default meta
type Story = StoryObj<typeof meta>

/** مصروف جديد: ما يراه المستخدم لحظة فتح النموذج — بلا عملة ولا فئة ولا تاريخ. */
export const مصروف_جديد: Story = {
  args: { initial: emptyForm },
}

/** بعد كتابة الوصف: الفئة ظهرت مشتقّة منه، والدافع مسافر بعينه لا الصندوق. */
export const بوصف_ودافع: Story = {
  args: {
    initial: { ...emptyForm, amount: '250', description: 'عشاء في المطعم', category: 'طعام وشراب', paidBy: fx.travelers[0].id },
  },
}

/**
 * رحلة من أربعة عشر مسافراً (حالة حقيقية لا افتراضية): كبسولات "من دفع؟"
 * مقصورة على ملفّي وآخر من دفعوا فعلاً، والبقية خلف كبسولة "غيرهم" — بلا هذا
 * الحدّ كان القسم يملأ أربعة صفوف ويدفع بقية النموذج خارج الشاشة.
 */
export const رحلة_كبيرة: Story = {
  args: {
    initial: { ...emptyForm, amount: '280', description: 'عشاء', category: 'طعام وشراب', participants: bigTripTravelers.map(t => t.id) },
    travelers: bigTripTravelers,
    expenses: bigTripExpenses,
    myUid: BIG_TRIP_UID,
  },
}

/** تعديل مصروف بعملة أجنبية: العملة وسعر الصرف مكشوفان من البداية. */
export const بعملة_أجنبية: Story = {
  args: {
    isEditing: true,
    initial: { ...emptyForm, amount: '120', description: 'فندق', category: 'إقامة', currency: 'USD', exchangeRate: '3.75' },
  },
}
