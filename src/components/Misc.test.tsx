import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BankDetailsCard } from './Misc'
import type { BankDetails } from '../types'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText } })
})

const bank: BankDetails = { paymentType: 'bank', bankName: 'بنك الرياض', beneficiary: 'أحمد', iban: 'SA0000000000000000000000' }
const wallet: BankDetails = { paymentType: 'wallet', bankName: '', beneficiary: '', iban: '', walletName: 'stc pay', walletPhone: '0512345678' }

describe('BankDetailsCard — نوع الدفع بنك', () => {
  it('يعرض اسم البنك والآيبان المُنسَّق، ولا يعرض حقول المحفظة', () => {
    render(<BankDetailsCard bankDetails={bank} />)
    expect(screen.getByText('بنك الرياض')).toBeInTheDocument()
    expect(screen.getByText('SA00 0000 0000 0000 0000 0000')).toBeInTheDocument()
    expect(screen.queryByText('رقم الجوال')).not.toBeInTheDocument()
  })

  it('نسخ الآيبان يزيل المسافات', async () => {
    render(<BankDetailsCard bankDetails={bank} />)
    fireEvent.click(screen.getByTitle('نسخ الآيبان'))
    expect(writeText).toHaveBeenCalledWith('SA0000000000000000000000')
    await screen.findByText('تم النسخ')
  })
})

describe('BankDetailsCard — نوع الدفع محفظة رقمية', () => {
  it('يعرض اسم المحفظة ورقم الجوال، ولا يعرض حقول البنك', () => {
    render(<BankDetailsCard bankDetails={wallet} />)
    expect(screen.getByText('stc pay')).toBeInTheDocument()
    expect(screen.getByText('0512345678')).toBeInTheDocument()
    expect(screen.queryByText('رقم الآيبان (IBAN)')).not.toBeInTheDocument()
    expect(screen.queryByText('المستفيد')).not.toBeInTheDocument()
  })

  it('نسخ رقم الجوال ينسخ القيمة الخام', async () => {
    render(<BankDetailsCard bankDetails={wallet} />)
    fireEvent.click(screen.getByTitle('نسخ رقم الجوال'))
    expect(writeText).toHaveBeenCalledWith('0512345678')
    await screen.findByText('تم النسخ')
  })
})

describe('BankDetailsCard — حالات فارغة/تحميل (بلا تغيير)', () => {
  it('لا بيانات: رسالة فارغة واضحة', () => {
    render(<BankDetailsCard bankDetails={null} />)
    expect(screen.getByText('لا تتوفر بيانات بنك بعد')).toBeInTheDocument()
  })

  it('جارٍ التحميل: مؤشر تحميل', () => {
    render(<BankDetailsCard bankDetails={null} isLoading />)
    expect(screen.getByText('جارٍ جلب بيانات الحساب...')).toBeInTheDocument()
  })
})
