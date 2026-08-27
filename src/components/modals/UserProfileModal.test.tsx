import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UserProfileModal from './UserProfileModal'
import type { UserProfile } from '../../types'

const onSave = vi.fn().mockResolvedValue(undefined)
const onClose = vi.fn()

const bankProfile: UserProfile = {
  displayName: 'أحمد',
  bankDetails: { paymentType: 'bank', bankName: 'بنك الرياض', beneficiary: 'أحمد', iban: 'SA00 0000' },
}

const walletProfile: UserProfile = {
  displayName: 'سارة',
  bankDetails: { paymentType: 'wallet', bankName: '', beneficiary: '', iban: '', walletName: 'stc pay', walletPhone: '0512345678' },
}

beforeEach(() => { vi.clearAllMocks() })

describe('UserProfileModal — نوع الدفع', () => {
  it('يفتح افتراضياً على تبويب الحساب البنكي حين paymentType هو bank أو غائب', () => {
    render(<UserProfileModal profile={bankProfile} isSaving={false} onSave={onSave} onClose={onClose} />)
    expect(screen.getByLabelText('اسم البنك')).toHaveValue('بنك الرياض')
    expect(screen.queryByLabelText('اسم المحفظة')).not.toBeInTheDocument()
  })

  it('يفتح على تبويب المحفظة حين paymentType هو wallet', () => {
    render(<UserProfileModal profile={walletProfile} isSaving={false} onSave={onSave} onClose={onClose} />)
    expect(screen.getByLabelText('اسم المحفظة')).toHaveValue('stc pay')
    expect(screen.getByLabelText('رقم الجوال')).toHaveValue('0512345678')
    expect(screen.queryByLabelText('اسم البنك')).not.toBeInTheDocument()
  })

  it('التبديل من بنك إلى محفظة يُظهر حقول المحفظة ويُخفي حقول البنك', () => {
    render(<UserProfileModal profile={bankProfile} isSaving={false} onSave={onSave} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /محفظة رقمية/ }))
    expect(screen.getByLabelText('اسم المحفظة')).toBeInTheDocument()
    expect(screen.queryByLabelText('اسم البنك')).not.toBeInTheDocument()
  })

  it('الحفظ من تبويب المحفظة يرسل paymentType: wallet وحقولها، مع حذف مسافات رقم الجوال', async () => {
    render(<UserProfileModal profile={{ displayName: 'م' }} isSaving={false} onSave={onSave} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /محفظة رقمية/ }))
    fireEvent.change(screen.getByLabelText('اسم المحفظة'), { target: { value: 'برق' } })
    fireEvent.change(screen.getByLabelText('رقم الجوال'), { target: { value: '05 12 34 56 78' } })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({
      displayName: 'م',
      bankDetails: {
        paymentType: 'wallet',
        bankName: '', beneficiary: '', iban: '',
        walletName: 'برق', walletPhone: '0512345678',
      },
    })
  })

  it('الحفظ من تبويب البنك يرسل paymentType: bank ويحذف مسافات الآيبان', async () => {
    render(<UserProfileModal profile={bankProfile} isSaving={false} onSave={onSave} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({
      displayName: 'أحمد',
      bankDetails: {
        paymentType: 'bank',
        bankName: 'بنك الرياض', beneficiary: 'أحمد', iban: 'SA000000',
        walletName: '', walletPhone: '',
      },
    })
  })
})
