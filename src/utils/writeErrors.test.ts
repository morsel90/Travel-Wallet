import { describe, it, expect } from 'vitest'
import { writeErrorCode, isRetryableCode, describeWriteError } from './writeErrors'

const fbError = (code: string) => Object.assign(new Error('firestore error'), { code })

describe('writeErrorCode', () => {
  it('يقرأ الكود المباشر', () => {
    expect(writeErrorCode(fbError('permission-denied'))).toBe('permission-denied')
  })

  // بعض المسارات تُرجع الكود مسبوقاً بالخدمة — الشكلان يجب أن يُترجما سواءً
  it('يُسقط بادئة الخدمة', () => {
    expect(writeErrorCode(fbError('firestore/permission-denied'))).toBe('permission-denied')
  })

  it('يُرجع نصاً فارغاً لما ليس خطأ Firestore', () => {
    expect(writeErrorCode(new Error('عادي'))).toBe('')
    expect(writeErrorCode(null)).toBe('')
    expect(writeErrorCode('نص')).toBe('')
    expect(writeErrorCode({ code: 42 })).toBe('')
  })
})

describe('isRetryableCode', () => {
  it('العوارض المؤقتة قابلة لإعادة المحاولة', () => {
    expect(isRetryableCode('unavailable')).toBe(true)
    expect(isRetryableCode('deadline-exceeded')).toBe(true)
    expect(isRetryableCode('aborted')).toBe(true)
  })

  // إعادة المحاولة على رفض منطقي تفشل بنفس الطريقة كل مرة، فعرض الزر تضليل
  it('الرفض المنطقي غير قابل لإعادة المحاولة', () => {
    expect(isRetryableCode('permission-denied')).toBe(false)
    expect(isRetryableCode('invalid-argument')).toBe(false)
    expect(isRetryableCode('resource-exhausted')).toBe(false)
  })
})

describe('describeWriteError', () => {
  it('الصلاحيات: سبب واضح بلا زر إعادة محاولة', () => {
    const d = describeWriteError(fbError('permission-denied'), 'create')
    expect(d.retryable).toBe(false)
    expect(d.text).toMatch('الصلاحية')
  })

  it('حد المعدّل: يطلب التمهّل ولا يعيد المحاولة', () => {
    const d = describeWriteError(fbError('resource-exhausted'), 'create')
    expect(d.retryable).toBe(false)
    expect(d.text).toMatch('الحد المسموح')
  })

  it('انقطاع مؤقت: يعرض إعادة المحاولة', () => {
    const d = describeWriteError(fbError('unavailable'), 'create')
    expect(d.retryable).toBe(true)
  })

  it('انتهاء الجلسة يطلب إعادة التحميل', () => {
    expect(describeWriteError(fbError('unauthenticated'), 'edit').text).toMatch('أعد تحميل')
  })

  // ⚠️ جوهر الإصلاح: الرسالة القديمة كانت تقول «يبدو أنك غير متصل بالإنترنت»
  // لكل خطأ. الكتابة دون اتصال لا تُرفض أصلاً (تبقى معلّقة في IndexedDB)، فذكر
  // الاتصال هنا يوجّه المستخدم لفحص شبكته بينما السبب رفض من الخادم.
  it('لا يذكر انقطاع الاتصال في أي رسالة', () => {
    const codes = [
      'permission-denied', 'resource-exhausted', 'already-exists', 'not-found',
      'invalid-argument', 'failed-precondition', 'unauthenticated', 'unavailable',
      'aborted', 'internal', 'كود-مجهول',
    ]
    for (const code of codes) {
      expect(describeWriteError(fbError(code), 'create').text).not.toMatch('غير متصل')
    }
  })

  it('يذكر أن التغيير لم يثبت بصياغة تناسب العملية', () => {
    expect(describeWriteError(fbError('permission-denied'), 'create').text).toMatch('لم يُسجَّل')
    expect(describeWriteError(fbError('permission-denied'), 'edit').text).toMatch('لم تُحفظ')
    expect(describeWriteError(fbError('permission-denied'), 'delete').text).toMatch('لم يُحذف')
    expect(describeWriteError(fbError('permission-denied'), 'restore').text).toMatch('لم تتم الاستعادة')
  })

  it('الكود المجهول يُعامل بحذر: بلا ادّعاء سبب، ومع إعادة محاولة', () => {
    const d = describeWriteError(fbError('something-new'), 'generic')
    expect(d.retryable).toBe(true)
    expect(d.text).toMatch('تعذّر إتمام العملية')
  })

  it('يتعامل مع خطأ بلا كود إطلاقاً', () => {
    const d = describeWriteError(new Error('عادي'), 'create')
    expect(d.text).toMatch('تعذّر إتمام العملية')
  })
})
