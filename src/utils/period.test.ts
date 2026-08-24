import { describe, it, expect } from 'vitest'
import {
  isValidPeriodKey, normalizePeriodKey, currentPeriodKey, shiftPeriod,
  nextPeriod, previousPeriod, periodStartDate, periodEndDate, isInPeriod, formatPeriodLabel,
} from './period'

describe('isValidPeriodKey', () => {
  it('يقبل YYYY-MM بشهر ضمن المدى', () => {
    expect(isValidPeriodKey('2026-01')).toBe(true)
    expect(isValidPeriodKey('2026-12')).toBe(true)
  })

  it('يرفض الشهر خارج المدى والصيغ الأخرى', () => {
    expect(isValidPeriodKey('2026-00')).toBe(false)
    expect(isValidPeriodKey('2026-13')).toBe(false)
    expect(isValidPeriodKey('2026-1')).toBe(false)
    expect(isValidPeriodKey('2026-08-01')).toBe(false)
    expect(isValidPeriodKey('')).toBe(false)
    expect(isValidPeriodKey(202608)).toBe(false)
    expect(isValidPeriodKey(undefined)).toBe(false)
  })
})

describe('normalizePeriodKey', () => {
  it('يُبقي المفتاح الصالح كما هو', () => {
    expect(normalizePeriodKey('2026-03', new Date(2026, 7, 15))).toBe('2026-03')
  })

  // التوافق الخلفي: رحلة حُوِّلت للتو إلى long_term بلا حقل currentPeriod.
  it('يسقط للشهر الجاري عند الغياب أو الفساد', () => {
    const now = new Date(2026, 7, 15)   // أغسطس 2026 (getMonth صفري)
    expect(normalizePeriodKey(undefined, now)).toBe('2026-08')
    expect(normalizePeriodKey('2026-13', now)).toBe('2026-08')
    expect(normalizePeriodKey(null, now)).toBe('2026-08')
  })
})

describe('currentPeriodKey', () => {
  it('يبني المفتاح من التوقيت المحلي مع تصفير الشهر', () => {
    expect(currentPeriodKey(new Date(2026, 0, 1))).toBe('2026-01')
    expect(currentPeriodKey(new Date(2026, 11, 31))).toBe('2026-12')
  })

  // ⚠️ الحارس ضد الانزلاق لـ UTC: منتصف ليل أول الشهر بتوقيت الجهاز يجب أن
  // يقع في الشهر الجديد لا في السابق — وهو بالضبط ما يكسره new Date(iso) بـ UTC.
  it('أول لحظة في الشهر محلياً تنتمي للشهر الجديد', () => {
    expect(currentPeriodKey(new Date(2026, 8, 1, 0, 0, 0))).toBe('2026-09')
  })
})

describe('shiftPeriod', () => {
  it('يتجاوز حدود السنة في الاتجاهين', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01')
    expect(previousPeriod('2026-01')).toBe('2025-12')
    expect(shiftPeriod('2026-08', 5)).toBe('2027-01')
    expect(shiftPeriod('2026-08', -8)).toBe('2025-12')
    expect(shiftPeriod('2026-08', 0)).toBe('2026-08')
  })

  it('يعيد المفتاح غير الصالح كما هو بدل اختراع شهر', () => {
    expect(shiftPeriod('غير صالح', 1)).toBe('غير صالح')
    expect(shiftPeriod('2026-08', NaN)).toBe('2026-08')
  })
})

describe('periodStartDate / periodEndDate', () => {
  it('يبني حدود الشهر بصيغة Expense.date', () => {
    expect(periodStartDate('2026-08')).toBe('2026-08-01')
    expect(periodEndDate('2026-08')).toBe('2026-08-31')
    expect(periodEndDate('2026-04')).toBe('2026-04-30')
  })

  it('يحسب فبراير الكبيس والعادي', () => {
    expect(periodEndDate('2024-02')).toBe('2024-02-29')
    expect(periodEndDate('2026-02')).toBe('2026-02-28')
  })
})

describe('isInPeriod', () => {
  it('يطابق البادئة النصية لا التاريخ المحوَّل', () => {
    expect(isInPeriod('2026-08-01', '2026-08')).toBe(true)
    expect(isInPeriod('2026-08-31', '2026-08')).toBe(true)
    expect(isInPeriod('2026-09-01', '2026-08')).toBe(false)
    expect(isInPeriod('2026-07-31', '2026-08')).toBe(false)
  })

  it('يعتبر التاريخ التالف خارج أي شهر بلا رمي استثناء', () => {
    expect(isInPeriod(undefined, '2026-08')).toBe(false)
    expect(isInPeriod(null, '2026-08')).toBe(false)
    expect(isInPeriod(20260801, '2026-08')).toBe(false)
    expect(isInPeriod('', '2026-08')).toBe(false)
  })
})

describe('formatPeriodLabel', () => {
  it('يسمّي الشهر بالعربية مع السنة', () => {
    expect(formatPeriodLabel('2026-01')).toBe('يناير 2026')
    expect(formatPeriodLabel('2026-08')).toBe('أغسطس 2026')
    expect(formatPeriodLabel('2026-12')).toBe('ديسمبر 2026')
  })

  it('يعيد المفتاح غير الصالح كما هو', () => {
    expect(formatPeriodLabel('2026-13')).toBe('2026-13')
  })
})
