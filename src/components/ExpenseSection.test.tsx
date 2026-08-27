// 🆕 يغطي التبديل بين ملخّص «موزّع بالتساوي على الجميع» وكبسولات الحصص الكاملة
// في ExpenseListItem — القائمة الطويلة لا تضيف معلومة حين يشارك الجميع بالتساوي،
// لكنها ضرورية حين يُستثنى أحدهم أو تُخصَّص الحصص. انظر utils/calculations.ts.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TripStoreProvider } from '../store/TripStoreProvider'
import { ExpenseListItem } from './ExpenseSection'
import type { Traveler, Expense, ExpenseFormData } from '../types'

const travelers: Traveler[] = [
  { id: 1, name: 'محمد', shortName: 'محمد', deposited: 0 },
  { id: 2, name: 'سعد', shortName: 'سعد', deposited: 0 },
  { id: 3, name: 'خالد', shortName: 'خالد', deposited: 0 },
]

const baseExpense: Expense = {
  id: 'e1', date: '2026-08-26', description: 'عشاء', amount: 90,
  originalAmount: 90, currency: 'SAR', exchangeRate: 1,
  participants: [1, 2, 3], createdAt: Date.now(),
}

const baseExpenseForm: ExpenseFormData = {
  date: '2026-08-26', description: '', amount: '', currency: 'SAR', exchangeRate: '1',
  participants: [], category: 'مطاعم', splitMode: 'equal', shares: {}, paidBy: 'fund',
}

function renderItem(expense: Expense) {
  return render(
    <TripStoreProvider
      travelers={travelers} expenses={[expense]} user={null} isAdmin={false}
      currencies={{}} ratesUpdatedAt={null}
      cancelExpenseForm={() => {}} startEditExpense={() => {}} requestDeleteExpense={() => {}}
      openDeposit={() => {}} requestDeleteTraveler={() => {}} openDepositHistory={() => {}}
      expenseForm={baseExpenseForm} setExpenseForm={() => {}}
      isExpenseFormOpen={false} isEditingExpense={false}
      submitExpense={() => {}} toggleParticipant={() => {}} toggleAllParticipants={() => {}}
    >
      <ExpenseListItem expense={expense} />
    </TripStoreProvider>,
  )
}

describe('ExpenseListItem — عرض توزيع الحصص', () => {
  it('يعرض ملخّصاً واحداً حين يشارك كل المسافرين النشطين بالتساوي', () => {
    renderItem(baseExpense)
    expect(screen.getByText('موزّع بالتساوي على الجميع (3)')).toBeInTheDocument()
    expect(screen.queryByText('توزيع الحصص:')).not.toBeInTheDocument()
    expect(screen.queryByText('محمد')).not.toBeInTheDocument()
  })

  it('يعرض الكبسولات الكاملة حين يُستثنى أحد المسافرين', () => {
    renderItem({ ...baseExpense, participants: [1, 2] })
    expect(screen.getByText('توزيع الحصص:')).toBeInTheDocument()
    expect(screen.getByText('محمد')).toBeInTheDocument()
    expect(screen.getByText('سعد')).toBeInTheDocument()
    expect(screen.queryByText(/موزّع بالتساوي على الجميع/)).not.toBeInTheDocument()
  })

  it('يعرض الكبسولات الكاملة حين تكون الحصص مخصَّصة رغم مشاركة الجميع', () => {
    renderItem({ ...baseExpense, shares: { '1': 2, '2': 1, '3': 1 } })
    expect(screen.getByText('توزيع الحصص:')).toBeInTheDocument()
    expect(screen.queryByText(/موزّع بالتساوي على الجميع/)).not.toBeInTheDocument()
  })
})
