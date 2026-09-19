// 🆕 تأكيد إغلاق الشهر **خطوة داخل «هذا الشهر»** لا نافذة تحلّ محلّها. محتوى
// التأكيد مثبَّت في longterm/longTermConfirms.test.tsx؛ هنا ما يخصّ مكانه:
// نفس النافذة، والإلغاء يعود للعرض لا يُغلقها. انظر LongTermModal.tsx.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LongTermModal from './LongTermModal'

function renderModal() {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <LongTermModal
      period="2026-08" periodTotal={400} periodCount={1}
      canManage isBusy={false} hasActiveTravelers
      rollover={{
        movements: [{ travelerId: 1, travelerName: 'سعد', remaining: 800, direction: 'credit' }],
        isClosingMonth: false,
        onConfirm,
      }}
      onClose={onClose}
    />,
  )
  return { onConfirm, onClose }
}

describe('LongTermModal — تأكيد الإغلاق خطوة داخلية', () => {
  it('«إغلاق الشهر» يبدّل المحتوى إلى التأكيد في نفس النافذة، بلا إغلاقها', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /إغلاق أغسطس 2026/ }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('+800.00')).toBeInTheDocument()
    expect(document.getElementById('long-term-section')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('الإلغاء يعود لعرض الشهر، والتأكيد يستدعي onConfirm', () => {
    const { onConfirm, onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /إغلاق أغسطس 2026/ }))
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(document.getElementById('long-term-section')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /إغلاق أغسطس 2026/ }))
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإغلاق' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
