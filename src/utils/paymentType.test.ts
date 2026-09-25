import { describe, it, expect } from 'vitest'
import { looksLikeWallet } from './paymentType'

describe('looksLikeWallet', () => {
  it('يلتقط المحافظ الشائعة بالعربية والإنجليزية', () => {
    expect(looksLikeWallet('برق')).toBe(true)
    expect(looksLikeWallet('Barq')).toBe(true)
    expect(looksLikeWallet('STC Pay')).toBe(true)
    expect(looksLikeWallet('urpay')).toBe(true)
    expect(looksLikeWallet('محفظة')).toBe(true)
  })

  it('لا ينبّه على البنوك', () => {
    expect(looksLikeWallet('مصرف الراجحي')).toBe(false)
    expect(looksLikeWallet('البنك الأهلي')).toBe(false)
    expect(looksLikeWallet('SNB')).toBe(false)
    expect(looksLikeWallet('STC Bank')).toBe(false)
    expect(looksLikeWallet('')).toBe(false)
  })
})
