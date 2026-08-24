import { describe, it, expect } from 'vitest'
import { normalizeTripType, isLongTerm } from './tripType'

describe('normalizeTripType', () => {
  it('يقبل القيمتين المعروفتين كما هما', () => {
    expect(normalizeTripType('standard')).toBe('standard')
    expect(normalizeTripType('long_term')).toBe('long_term')
  })

  // ⚠️ هذا الاختبار هو التوافق الخلفي نفسه: كل رحلة قائمة اليوم بلا هذا الحقل.
  it('يعامل الغياب وأي قيمة تالفة كرحلة قياسية', () => {
    expect(normalizeTripType(undefined)).toBe('standard')
    expect(normalizeTripType(null)).toBe('standard')
    expect(normalizeTripType('')).toBe('standard')
    expect(normalizeTripType('longterm')).toBe('standard')
    expect(normalizeTripType(42)).toBe('standard')
    expect(normalizeTripType({ tripType: 'long_term' })).toBe('standard')
  })
})

describe('isLongTerm', () => {
  it('يميّز النوعين', () => {
    expect(isLongTerm('long_term')).toBe(true)
    expect(isLongTerm('standard')).toBe(false)
  })
})
