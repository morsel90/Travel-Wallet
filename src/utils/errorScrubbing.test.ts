import { describe, it, expect } from 'vitest'
import type { ErrorEvent, Breadcrumb } from '@sentry/react'
import { scrubEvent, scrubBreadcrumb } from './errorScrubbing'

// اختبار على دوال بحتة بمُدخلات جزئية عمداً — Sentry نفسها لا تستدعي هذه
// الدوال إلا بكائنات كاملة الشكل، لكن التنقية لا تهتم إلا بالحقول المذكورة.
const ev = (partial: Partial<ErrorEvent>) => partial as ErrorEvent
const bc = (partial: Partial<Breadcrumb>) => partial as Breadcrumb

describe('scrubEvent', () => {
  it('يحذف سياق المستخدم كاملاً', () => {
    const event = ev({ user: { id: 'u1', email: 'a@b.com' } })
    expect(scrubEvent(event).user).toBeUndefined()
  })

  it('يحذف تفاصيل الطلب كاملة', () => {
    const event = ev({ request: { url: 'https://x.com?token=secret' } })
    expect(scrubEvent(event).request).toBeUndefined()
  })

  it('ينقّي حقول extra الحساسة على المستوى العلوي', () => {
    const event = ev({ extra: { email: 'a@b.com', description: 'عشاء فاخر', amount: 250 } })
    expect(scrubEvent(event).extra).toEqual({
      email: '[محذوف]',
      description: '[محذوف]',
      amount: 250,
    })
  })

  it('ينقّي bankDetails المتداخل تكرارياً', () => {
    const event = ev({
      extra: {
        bankDetails: { bankName: 'بنك الرياض', beneficiary: 'أحمد الغامدي', iban: 'SA0000000000000000000000' },
      },
    })
    expect(scrubEvent(event).extra).toEqual({ bankDetails: '[محذوف]' })
  })

  it('ينقّي مصفوفة كائنات تكرارياً (مثال: قائمة مسافرين)', () => {
    const event = ev({
      extra: {
        travelers: [
          { id: 1, name: 'أحمد', deposited: 500 },
          { id: 2, name: 'سعد', deposited: 300 },
        ],
      },
    })
    expect(scrubEvent(event).extra).toEqual({
      travelers: [
        { id: 1, name: '[محذوف]', deposited: 500 },
        { id: 2, name: '[محذوف]', deposited: 300 },
      ],
    })
  })

  it('يُبقي الحقول غير الحساسة كما هي', () => {
    const event = ev({ extra: { code: 'permission-denied', retryable: false, count: 3 } })
    expect(scrubEvent(event).extra).toEqual({ code: 'permission-denied', retryable: false, count: 3 })
  })

  it('لا ينهار على extra فارغ أو غائب', () => {
    expect(scrubEvent(ev({}))).toEqual({})
    expect(scrubEvent(ev({ extra: {} })).extra).toEqual({})
  })
})

describe('scrubBreadcrumb', () => {
  it('ينقّي بيانات الأثر الحساسة', () => {
    const breadcrumb = bc({ category: 'fetch', data: { email: 'a@b.com', status: 403 } })
    expect(scrubBreadcrumb(breadcrumb)).toEqual({
      category: 'fetch',
      data: { email: '[محذوف]', status: 403 },
    })
  })

  it('يُبقي الأثر بلا data كما هو', () => {
    const breadcrumb = bc({ category: 'navigation' })
    expect(scrubBreadcrumb(breadcrumb)).toEqual({ category: 'navigation' })
  })
})
