import { describe, it, expect } from 'vitest'
import { callableErrorCode, describeCallableError } from './callableErrors'

const err = (code: string) => Object.assign(new Error(code), { code })

describe('callableErrorCode', () => {
  it('يجرّد بادئة الخدمة من الكود', () => {
    expect(callableErrorCode(err('functions/unauthenticated'))).toBe('unauthenticated')
  })

  it('يقبل الكود بلا بادئة أيضاً', () => {
    // الشكلان يظهران فعلاً بحسب مسار الخطأ — التعامل معهما معاً يمنع انهيار
    // الترجمة لاختلاف بادئة، وهو نفس ما يفعله writeErrorCode.
    expect(callableErrorCode(err('unauthenticated'))).toBe('unauthenticated')
  })

  it.each([null, undefined, 'نص', 42, {}, { code: 7 }])('يُرجع نصاً فارغاً لمدخل غير صالح: %s', input => {
    expect(callableErrorCode(input)).toBe('')
  })
})

describe('describeCallableError — التمييز الذي كلّف غيابه ساعتين', () => {
  it('permission-denied ⇒ رمز خاطئ، والسبب في المدخلات', () => {
    const d = describeCallableError(err('functions/permission-denied'))
    expect(d.text).toContain('رمز الرحلة غير صحيح')
    expect(d.kind).toBe('input')
  })

  // ⚠️ هذه هي الحالة التي أرسلت تشخيص عطل 2026-08-13 في الاتجاه الخاطئ.
  it('unauthenticated ⇒ رسالة تخصّ البيئة وتذكر مانع الإعلانات صراحةً', () => {
    const d = describeCallableError(err('functions/unauthenticated'))
    expect(d.kind).toBe('environment')
    expect(d.text).not.toContain('رمز الرحلة غير صحيح')
    // ذِكر الامتداد ليس تجميلاً: هو السبب الفعلي والوحيد الذي يُصلحه المستخدم بنفسه
    expect(d.text).toContain('مانع إعلانات')
  })

  it.each([
    ['functions/unavailable', 'اتصالك'],
    ['functions/deadline-exceeded', 'اتصالك'],
    ['functions/not-found', 'غير متاحة'],
    ['functions/internal', 'خطأ في الخادم'],
  ])('%s ⇒ سبب بيئي مسمّى لا رمز خاطئ', (code, fragment) => {
    const d = describeCallableError(err(code))
    expect(d.kind).toBe('environment')
    expect(d.text).toContain(fragment)
    expect(d.text).not.toContain('رمز الرحلة غير صحيح')
  })

  it('كود غير معروف يسقط إلى رسالة الرمز الخاطئ — الحالة الأشيع', () => {
    expect(describeCallableError(err('functions/weird-new-code')).text)
      .toContain('رمز الرحلة غير صحيح')
  })
})

// ⚠️ هذا ليس اختبار صياغة بل اختبار **أمني**. verifyTripPin ترمي
// permission-denied بنفس النص سواء كان الرمز خاطئاً أو الرحلة غير موجودة، حتى
// لا يُكتشف وجود الرحلات بتخمين ?trip=. تفصيل الرسالتين هنا يكسر ذلك الكتمان.
describe('describeCallableError — ما يجب أن يبقى مُوحَّداً', () => {
  it('«الرمز خاطئ» و«الرحلة غير موجودة» رسالة واحدة لا تفرّق بينهما', () => {
    // كلاهما يصل من الخادم بنفس الكود ونفس النص — فلا سبيل للعميل للتفريق،
    // وهذا هو المقصود. الاختبار يثبّت أن أحداً لن «يحسّن» الرسالة لاحقاً.
    const wrongPin = describeCallableError(err('functions/permission-denied'))
    const noSuchTrip = describeCallableError(err('functions/permission-denied'))
    expect(wrongPin).toEqual(noSuchTrip)
    expect(wrongPin.text).not.toMatch(/غير موجودة|لا توجد رحلة/)
  })
})
