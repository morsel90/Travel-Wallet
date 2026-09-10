// 🆕 أهم نموذج في التطبيق يستحق مدخلاً في الورشة: مسار تسجيل المصروف
// (المبلغ → ماذا كان؟ → من دفع؟ → المشاركون → حفظ). القصة تفاعلية بحق —
// حالة حقيقية لا معالجات صامتة — لأن نصف ما يُراد فحصه هنا سلوك لا شكل:
// الفئة تُشتقّ أثناء الكتابة، والعملة لا تظهر إلا بطلبها.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExpenseForm } from '../components/ExpenseSection'
import { Providers, baseUIForm } from './decorators'
import * as fx from '../fixtures'
import type { ExpenseFormData } from '../types'

function InteractiveExpenseForm({ initial, isEditing = false }: { initial: ExpenseFormData; isEditing?: boolean }) {
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
      participants: prev.participants.length === fx.travelers.length ? [] : fx.travelers.map(t => t.id),
    }))

  return (
    <Providers
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

/** تعديل مصروف بعملة أجنبية: العملة وسعر الصرف مكشوفان من البداية. */
export const بعملة_أجنبية: Story = {
  args: {
    isEditing: true,
    initial: { ...emptyForm, amount: '120', description: 'فندق', category: 'إقامة', currency: 'USD', exchangeRate: '3.75' },
  },
}
