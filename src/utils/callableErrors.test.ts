import { describe, it, expect } from 'vitest'
import { callableErrorCode, describeCallableError, describeInviteError } from './callableErrors'

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

// 🆕 نظير describeCallableError لمسار joinViaInvite (رابط الدعوة بنقرة واحدة) —
// نفس الأسباب البيئية بالضبط، لكن نص حالة الرمز/الافتراضي يخصّ الروابط لا الرمز
// اليدوي. انظر functions/index.js: joinViaInvite.
describe('describeInviteError', () => {
  it('permission-denied ⇒ رسالة رابط دعوة، لا رسالة رمز الرحلة', () => {
    const d = describeInviteError(err('functions/permission-denied'))
    expect(d.kind).toBe('input')
    expect(d.text).toContain('رابط الدعوة')
    expect(d.text).not.toContain('رمز الرحلة')
  })

  it('كود غير معروف يسقط إلى نفس رسالة الرابط الباطل، لا رسالة الرمز', () => {
    const d = describeInviteError(err('functions/weird-new-code'))
    expect(d.text).toContain('رابط الدعوة')
  })

  it.each([
    ['functions/unauthenticated', 'مانع إعلانات'],
    ['functions/unavailable', 'اتصالك'],
    ['functions/not-found', 'غير متاحة'],
    ['functions/internal', 'خطأ في الخادم'],
  ])('%s ⇒ نفس الأسباب البيئية المشتركة مع describeCallableError', (code, fragment) => {
    const invite = describeInviteError(err(code))
    const pin = describeCallableError(err(code))
    expect(invite).toEqual(pin) // الأسباب البيئية موحّدة — لا فرق بين المسارين هنا
    expect(invite.text).toContain(fragment)
  })

  // ⚠️ توكن غير موجود وتوكن مُبطَل يصلان بنفس الكود — نفس كتمان verifyTripPin
  // (رمز خاطئ ورحلة غير موجودة)، انظر comment في manageInvite/joinViaInvite.
  it('«توكن غير موجود» و«توكن مُبطَل» رسالة واحدة لا تفرّق بينهما', () => {
    const missing = describeInviteError(err('functions/permission-denied'))
    const revoked = describeInviteError(err('functions/permission-denied'))
    expect(missing).toEqual(revoked)
  })
})
