import { describe, it, expect } from 'vitest'
import {
  normalizeTripStatus, acceptsExpenses, acceptsWrites, closedTripNotice,
  isEligibleForAgePurge, TRIP_PURGE_ELIGIBLE_MS,
} from './tripStatus'

// ⚠️ هذه الدوال تعكس القواعد في firestore.rules (tripAcceptsExpenses/
// tripAcceptsWrites). أي تغيير هنا بلا تغيير مطابق هناك يجعل الواجهة تعد بشيء
// يرفضه الخادم — أو تمنع شيئاً يسمح به. هذه الاختبارات تثبّت الدلالة المشتركة.
describe('normalizeTripStatus', () => {
  it('يقبل الحالات الثلاث المعرَّفة', () => {
    expect(normalizeTripStatus('active')).toBe('active')
    expect(normalizeTripStatus('completed')).toBe('completed')
    expect(normalizeTripStatus('archived')).toBe('archived')
  })

  // التوافق الخلفي: كل رحلة أُنشئت قبل هذه الميزة بلا الحقل. لو عوملت كغير نشطة
  // لتجمّدت كل الرحلات القائمة فور النشر — نفس المبدأ المطبَّق في القواعد.
  it('يعامل غياب القيمة كـ active', () => {
    expect(normalizeTripStatus(undefined)).toBe('active')
    expect(normalizeTripStatus(null)).toBe('active')
  })

  it('يعامل أي قيمة غير متوقّعة كـ active بدل أن يرمي', () => {
    expect(normalizeTripStatus('frozen')).toBe('active')
    expect(normalizeTripStatus(42)).toBe('active')
    expect(normalizeTripStatus({})).toBe('active')
  })
})

describe('acceptsExpenses', () => {
  it('النشطة وحدها تقبل المصاريف', () => {
    expect(acceptsExpenses('active')).toBe(true)
    expect(acceptsExpenses('completed')).toBe(false)
    expect(acceptsExpenses('archived')).toBe(false)
  })
})

describe('acceptsWrites', () => {
  it('المؤرشفة وحدها تمنع بقية الكتابات — المنتهية تُبقيها لتسوية الحسابات', () => {
    expect(acceptsWrites('active')).toBe(true)
    expect(acceptsWrites('completed')).toBe(true)
    expect(acceptsWrites('archived')).toBe(false)
  })
})

describe('closedTripNotice', () => {
  it('لا رسالة للرحلة النشطة', () => {
    expect(closedTripNotice('active')).toBeNull()
  })

  it('رسالة المنتهية تذكر أن التقارير وتعديل الأرصدة تبقى متاحة', () => {
    const notice = closedTripNotice('completed')
    expect(notice).toContain('منتهية')
    expect(notice).toContain('التقارير')
  })

  it('رسالة المؤرشفة تذكر أنها للاطّلاع فقط', () => {
    const notice = closedTripNotice('archived')
    expect(notice).toContain('مؤرشفة')
  })
})

describe('isEligibleForAgePurge', () => {
  const now = new Date('2026-08-22T00:00:00Z').getTime()

  it('مؤرشفة منذ أكثر من مدة السماح — مؤهّلة', () => {
    const changedAt = now - TRIP_PURGE_ELIGIBLE_MS - 1000
    expect(isEligibleForAgePurge('archived', changedAt, now)).toBe(true)
  })

  it('مؤرشفة منذ أقل من مدة السماح — غير مؤهّلة بعد', () => {
    const changedAt = now - TRIP_PURGE_ELIGIBLE_MS + 1000
    expect(isEligibleForAgePurge('archived', changedAt, now)).toBe(false)
  })

  it('active أو completed لا تُؤهَّل أبداً بصرف النظر عن statusChangedAt', () => {
    const veryOld = now - 10 * TRIP_PURGE_ELIGIBLE_MS
    expect(isEligibleForAgePurge('active', veryOld, now)).toBe(false)
    expect(isEligibleForAgePurge('completed', veryOld, now)).toBe(false)
  })

  it('مؤرشفة بلا statusChangedAt (رحلة لم تُلمَس منذ هذه الميزة) — غير مؤهّلة أبداً', () => {
    expect(isEligibleForAgePurge('archived', undefined, now)).toBe(false)
  })
})
