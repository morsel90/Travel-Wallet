// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { callableErrorCode, callableMessage, describeInviteError } from './callableErrors'

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

// 🆕 الشكل هنا منقول حرفياً عمّا يُعيده SDK فايربيس 12.19 فعلاً — قِيس باستدعاء
// حقيقي بلا تسجيل دخول: «يجب تسجيل الدخول أولاً. [401]».
const fnErr = (code: string, message: string) => Object.assign(new Error(message), { code })

describe('callableMessage', () => {
  it('يُسقط رمز HTTP الذي يُلحقه SDK بنهاية الرسالة', () => {
    expect(callableMessage(fnErr('functions/unauthenticated', 'يجب تسجيل الدخول أولاً. [401]')))
      .toBe('يجب تسجيل الدخول أولاً.')
    expect(callableMessage(fnErr('functions/failed-precondition', 'لا يمكن حذف "Bh26" قبل تسوية حساباتها. [400]')))
      .toBe('لا يمكن حذف "Bh26" قبل تسوية حساباتها.')
  })

  it('يترك الرسالة بلا لاحقة كما هي', () => {
    expect(callableMessage(fnErr('functions/not-found', 'الرحلة غير موجودة.'))).toBe('الرحلة غير موجودة.')
  })

  it('لا يمسّ أقواساً معقوفة داخل النص — اللاحقة وحدها في النهاية', () => {
    expect(callableMessage(fnErr('functions/internal', 'الحقل [amount] غير صالح [400]'))).toBe('الحقل [amount] غير صالح')
  })

  it('خطأ ليس من دالة سحابية لا يُعرض نصّه — يذهب إلى معالج الشبكة العام', () => {
    expect(callableMessage(Object.assign(new Error('x'), { code: 'permission-denied' }))).toBeNull()
    expect(callableMessage(new Error('boom'))).toBeNull()
    expect(callableMessage(null)).toBeNull()
  })

  it('رسالة فارغة بعد إسقاط اللاحقة ليست رسالة', () => {
    expect(callableMessage(fnErr('functions/internal', '[500]'))).toBeNull()
  })
})
