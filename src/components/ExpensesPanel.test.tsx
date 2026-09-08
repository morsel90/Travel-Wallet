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

  it('الحالة الفارغة تقود إلى تسجيل أول مصروف — الفعل الوحيد الباقي في القسم', async () => {
    const onOpenExpenseForm = vi.fn()
    render(<ExpensesPanel {...baseProps} onOpenExpenseForm={onOpenExpenseForm} />)

    expect(screen.getByText('لا توجد مصاريف بعد')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /سجّل أول مصروف/ }))
    expect(onOpenExpenseForm).toHaveBeenCalledTimes(1)
  })

  it('رحلة مغلقة: لا زرّ تسجيل — النص يشرح أنها أُغلقت لا أنها لم تبدأ', () => {
    render(<ExpensesPanel {...baseProps} canAddExpenses={false} />)
    expect(screen.getByText('لا توجد مصاريف في هذه الرحلة')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /سجّل أول مصروف/ })).not.toBeInTheDocument()
  })
})
