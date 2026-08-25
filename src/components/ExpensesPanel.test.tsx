// 🆕 اختبار موضع «سلة المهملات» بعد نقلها إلى نهاية سجلّ المصاريف.
//
// ⚠️ ما يُختبر هنا ليس الشكل بل **الحالة التي كان النقل سيكسرها**: مسؤول حذف
// آخر مصروف في الرحلة، فحلّت شاشة «لا توجد مصاريف بعد» محلّ القائمة. لو كانت
// السلة داخل القائمة (أو في تذييل Virtuoso) لاختفى طريق التراجع في اللحظة التي
// وقع فيها الخطأ بالضبط. القاعدة ١٧.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpensesPanel } from './ExpensesPanel'

const noop = () => {}
const baseProps = {
  isInitialLoading: false,
  isAdmin: true,
  canAddExpenses: true,
  activeExpenses: [],
  filteredExpenses: [],
  searchQuery: '',
  setSearchQuery: noop,
  sortOrder: 'date_desc' as const,
  setSortOrder: noop,
  onOpenReports: noop,
  onOpenTrashBin: noop,
  onOpenExpenseForm: noop,
}

describe('ExpensesPanel — سلة المهملات', () => {
  it('تبقى ظاهرة حين لا يوجد أي مصروف نشِط — حالة «حُذف آخر مصروف»', async () => {
    const onOpenTrashBin = vi.fn()
    render(<ExpensesPanel {...baseProps} onOpenTrashBin={onOpenTrashBin} />)

    // الشاشة الفارغة معروضة فعلاً — أي أننا في الحالة المقصودة لا في قائمة.
    expect(screen.getByText('لا توجد مصاريف بعد')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'سلة المهملات' }))
    expect(onOpenTrashBin).toHaveBeenCalledTimes(1)
  })

  it('لا تظهر لغير المسؤول — الاستعادة محكومة بـ isAdmin في القواعد', () => {
    render(<ExpensesPanel {...baseProps} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: 'سلة المهملات' })).not.toBeInTheDocument()
  })

  it('لا تظهر أثناء التحميل الأولي — لا سجلّ بعد ليُستعاد منه', () => {
    render(<ExpensesPanel {...baseProps} isInitialLoading />)
    expect(screen.queryByRole('button', { name: 'سلة المهملات' })).not.toBeInTheDocument()
  })
})
