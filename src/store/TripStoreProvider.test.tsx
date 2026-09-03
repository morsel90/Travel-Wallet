import { describe, it, expect } from 'vitest'
import { memo } from 'react'
import { render, act } from '@testing-library/react'
import { TripStoreProvider } from './TripStoreProvider'
import { useTripData, useTripActions, useTripFormState } from './tripStore'
import type { ExpenseFormData } from '../types'

// ─── إثبات عزل إعادة الرسم — النسخة المؤتمتة من الفحص اليدوي بـ DevTools ─────
//
// هذا الملف هو الدليل الدائم على أن الانتقال من السياقات الثلاث إلى Zustand لم
// يُفقد ضمان العزل الموجود أصلاً: مكوّن يقرأ مفتاحاً واحداً لا يُعاد رسمه عند
// تغيّر مفتاح آخر. راجع docs/DECISIONS.md.
//
// ⚠️ المسابر مُغلّفة بـ memo() عمداً — تماماً مثل ExpenseListItem/TravelerCard
// الحقيقيين. memo() وحدها لا تكفي لمنع إعادة الرسم عند تغيّر سياق/مخزن (هذا هو
// أصل المشكلة التي حلّها الفصل أصلاً)، لكنها ضرورية لمنع إعادة الرسم الناتجة
// فقط عن إعادة رسم TripStoreProvider نفسه بقيم props مطابقة — وهو سلوك React
// عادي بلا علاقة بالمخزن. بلا memo، كل مسبار يُعاد رسمه مع كل rerender لأي سبب،
// فيُخفي فرق الاشتراك الذي يفحصه هذا الاختبار تحديداً.

const baseExpenseForm: ExpenseFormData = {
  date: '2026-08-22', description: '', amount: '', currency: 'SAR', exchangeRate: '1',
  participants: [], category: 'مطاعم', splitMode: 'equal', shares: {}, paidBy: 'fund',
}

function baseProps(overrides: Partial<Parameters<typeof TripStoreProvider>[0]> = {}) {
  return {
    travelers: [], expenses: [], user: null, isAdmin: false, isOrganizer: false,
    currencies: {}, ratesUpdatedAt: null,
    cancelExpenseForm: () => {}, startEditExpense: () => {}, requestDeleteExpense: () => {},
    openDeposit: () => {}, requestDeleteTraveler: () => {}, openDepositHistory: () => {},
    expenseForm: baseExpenseForm, setExpenseForm: () => {},
    isExpenseFormOpen: false, isEditingExpense: false,
    submitExpense: () => {}, toggleParticipant: () => {}, toggleAllParticipants: () => {},
    ...overrides,
  }
}

const DataProbe = memo(({ onRender }: { onRender: () => void }) => {
  const data = useTripData()
  onRender()
  return <span data-testid="data-probe">{String(data.isAdmin)}</span>
})

const FormProbe = memo(({ onRender }: { onRender: () => void }) => {
  const form = useTripFormState()
  onRender()
  return <span data-testid="form-probe">{form.expenseForm.description}</span>
})

const ActionsProbe = memo(({ onRender }: { onRender: () => void }) => {
  const actions = useTripActions()
  onRender()
  return <span data-testid="actions-probe">{typeof actions.cancelExpenseForm}</span>
})

// ⚠️ عداد عادي، لا useRef — هذا الملف يشغّله كود الاختبار نفسه، لا مكوّن React،
// فاستدعاء خطاف هنا يخالف قواعد الخطافات.
function createRenderCounter() {
  const count = { current: 0 }
  return { increment: () => { count.current += 1 }, get: () => count.current }
}

