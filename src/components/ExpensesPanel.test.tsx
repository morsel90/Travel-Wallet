// 🆕 سجلّ المصاريف بعد أن صار القسم الأول في الشاشة الرئيسية.
//
// ⚠️ الضمانة التي كان يحرسها هذا الملف (بقاء «سلة المهملات» ظاهرة حين يحذف
// المسؤول آخر مصروف) انتقلت مع السلة نفسها إلى MoreMenu.test.tsx — موضعها
// الجديد في الهيدر لا يعتمد على حالة القائمة إطلاقاً. ما يُختبر هنا الآن هو
// الوجه الآخر من النقل: ألّا تعود نقطة دخول مكرَّرة إلى هذا القسم بصمت.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpensesPanel } from './ExpensesPanel'

const noop = () => {}
const baseProps = {
  isInitialLoading: false,
  canAddExpenses: true,
  activeExpenses: [],
  filteredExpenses: [],
  searchQuery: '',
  setSearchQuery: noop,
  sortOrder: 'date_desc' as const,
  setSortOrder: noop,
  onOpenExpenseForm: noop,
}

describe('ExpensesPanel — نقاط الدخول', () => {
  it('لا زرّ تقارير ولا سلة مهملات هنا — كلاهما خلف «المزيد» في الهيدر', () => {
    render(<ExpensesPanel {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'التقارير' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'سلة المهملات' })).not.toBeInTheDocument()
  })

  it('الحالة الفارغة تقود إلى إضافة مصروف — الفعل الوحيد الباقي في القسم', async () => {
    const onOpenExpenseForm = vi.fn()
    render(<ExpensesPanel {...baseProps} onOpenExpenseForm={onOpenExpenseForm} />)

    expect(screen.getByText('لا توجد مصاريف بعد')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /إضافة مصروف/ }))
    expect(onOpenExpenseForm).toHaveBeenCalledTimes(1)
  })

  it('رحلة مغلقة: لا زرّ إضافة — العنوان يقول «في هذه الرحلة» لا «بعد»', () => {
    render(<ExpensesPanel {...baseProps} canAddExpenses={false} />)
    expect(screen.getByText('لا توجد مصاريف في هذه الرحلة')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة مصروف/ })).not.toBeInTheDocument()
  })
})

// 🆕 السجلّ يُقصّ إلى آخر المصاريف كي لا يدفع «أرصدة المسافرين» إلى قاع الصفحة.
// (react-virtuoso لا يرسم صفوفاً في jsdom، فالمُختبَر هو زرّ القصّ وحده.)
describe('ExpensesPanel — قصّ السجلّ', () => {
  const makeExpenses = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) as unknown as typeof baseProps.activeExpenses

  it('أكثر من 10 مصاريف: زرّ «عرض الكل» بالعدد، ويتبدّل إلى «عرض أقل»', async () => {
    const list = makeExpenses(15)
    render(<ExpensesPanel {...baseProps} activeExpenses={list} filteredExpenses={list} />)

    await userEvent.click(screen.getByRole('button', { name: /عرض كل المصاريف \(15\)/ }))
    expect(screen.getByRole('button', { name: /عرض أقل/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('10 مصاريف أو أقل: لا زرّ', () => {
    const list = makeExpenses(10)
    render(<ExpensesPanel {...baseProps} activeExpenses={list} filteredExpenses={list} />)
    expect(screen.queryByRole('button', { name: /عرض كل المصاريف/ })).not.toBeInTheDocument()
  })

  it('البحث يتجاوز القصّ — من يبحث يريد كل النتائج', () => {
    const list = makeExpenses(15)
    render(<ExpensesPanel {...baseProps} activeExpenses={list} filteredExpenses={list} searchQuery="قهوة" />)
    expect(screen.queryByRole('button', { name: /عرض كل المصاريف/ })).not.toBeInTheDocument()
  })
})
