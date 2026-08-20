import { describe, it, expect } from 'vitest'
import { callableErrorCode, describeInviteError } from './callableErrors'

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

describe('describeInviteError', () => {
  it('permission-denied ⇒ رسالة رابط دعوة، والسبب في المدخلات', () => {
    const d = describeInviteError(err('functions/permission-denied'))
    expect(d.kind).toBe('input')
    expect(d.text).toContain('رابط الدعوة')
  })

  // ⚠️ هذه هي الحالة التي أرسلت تشخيص عطل 2026-08-13 في الاتجاه الخاطئ.
  it('unauthenticated ⇒ رسالة تخصّ البيئة وتذكر مانع الإعلانات صراحةً', () => {
    const d = describeInviteError(err('functions/unauthenticated'))
    expect(d.kind).toBe('environment')
    expect(d.text).not.toContain('رابط الدعوة')
    // ذِكر الامتداد ليس تجميلاً: هو السبب الفعلي والوحيد الذي يُصلحه المستخدم بنفسه
    expect(d.text).toContain('مانع إعلانات')
  })

  it.each([
    ['functions/unavailable', 'اتصالك'],
    ['functions/deadline-exceeded', 'اتصالك'],
    ['functions/not-found', 'غير متاحة'],
    ['functions/internal', 'خطأ في الخادم'],
  ])('%s ⇒ سبب بيئي مسمّى لا رسالة رابط باطل', (code, fragment) => {
    const d = describeInviteError(err(code))
    expect(d.kind).toBe('environment')
    expect(d.text).toContain(fragment)
    expect(d.text).not.toContain('رابط الدعوة')
  })

  // 🆕 joinViaInvite ترفض الجلسات المجهولة صراحةً (لا رمز رحلة بعد الآن، انظر
  // docs/DECISIONS.md) — الرسالة يجب أن تفسّر السبب الحقيقي (يلزم حساب حقيقي)
  // لا أن تسقط على رسالة "الرابط باطل" المضلّلة.
  it('failed-precondition ⇒ يطلب تسجيل الدخول بحساب حقيقي صراحةً', () => {
    const d = describeInviteError(err('functions/failed-precondition'))
    expect(d.kind).toBe('input')
    expect(d.text).toContain('حساباً حقيقياً')
    expect(d.text).not.toContain('رابط الدعوة غير صالح')
  })

  it('كود غير معروف يسقط إلى نفس رسالة الرابط الباطل', () => {
    const d = describeInviteError(err('functions/weird-new-code'))
    expect(d.text).toContain('رابط الدعوة')
  })

  // ⚠️ اختبار أمني لا اختبار صياغة: توكن غير موجود وتوكن مُبطَل يصلان بنفس
  // الكود من manageInvite/joinViaInvite، حتى لا يُكتشف وجود رابط صالح بالتخمين.
  it('«توكن غير موجود» و«توكن مُبطَل» رسالة واحدة لا تفرّق بينهما', () => {
    const missing = describeInviteError(err('functions/permission-denied'))
    const revoked = describeInviteError(err('functions/permission-denied'))
    expect(missing).toEqual(revoked)
  })
})
