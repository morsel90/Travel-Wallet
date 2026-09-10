import { describe, it, expect } from 'vitest'
import { guessCategory, FALLBACK_CATEGORY } from './categoryGuess'
import { EXPENSE_CATEGORIES } from '../constants'

describe('guessCategory — اشتقاق الفئة من الوصف', () => {
  it('يشتق الفئات الشائعة من كلمة واحدة', () => {
    expect(guessCategory('عشاء')).toBe('طعام وشراب')
    expect(guessCategory('بنزين')).toBe('مواصلات')
    expect(guessCategory('فندق')).toBe('إقامة')
    expect(guessCategory('متحف')).toBe('أنشطة وترفيه')
    expect(guessCategory('هدايا')).toBe('تسوق')
  })

  it('يتجاهل التشكيل واختلاف الألف والتاء المربوطة والياء', () => {
    expect(guessCategory('إقامة في فُندق')).toBe('إقامة')
    expect(guessCategory('مقهى الصباح')).toBe('طعام وشراب')
    expect(guessCategory('شقه مفروشه')).toBe('إقامة')
  })

  it('يجد الكلمة داخل جملة كاملة وبأي حالة أحرف لاتينية', () => {
    expect(guessCategory('عشاء في مطعم إيطالي')).toBe('طعام وشراب')
    expect(guessCategory('Uber to the airport')).toBe('مواصلات')
  })

  it('يفوز المفتاح الأطول عند تطابق أكثر من فئة', () => {
    // "سوبرماركت" (طعام وشراب) أطول وأدقّ من "سوق" (تسوق) داخل النص نفسه
    expect(guessCategory('سوبرماركت')).toBe('طعام وشراب')
  })

  it('يُرجع "أخرى" حين لا يتطابق شيء أو يكون الوصف فارغاً', () => {
    expect(guessCategory('')).toBe(FALLBACK_CATEGORY)
    expect(guessCategory('   ')).toBe(FALLBACK_CATEGORY)
    expect(guessCategory('حاجة غريبة')).toBe(FALLBACK_CATEGORY)
    expect(FALLBACK_CATEGORY).toBe('أخرى')
  })

  it('لا يُرجع أبداً فئة خارج EXPENSE_CATEGORIES', () => {
    const samples = ['عشاء', 'تاكسي', 'فندق', 'سينما', 'مول', 'xyz', '']
    samples.forEach(s => expect(EXPENSE_CATEGORIES).toContain(guessCategory(s)))
  })
})
