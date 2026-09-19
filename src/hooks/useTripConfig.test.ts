// @vitest-environment jsdom
// 🆕 «محذوفة» تُقرأ من الخادم وحده — هذا ما يحرسه الملف.
//
// الخطأ في اتجاه «محذوفة» يطرد المستخدم من رحلته الحقيقية (لقطة كاش بلا
// اتصال لم تحمل المستند بعد)، والخطأ في الاتجاه الآخر يُبقي شاشة تحميل. فلا
// تُعلَن «محذوفة» إلا من لقطة خادم تقول «غير موجود».
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

type Listener = (snap: { exists: () => boolean; data: () => unknown; metadata: { fromCache: boolean } }) => void
const h = vi.hoisted(() => ({ listener: null as Listener | null, options: null as unknown }))

vi.mock('firebase/firestore', () => ({
  onSnapshot: (_ref: unknown, options: unknown, next: Listener) => {
    h.options = options
    h.listener = next
    return () => {}
  },
}))
vi.mock('../firestore', () => ({ tripConfigDoc: () => ({}) }))

import { useTripConfig } from './useTripConfig'

const missing = (fromCache: boolean) => ({ exists: () => false, data: () => undefined, metadata: { fromCache } })

beforeEach(() => { h.listener = null; h.options = null })

describe('useTripConfig — deleted', () => {
  it('لقطة كاش «غير موجود» لا تُعلن الحذف', () => {
    const { result } = renderHook(() => useTripConfig({ uid: 'u' } as never))
    act(() => h.listener!(missing(true)))
    expect(result.current.deleted).toBe(false)
  })

  it('تأكيد الخادم «غير موجود» يُعلنه', () => {
    const { result } = renderHook(() => useTripConfig({ uid: 'u' } as never))
    act(() => h.listener!(missing(true)))
    act(() => h.listener!(missing(false)))
    expect(result.current.deleted).toBe(true)
  })

  it('المستمع يطلب تغيّرات الـmetadata — وإلا لا يصل تأكيد الخادم أبداً', () => {
    renderHook(() => useTripConfig({ uid: 'u' } as never))
    expect(h.options).toEqual({ includeMetadataChanges: true })
  })

  it('رحلة موجودة ليست محذوفة', () => {
    const { result } = renderHook(() => useTripConfig({ uid: 'u' } as never))
    act(() => h.listener!({ exists: () => true, data: () => ({ name: 'بولندا' }), metadata: { fromCache: false } }))
    expect(result.current.deleted).toBe(false)
    expect(result.current.tripName).toBe('بولندا')
  })
})
