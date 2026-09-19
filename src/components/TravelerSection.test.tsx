// 🆕 زرّ الحذف في بطاقة المسافر يتفرّع بحسب نوع الرحلة **هنا** لا في المتجر:
// القياسية تحذف حذفاً ليّناً، والطويلة تفتح ملف المسافر على قسم الخروج مباشرةً.
// ⚠️ الضغطة الواحدة هي المحروسة: المالك سأل يوماً «أين حذف مسافر أراد
// المغادرة؟» — فلا يجوز أن يبتعد الخروج خطوة عن البطاقة. انظر docs/DECISIONS.md.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TripStoreProvider } from '../store/TripStoreProvider'
import { TravelerCard, type LongTermExitProps } from './TravelerSection'
import type { TravelerBalance } from '../types'

vi.mock('../hooks/useDepositLogs', () => ({ useDepositLogs: () => ({ logs: [], error: false }) }))

const mona: TravelerBalance = { id: 3, name: 'منى', shortName: 'منى', deposited: 0, totalExpenses: 0, remaining: 0 }

function renderCard(longTermExit?: LongTermExitProps) {
  const requestDeleteTraveler = vi.fn()
  render(
    <TripStoreProvider
      travelers={[mona]} expenses={[]} repayments={[]} user={null} isAdmin isOrganizer={false}
      currencies={{}}
      startEditExpense={() => {}} requestDeleteExpense={() => {}}
      requestDeleteTraveler={requestDeleteTraveler} submitDeposit={() => true}
    >
      <TravelerCard traveler={mona} longTermExit={longTermExit} />
    </TripStoreProvider>,
  )
  return { requestDeleteTraveler }
}

const longTerm = (over: Partial<LongTermExitProps> = {}): LongTermExitProps => ({
  canManage: true, isBusy: false, isExiting: false, organizerUid: null,
  onConfirmExit: vi.fn(async () => true), ...over,
})

describe('TravelerCard — زرّ الحذف', () => {
  it('الرحلة القياسية: حذف ليّن مباشر، بلا فتح أي ملف', () => {
    const { requestDeleteTraveler } = renderCard()
    fireEvent.click(screen.getByTitle('حذف المسافر'))
    expect(requestDeleteTraveler).toHaveBeenCalledWith(mona)
    expect(screen.queryByRole('button', { name: 'إخراج' })).not.toBeInTheDocument()
  })

  it('الرحلة الطويلة: ضغطة واحدة تفتح الملف وتأكيد الخروج ظاهر — لا حذف', () => {
    const { requestDeleteTraveler } = renderCard(longTerm())
    fireEvent.click(screen.getByTitle('حذف المسافر'))
    expect(requestDeleteTraveler).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'إخراج' })).toBeInTheDocument()
  })

  it('نجاح الخروج يُغلق الملف، وفشله يُبقيه على التأكيد', async () => {
    const failing = longTerm({ onConfirmExit: vi.fn(async () => false) })
    renderCard(failing)
    fireEvent.click(screen.getByTitle('حذف المسافر'))
    fireEvent.click(screen.getByRole('button', { name: 'إخراج' }))
    await waitFor(() => expect(failing.onConfirmExit).toHaveBeenCalledWith(3, false))
    expect(screen.getByRole('button', { name: 'إخراج' })).toBeInTheDocument()
  })

  it('نجاح الخروج يُغلق الملف', async () => {
    const ok = longTerm()
    renderCard(ok)
    fireEvent.click(screen.getByTitle('حذف المسافر'))
    fireEvent.click(screen.getByRole('button', { name: 'إخراج' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'إخراج' })).not.toBeInTheDocument())
  })

  it('فتح الملف بالضغط على البطاقة بعدها لا يبدأ على التأكيد', async () => {
    renderCard(longTerm())
    fireEvent.click(screen.getByTitle('حذف المسافر'))
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    // إغلاق الملف ثم فتحه من البطاقة نفسها
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق ملف المسافر' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'إخراج من الرحلة' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('منى'))
    expect(screen.getByRole('button', { name: 'إخراج من الرحلة' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إخراج' })).not.toBeInTheDocument()
  })
})
