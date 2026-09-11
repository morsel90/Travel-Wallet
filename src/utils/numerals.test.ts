// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { toWesternDigits, sanitizeAmountInput } from './numerals'

describe('toWesternDigits', () => {
  it('يحوّل الأرقام العربية-الهندية إلى غربية', () => {
    expect(toWesternDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890')
  })

  it('يترك ما ليس رقماً كما هو — لا يُصفّي', () => {
    expect(toWesternDigits('مبلغ ٥٠ ريال')).toBe('مبلغ 50 ريال')
  })
})

describe('sanitizeAmountInput', () => {
  it('يحوّل ويُسقط كل ما ليس رقماً أو نقطة', () => {
    expect(sanitizeAmountInput('50.5 ريال')).toBe('50.5')
  })

  // ⚠️ حارس انحدار مالي: كان «٥٠٫٥» يصير 505 — انظر تعليق الدالة.
  it('يقرأ الفاصلة العشرية العربية (٫) كنقطة لا كحرف يُسقَط', () => {
    expect(sanitizeAmountInput('٥٠٫٥')).toBe('50.5')
  })

  it('يبقي نقطة عشرية واحدة مهما تكرّرت', () => {
    expect(sanitizeAmountInput('1.2.3.4')).toBe('1.234')
  })

  it('يعيد نصاً فارغاً لإدخال بلا أرقام — لا NaN ولا صفر مُخترع', () => {
    expect(sanitizeAmountInput('abc')).toBe('')
  })
})
