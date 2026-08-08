import { describe, it, expect } from 'vitest'
import { isValidTripId, TRIP_ID, HAS_EXPLICIT_TRIP_ID } from './tripId'

// ⚠️ هذه الصيغة مكرّرة عمداً في ثلاثة أماكن: هنا، وfunctions/index.js
// (TRIP_ID_PATTERN)، وscripts/create-trip.mjs. الفحص الخادمي هو الحاجز الفعلي؛
// الفحص هنا لعرض رسالة فورية في نموذج «رحلة جديدة». أي تغيير في أحدها يجب أن
// ينعكس في الثلاثة — هذه الاختبارات تثبّت السلوك المتوقع.
describe('isValidTripId', () => {
  it('يقبل المعرّفات المعتادة', () => {
    expect(isValidTripId('travelapp-87206')).toBe(true)
    expect(isValidTripId('riyadh_2027')).toBe(true)
    expect(isValidTripId('Trip1')).toBe(true)
    expect(isValidTripId('a')).toBe(true)
  })

  it('يتجاهل المسافات المحيطة', () => {
    expect(isValidTripId('  riyadh-2027  ')).toBe(true)
  })

  it('يرفض الفارغ', () => {
    expect(isValidTripId('')).toBe(false)
    expect(isValidTripId('   ')).toBe(false)
  })

  // الحماية الأهم: المعرّف يُستخدم حرفياً كجزء من مسار مستند Firestore، فوجود
  // شرطة مائلة أو نقطتين يعني الهروب من المسار المقصود إلى مجموعة أخرى.
  it('يرفض محاولات الهروب من المسار', () => {
    expect(isValidTripId('a/b')).toBe(false)
    expect(isValidTripId('../secrets')).toBe(false)
    expect(isValidTripId('trips/x')).toBe(false)
    expect(isValidTripId('.')).toBe(false)
  })

  it('يرفض المسافات والرموز الخاصة والعربية', () => {
    expect(isValidTripId('my trip')).toBe(false)
    expect(isValidTripId('trip#1')).toBe(false)
    expect(isValidTripId('رحلة')).toBe(false)
    expect(isValidTripId('trip.2027')).toBe(false)
  })

  it('يحترم حدّ 64 محرفاً', () => {
    expect(isValidTripId('a'.repeat(64))).toBe(true)
    expect(isValidTripId('a'.repeat(65))).toBe(false)
  })

  it('يرفض سطراً جديداً مضمّناً', () => {
    expect(isValidTripId('ok\nbad')).toBe(false)
  })
})

// 🆕 كلاهما يُحسب مرة واحدة عند تحميل الوحدة من نفس المصدر (الرابط)، فلا يمكن
// تغييرهما داخل الاختبار بعد الاستيراد. بيئة Vitest بلا `?trip=` — أي أن الحالة
// المرصودة هنا هي بالضبط حالة «فتح التطبيق مجرّداً»: الرحلة الافتراضية، وعَلَم
// صريح بأن المستخدم لم يقصد رحلة بعينها (وهي الحالة التي تعرض شاشة «رحلاتي»).
describe('TRIP_ID / HAS_EXPLICIT_TRIP_ID', () => {
  it('يرجع للرحلة الافتراضية حين لا يذكر الرابط رحلة', () => {
    expect(TRIP_ID).toBe('travelapp-87206')
  })

  it('يعلن صراحةً أن الرحلة لم تُذكر في الرابط', () => {
    expect(HAS_EXPLICIT_TRIP_ID).toBe(false)
  })

  it('TRIP_ID نفسه يبقى معرّفاً صالحاً دائماً', () => {
    expect(isValidTripId(TRIP_ID)).toBe(true)
  })
})
