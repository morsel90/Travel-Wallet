import { describe, it, expect } from 'vitest'
import { deriveShortName, isValidNameKey, newTravelerId } from './travelerName'

describe('deriveShortName', () => {
  it('يأخذ أول كلمة', () => {
    expect(deriveShortName('أحمد الغامدي')).toBe('أحمد')
    expect(deriveShortName('محمد')).toBe('محمد')
  })

  it('يتجاهل المسافات المحيطة', () => {
    expect(deriveShortName('   سعد المطيري  ')).toBe('سعد')
  })

  // القسمة على ' ' وحدها كانت تُنتج اسماً فارغاً مع مسافات متتالية، وهي شائعة
  // في الأسماء المنسوخة من رسالة أو جهة اتصال.
  it('يتعامل مع المسافات المتتالية', () => {
    expect(deriveShortName('أحمد    الغامدي')).toBe('أحمد')
  })

  it('يتعامل مع المسافات غير المعتادة (tab / سطر جديد)', () => {
    expect(deriveShortName('أحمد\tالغامدي')).toBe('أحمد')
    expect(deriveShortName('أحمد\nالغامدي')).toBe('أحمد')
  })

  it('يُرجع نصاً فارغاً للمدخل الفارغ', () => {
    expect(deriveShortName('')).toBe('')
    expect(deriveShortName('    ')).toBe('')
  })
})

describe('isValidNameKey', () => {
  it('يقبل الأسماء المعتادة', () => {
    expect(isValidNameKey('أحمد')).toBe(true)
    expect(isValidNameKey('Mohammed')).toBe(true)
    expect(isValidNameKey('عبدالله')).toBe(true)
  })

  it('يرفض الفارغ', () => {
    expect(isValidNameKey('')).toBe(false)
  })

  // الشرطة المائلة تفصل مقاطع المسار في Firestore، فاسم يحويها يُنشئ مستنداً
  // في موضع مختلف كلياً بدل أن يفشل — وهو أسوأ من الرفض الصريح.
  it('يرفض الشرطة المائلة', () => {
    expect(isValidNameKey('a/b')).toBe(false)
    expect(isValidNameKey('/')).toBe(false)
  })

  it('يرفض النقطة والنقطتين', () => {
    expect(isValidNameKey('.')).toBe(false)
    expect(isValidNameKey('..')).toBe(false)
  })

  it('يقبل نقطة داخل الاسم', () => {
    expect(isValidNameKey('A.B')).toBe(true)
  })

  it('يرفض النمط المحجوز __x__', () => {
    expect(isValidNameKey('__proto__')).toBe(false)
    expect(isValidNameKey('__name__')).toBe(false)
  })

  // الحدّ بالبايتات لا بالمحارف: الحرف العربي بايتان في UTF-8، فـ 800 حرف
  // عربي = 1600 بايت وتتجاوز الحدّ رغم أن عدد المحارف أقل منه.
  it('يحسب الحدّ بالبايتات لا بالمحارف', () => {
    expect(isValidNameKey('ا'.repeat(750))).toBe(true)
    expect(isValidNameKey('ا'.repeat(751))).toBe(false)
    expect(isValidNameKey('a'.repeat(1500))).toBe(true)
    expect(isValidNameKey('a'.repeat(1501))).toBe(false)
  })
})

describe('newTravelerId', () => {
  it('يُنتج عدداً صحيحاً موجباً ضمن مدى int', () => {
    for (let i = 0; i < 100; i++) {
      const id = newTravelerId()
      expect(Number.isInteger(id)).toBe(true)
      expect(id > 0).toBe(true)
      expect(id < 2_147_483_647).toBe(true)
    }
  })

  it('لا يكرّر عملياً', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newTravelerId()))
    expect(ids.size).toBe(500)
  })
})
