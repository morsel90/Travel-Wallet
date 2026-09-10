// 🆕 يغطّي مسار تسجيل المصروف كما صار: المبلغ → ماذا كان؟ → من دفع؟ → المشاركون
// → حفظ. ما يُختبر هنا هو *ما يظهر متى*: "من دفع؟" ظاهر بلا نقرة، والعملة
// والفئة والتاريخ لا تظهر إلا عند الحاجة إليها فعلاً.
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TripStoreProvider } from '../store/TripStoreProvider'
import { ExpenseForm } from './ExpenseSection'
import type { Traveler, ExpenseFormData, CurrencyMap } from '../types'

const travelers: Traveler[] = [
  { id: 1, name: 'محمد', shortName: 'محمد', deposited: 0 },
  { id: 2, name: 'سعد', shortName: 'سعد', deposited: 0, uid: 'uid-saad' },
]

const currencies: CurrencyMap = {
  SAR: { label: 'ريال سعودي (SAR)', rate: 1 },
  USD: { label: 'دولار أمريكي (USD)', rate: 3.75 },
}

const emptyForm: ExpenseFormData = {
  date: new Date().toISOString().slice(0, 10),
  description: '', amount: '', currency: 'SAR', exchangeRate: '1',
  participants: travelers.map(t => t.id), category: 'أخرى',
  splitMode: 'equal', shares: {}, paidBy: 'fund',
}

// ⚠️ المعالجات ثوابت على مستوى الوحدة لا دوال سهمية داخل الـJSX — Modal يستدعي
// useDialogA11y باعتماديات [containerRef, onClose]، فـonClose جديدة مع كل رسم
// تُعيد تشغيل الخطاف فيُعاد التركيز إلى أول عنصر (زر الإغلاق) بعد أول حرف
// يُكتب، وتضيع بقية الحروف. في التطبيق الفعلي cancelExpenseForm خطاف
// useCallback ثابت، فهذا فخّ اختبار لا عطل منتج — لكنه يُفشل أي اختبار كتابة.
const noop = () => {}
const submitExpense = (e: { preventDefault: () => void }) => e.preventDefault()

// حالة حقيقية لا setExpenseForm فارغة: الاشتقاق التلقائي للفئة يقرأ ما كُتب
// فعلاً في النموذج، فمزوّد بلا حالة يجعل الاختبار يمرّ دون أن يفحص شيئاً.
function Harness({ initial = emptyForm, isEditing = false, user = null }: {
  initial?: ExpenseFormData
  isEditing?: boolean
  user?: { uid: string } | null
}) {
  const [expenseForm, setExpenseForm] = useState<ExpenseFormData>(initial)
  return (
    <TripStoreProvider
      travelers={travelers} expenses={[]} user={user as never} isAdmin={false} isOrganizer={false}
      currencies={currencies} ratesUpdatedAt={null}
      cancelExpenseForm={noop} startEditExpense={noop} requestDeleteExpense={noop}
      openDeposit={noop} requestDeleteTraveler={noop} openDepositHistory={noop}
      expenseForm={expenseForm} setExpenseForm={setExpenseForm}
      isExpenseFormOpen isEditingExpense={isEditing}
      submitExpense={submitExpense}
      toggleParticipant={noop} toggleAllParticipants={noop}
    >
      <ExpenseForm />
    </TripStoreProvider>
  )
}

describe('ExpenseForm — «من دفع؟» خطوة ظاهرة', () => {
  it('يعرض كبسولات الدافع فوراً بلا أي توسيع، والصندوق المشترك محدَّد افتراضياً', () => {
    render(<Harness />)
    const fund = screen.getByRole('button', { name: 'دفع من الصندوق المشترك' })
    expect(fund).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'دفعها محمد' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('نقرة واحدة تنقل الدفع إلى مسافر بعينه', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'دفعها سعد' }))
    expect(screen.getByRole('button', { name: 'دفعها سعد' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'دفع من الصندوق المشترك' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('يضع ملفّ المستخدم الحالي أول المسافرين ويُعلّمه بـ«(أنا)»', () => {
    render(<Harness user={{ uid: 'uid-saad' }} />)
    const payers = screen.getAllByRole('button', { name: /^دفعها / })
    expect(payers[0]).toHaveTextContent('سعد (أنا)')
    expect(payers[1]).toHaveTextContent('محمد')
  })
})

describe('ExpenseForm — الخيارات المتقدمة لا تظهر إلا عند الحاجة', () => {
  it('العملة مطويّة ما دام المصروف بالريال، وتُكشف بنقرة واحدة', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByLabelText('العملة')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /عملة أخرى/ }))
    expect(screen.getByLabelText('العملة')).toBeInTheDocument()
  })

  it('العملة مكشوفة من البداية عند تعديل مصروف بعملة أجنبية', () => {
    render(<Harness isEditing initial={{ ...emptyForm, currency: 'USD', exchangeRate: '3.75' }} />)
    expect(screen.getByLabelText('العملة')).toBeInTheDocument()
    expect(screen.getByLabelText('سعر الصرف')).toBeInTheDocument()
  })

  it('الفئة لا تظهر قبل الوصف، ثم تظهر مشتقّة منه', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByLabelText('الفئة')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('الوصف'), 'عشاء')
    expect(screen.getByLabelText('الفئة')).toHaveValue('طعام وشراب')
  })

  it('أول تغيير يدوي للفئة يوقف الاشتقاق فلا يُلغيه ما يُكتب بعده', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const description = screen.getByLabelText('الوصف')
    await user.type(description, 'عشاء')
    await user.selectOptions(screen.getByLabelText('الفئة'), 'تسوق')
    await user.type(description, ' وبنزين')
    expect(screen.getByLabelText('الفئة')).toHaveValue('تسوق')
  })

  it('لا يُلغي فئة مصروف قائم عند تعديل وصفه', async () => {
    const user = userEvent.setup()
    render(<Harness isEditing initial={{ ...emptyForm, description: 'عشاء', category: 'أنشطة وترفيه' }} />)
    await user.type(screen.getByLabelText('الوصف'), ' فاخر')
    expect(screen.getByLabelText('الفئة')).toHaveValue('أنشطة وترفيه')
  })

  it('التاريخ يبقى سطراً باهتاً حتى يُنقر', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByLabelText('التاريخ')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'اليوم' }))
    expect(screen.getByLabelText('التاريخ')).toBeInTheDocument()
  })
})
