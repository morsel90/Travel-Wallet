// 🆕 الزرّ الذي لا يسجّل شيئاً أسوأ من زرّ غائب — هذا ما تحرسه هذه الاختبارات.
//
// كان «تحديد كمُحوَّل» يكتب في useState محلي: يُظلِّل السطر ويُظهر «تم التحويل ✓»
// ثم يعود كل شيء كما كان عند إعادة التحميل. فالاختبار الأول هنا ليس عن التنسيق
// بل عن العقد: الضغط يجب أن يصل إلى مُسجِّل الحركة فعلاً، وبمبلغ التسوية نفسه.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettlementsPanel } from './SettlementsPanel'
import type { Settlement, Traveler } from '../types'

const travelers: Traveler[] = [
  { id: 1, name: 'فيصل الشمري', shortName: 'فيصل', deposited: 0 },
  { id: 2, name: 'منى الدوسري', shortName: 'منى', deposited: 600 },
]

const settlement: Settlement = {
  fromId: 1, fromName: 'فيصل الشمري',
  toId: 2, toName: 'منى الدوسري',
  amount: 100,
}

const baseProps = {
  isInitialLoading: false,
  settlements: [settlement],
  travelers,
  hasExpenses: true,
}

describe('SettlementsPanel — تسجيل التحويل', () => {
  it('الضغط ثم التأكيد يُسجّل التسوية نفسها بمبلغها', async () => {
    const onRecordTransfer = vi.fn()
    render(<SettlementsPanel {...baseProps} onRecordTransfer={onRecordTransfer} />)

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل التحويل' }))
    // ⚠️ التأكيد ليس زينة: الحركة مالية لا تُتراجَع بضغطة، فلا يصحّ أن تمرّ
    // بنقرة واحدة على زرٍّ صغير في شبكة بطاقات.
    expect(onRecordTransfer).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /تأكيد تسجيل 100\.00/ }))
    expect(onRecordTransfer).toHaveBeenCalledWith(settlement)
  })

  it('الإلغاء يعيد الزرّ ولا يسجّل شيئاً', async () => {
    const onRecordTransfer = vi.fn()
    render(<SettlementsPanel {...baseProps} onRecordTransfer={onRecordTransfer} />)

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل التحويل' }))
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء' }))

    expect(onRecordTransfer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'تسجيل التحويل' })).toBeInTheDocument()
  })

  it('بلا صلاحية لا يظهر زرّ أصلاً — القراءة متاحة للجميع والتسجيل لا', () => {
    render(<SettlementsPanel {...baseProps} />)

    expect(screen.queryByRole('button', { name: 'تسجيل التحويل' })).not.toBeInTheDocument()
    // الأسماء والمبلغ تبقى معروضة: «كم أدين ولمن» هو سبب وجود القسم.
    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText('فيصل')).toBeInTheDocument()
  })

  it('أثناء التسجيل يُعطَّل زرّ تلك التسوية وحدها', () => {
    const second: Settlement = { fromId: 3, fromName: 'خالد', toId: 2, toName: 'منى الدوسري', amount: 55 }
    render(
      <SettlementsPanel
        {...baseProps}
        settlements={[settlement, second]}
        onRecordTransfer={vi.fn()}
        recordingKey="1→2"
      />,
    )

    const buttons = screen.getAllByRole('button')
    const recording = buttons.find(b => b.textContent === 'جارٍ التسجيل…')
    const idle = buttons.find(b => b.textContent === 'تسجيل التحويل')

    expect(recording).toBeDisabled()
    expect(idle).toBeEnabled()
  })
})