describe('TripStoreProvider — عزل إعادة الرسم', () => {
  it('يعرض props الأولى في أول رسم بلا نبضة إضافية', () => {
    const { getByTestId } = render(
      <TripStoreProvider {...baseProps({ isAdmin: true })}>
        <DataProbe onRender={() => {}} />
      </TripStoreProvider>,
    )
    expect(getByTestId('data-probe').textContent).toBe('true')
  })

  it('تحديث form فقط لا يُعيد رسم مسبار مشترك في data', () => {
    const dataCounter = createRenderCounter()
    const formCounter = createRenderCounter()
    // ⚠️ props ثابتة واحدة، نُبدّل حقلاً واحداً فقط لاحقاً — لا نستدعي baseProps()
    // مرتين: هي تُنشئ مصفوفات/دوال جديدة الهوية في كل استدعاء (تماماً كما لولا
    // useMemo في useAppCoordinator الحقيقي)، وهذا يُغيّر مدخلات useLayoutEffect
    // الخاصة بـ data حتى لو لم يتغيّر شيء منطقياً — عطلاً في الاختبار لا في الآلية.
    const props = baseProps()

    const { rerender } = render(
      <TripStoreProvider {...props}>
        <DataProbe onRender={dataCounter.increment} />
        <FormProbe onRender={formCounter.increment} />
      </TripStoreProvider>,
    )
    // ⚠️ التركيب الأول يُنتج رسمتين لكل مسبار: الأولى من قيمة المخزن الابتدائية
    // (المُهيَّأة مباشرة من props)، والثانية من useLayoutEffect الذي يُزامن نفس
    // القيم بعد أول التزام — يُنشئ كائناً جديد الهوية رغم تطابق القيمة. هذا
    // متوقَّع وموثَّق (انظر تعليق TripStoreProvider.tsx وdocs/DECISIONS.md)، ولا
    // يخالف ضمان العزل: ما يهمّنا هنا هو السلوك بعد استقرار التركيب، لا لحظته.
    const dataRendersAfterMount = dataCounter.get()
    const formRendersAfterMount = formCounter.get()

    act(() => {
      rerender(
        <TripStoreProvider {...props} expenseForm={{ ...baseExpenseForm, description: 'قهوة' }}>
          <DataProbe onRender={dataCounter.increment} />
          <FormProbe onRender={formCounter.increment} />
        </TripStoreProvider>,
      )
    })

    expect(dataCounter.get()).toBe(dataRendersAfterMount)
    expect(formCounter.get()).toBe(formRendersAfterMount + 1)
  })

  it('تحديث data فقط لا يُعيد رسم مسبار مشترك في form أو actions', () => {
    const dataCounter = createRenderCounter()
    const formCounter = createRenderCounter()
    const actionsCounter = createRenderCounter()
    const props = baseProps()

    const { rerender } = render(
      <TripStoreProvider {...props}>
        <DataProbe onRender={dataCounter.increment} />
        <FormProbe onRender={formCounter.increment} />
        <ActionsProbe onRender={actionsCounter.increment} />
      </TripStoreProvider>,
    )
    // انظر التعليق في الاختبار السابق — رسمتان بعد التركيب الأول متوقّعتان.
    const dataRendersAfterMount = dataCounter.get()
    const formRendersAfterMount = formCounter.get()
    const actionsRendersAfterMount = actionsCounter.get()

    act(() => {
      rerender(
        <TripStoreProvider {...props} isAdmin={true}>
          <DataProbe onRender={dataCounter.increment} />
          <FormProbe onRender={formCounter.increment} />
          <ActionsProbe onRender={actionsCounter.increment} />
        </TripStoreProvider>,
      )
    })

    expect(dataCounter.get()).toBe(dataRendersAfterMount + 1)
    expect(formCounter.get()).toBe(formRendersAfterMount)
    expect(actionsCounter.get()).toBe(actionsRendersAfterMount)
  })

  it('إعادة نفس props (لا تغيير فعلي) لا تُطلق إعادة رسم', () => {
    const dataCounter = createRenderCounter()
    const props = baseProps()

    const { rerender } = render(
      <TripStoreProvider {...props}>
        <DataProbe onRender={dataCounter.increment} />
      </TripStoreProvider>,
    )
    const rendersBefore = dataCounter.get()

    act(() => {
      rerender(
        <TripStoreProvider {...props}>
          <DataProbe onRender={dataCounter.increment} />
        </TripStoreProvider>,
      )
    })

    expect(dataCounter.get()).toBe(rendersBefore)
  })
})
