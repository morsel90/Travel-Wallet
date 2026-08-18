import { describe, it, expect, beforeEach } from 'vitest'
import { markUidChanged, consumeUidChangedNotice } from './mergeNotice'

beforeEach(() => {
  sessionStorage.clear()
})

describe('mergeNotice', () => {
  it('لا شيء يُستهلَك قبل markUidChanged', () => {
    expect(consumeUidChangedNotice()).toBe(false)
  })

  it('markUidChanged ثم consumeUidChangedNotice تُعيد true مرة واحدة', () => {
    markUidChanged()
    expect(consumeUidChangedNotice()).toBe(true)
  })

  // ⚠️ الحالة السالبة الحاكمة: الملاحظة تُستهلَك مرة واحدة فقط. بدونها يُعاد
  // عرض التوست عند كل إعادة رسم لاحقة للمكوّن، لا مرة واحدة بعد الربط فقط.
  it('الاستهلاك الثاني يُعيد false — العلم يُحذف فور قراءته', () => {
    markUidChanged()
    expect(consumeUidChangedNotice()).toBe(true)
    expect(consumeUidChangedNotice()).toBe(false)
  })

  it('sessionStorage معطوب لا يُسقط الاستدعاء (وضع تصفّح خاص صارم)', () => {
    const original = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('blocked') },
    })

    expect(() => markUidChanged()).not.toThrow()
    expect(consumeUidChangedNotice()).toBe(false)

    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original })
  })
})
