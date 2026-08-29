import { describe, it, expect } from 'vitest'
import {
  toStoredTime, toInputTime, validateDraft, draftToSegment, segmentToDraft,
  isRenderableSegment, normalizeItinerary, findNextSegment, newSegmentId,
  emptySegmentDraft, tripEndTime, tripRouteSummary, deriveTripType,
} from './itinerary'
import type { SegmentDraft } from './itinerary'
import type { ItinerarySegment } from '../types'

const validDraft = (over: Partial<SegmentDraft> = {}): SegmentDraft => ({
  id: 'abc123',
  mode: 'flight',
  identifier: 'QR 1155',
  reference: '8L2HTY',
  departureLocation: 'الدمام',
  departureTime: '2026-07-21T22:30',
  arrivalLocation: 'الدوحة',
  arrivalTime: '2026-07-21T23:35',
  ...over,
})

const segment = (id: string, depTime: string): ItinerarySegment => ({
  id,
  mode: 'flight',
  identifier: `QR ${id}`,
  departure: { location: 'أ', time: depTime },
  arrival: { location: 'ب', time: depTime },
})

describe('toStoredTime / toInputTime', () => {
  it('يضيف الثواني لقيمة datetime-local', () => {
    expect(toStoredTime('2026-07-21T22:30')).toBe('2026-07-21T22:30:00')
  })

  it('لا يضيف ثوانٍ إن كانت موجودة أصلاً', () => {
    expect(toStoredTime('2026-07-21T22:30:45')).toBe('2026-07-21T22:30:45')
  })

  it('يتعامل مع القيمة الفارغة', () => {
    expect(toStoredTime('')).toBe('')
    expect(toInputTime('')).toBe('')
  })

  it('يقصّ الثواني عند العودة للنموذج', () => {
    expect(toInputTime('2026-07-21T22:30:00')).toBe('2026-07-21T22:30')
  })

  it('ذهاب وعودة بلا فقد', () => {
    const stored = toStoredTime('2026-07-21T22:30')
    expect(toInputTime(stored)).toBe('2026-07-21T22:30')
  })

  // الوقت يُخزَّن محلياً بلا منطقة زمنية عمداً — إضافة Z كانت ستزحزح كل
  // الأوقات المعروضة بمقدار فارق التوقيت عن الوقت المكتوب في تذكرة الطيران.
  it('لا يضيف منطقة زمنية للقيمة المخزَّنة', () => {
    expect(toStoredTime('2026-07-21T22:30')).not.toMatch(/[Zz+]/)
  })
})

describe('validateDraft', () => {
  it('يقبل مسوّدة كاملة', () => {
    expect(validateDraft(validDraft())).toBeNull()
  })

  it('يرفض غياب رقم الرحلة', () => {
    expect(validateDraft(validDraft({ identifier: '   ' }))).toMatch(/رقم الرحلة/)
  })

  it('يرفض غياب مكان الانطلاق أو الوصول', () => {
    expect(validateDraft(validDraft({ departureLocation: '' }))).toMatch(/الانطلاق/)
    expect(validateDraft(validDraft({ arrivalLocation: '' }))).toMatch(/الوصول/)
  })

  it('يرفض غياب الأوقات', () => {
    expect(validateDraft(validDraft({ departureTime: '' }))).toMatch(/وقت الانطلاق/)
    expect(validateDraft(validDraft({ arrivalTime: '' }))).toMatch(/وقت الوصول/)
  })

  it('يرفض وصولاً قبل الانطلاق', () => {
    const d = validDraft({ departureTime: '2026-07-21T22:30', arrivalTime: '2026-07-21T20:00' })
    expect(validateDraft(d)).toMatch(/قبل وقت الانطلاق/)
  })

  it('يقبل وصولاً مساوياً للانطلاق', () => {
    const d = validDraft({ departureTime: '2026-07-21T22:30', arrivalTime: '2026-07-21T22:30' })
    expect(validateDraft(d)).toBeNull()
  })

  it('يقبل رحلة تعبر منتصف الليل', () => {
    const d = validDraft({ departureTime: '2026-07-21T23:30', arrivalTime: '2026-07-22T01:15' })
    expect(validateDraft(d)).toBeNull()
  })

  it('يرفض وصفاً أطول من الحد', () => {
    expect(validateDraft(validDraft({ identifier: 'x'.repeat(81) }))).toMatch(/طويل/)
  })
})

describe('draftToSegment', () => {
  it('يقصّ المسافات ويحوّل الأوقات', () => {
    const seg = draftToSegment(validDraft({ identifier: '  QR 1155  ', departureLocation: ' الدمام ' }))
    expect(seg.identifier).toBe('QR 1155')
    expect(seg.departure.location).toBe('الدمام')
    expect(seg.departure.time).toBe('2026-07-21T22:30:00')
  })

  // Firestore يرفض undefined، ووجود المفتاح بقيمة فارغة يظهر كشارة PNR فارغة
  // في واجهة العرض — لذا نُسقط المفتاح كلياً بدل كتابته فارغاً.
  it('يُسقط حقل الحجز إن كان فارغاً بدل كتابته فارغاً', () => {
    const seg = draftToSegment(validDraft({ reference: '   ' }))
    expect('reference' in seg).toBe(false)
  })

  it('يبقي حقل الحجز إن وُجد', () => {
    expect(draftToSegment(validDraft()).reference).toBe('8L2HTY')
  })

  it('ذهاب وعودة عبر segmentToDraft يحفظ القيم', () => {
    const seg = draftToSegment(validDraft())
    const back = segmentToDraft(seg)
    expect(back.identifier).toBe('QR 1155')
    expect(back.departureTime).toBe('2026-07-21T22:30')
    expect(back.reference).toBe('8L2HTY')
  })

  it('segmentToDraft يحوّل غياب الحجز إلى نص فارغ', () => {
    const seg = draftToSegment(validDraft({ reference: '' }))
    expect(segmentToDraft(seg).reference).toBe('')
  })
})

describe('isRenderableSegment', () => {
  it('يقبل مقطعاً سليماً', () => {
    expect(isRenderableSegment(segment('1', '2026-07-21T22:30:00'))).toBe(true)
  })

  it('يرفض القيم غير الكائنية', () => {
    expect(isRenderableSegment(null)).toBe(false)
    expect(isRenderableSegment('نص')).toBe(false)
    expect(isRenderableSegment(42)).toBe(false)
  })

  it('يرفض وسيلة تنقل غير معروفة', () => {
    expect(isRenderableSegment({ ...segment('1', '2026-01-01T00:00:00'), mode: 'rocket' })).toBe(false)
  })

  it('يرفض مقطعاً بلا وقت انطلاق', () => {
    const broken = { ...segment('1', '2026-01-01T00:00:00'), departure: { location: 'أ' } }
    expect(isRenderableSegment(broken)).toBe(false)
  })
})

describe('normalizeItinerary', () => {
  it('يُرجع قائمة فارغة لغير المصفوفات', () => {
    expect(normalizeItinerary(undefined)).toEqual([])
    expect(normalizeItinerary({ a: 1 })).toEqual([])
  })

  it('يرتّب زمنياً تصاعدياً حسب وقت الانطلاق', () => {
    const out = normalizeItinerary([
      segment('c', '2026-08-06T17:40:00'),
      segment('a', '2026-07-21T22:30:00'),
      segment('b', '2026-07-22T02:00:00'),
    ])
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  // القواعد تتحقق فقط من أن itinerary قائمة بحدّ أقصى 50 — لا من بنية عناصرها
  // (قيد لغة القواعد). المقطع التالف يجب أن يختفي لا أن يُسقط الواجهة.
  it('يُسقط المقاطع التالفة ويُبقي السليمة', () => {
    const out = normalizeItinerary([
      segment('ok', '2026-07-21T22:30:00'),
      { id: 'broken', mode: 'flight' },
      null,
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('ok')
  })

  it('لا يعدّل المصفوفة الأصلية', () => {
    const input = [segment('b', '2026-08-01T00:00:00'), segment('a', '2026-07-01T00:00:00')]
    normalizeItinerary(input)
    expect(input.map(s => s.id)).toEqual(['b', 'a'])
  })
})

describe('findNextSegment', () => {
  const list = normalizeItinerary([
    segment('past',   '2026-07-01T10:00:00'),
    segment('future', '2026-09-01T10:00:00'),
    segment('later',  '2026-10-01T10:00:00'),
  ])

  it('يُرجع أول مقطع قادم فقط', () => {
    const now = new Date('2026-08-01T00:00:00').getTime()
    expect(findNextSegment(list, now)?.id).toBe('future')
  })

  it('يُرجع null إن كانت كل المقاطع في الماضي', () => {
    const now = new Date('2027-01-01T00:00:00').getTime()
    expect(findNextSegment(list, now)).toBeNull()
  })

  it('يُرجع null لقائمة فارغة', () => {
    expect(findNextSegment([], Date.now())).toBeNull()
  })
})

describe('tripEndTime', () => {
  const segmentWithArrival = (id: string, depTime: string, arrTime: string): ItinerarySegment => ({
    id,
    mode: 'flight',
    identifier: `QR ${id}`,
    departure: { location: 'أ', time: depTime },
    arrival: { location: 'ب', time: arrTime },
  })

  it('يُرجع null لمسار فارغ', () => {
    expect(tripEndTime([])).toBeNull()
  })

  it('يُرجع وقت وصول المقطع الوحيد', () => {
    const one = [segmentWithArrival('a', '2026-07-01T10:00:00', '2026-07-01T14:00:00')]
    expect(tripEndTime(one)).toBe(new Date('2026-07-01T14:00:00').getTime())
  })

  it('يُرجع وصول آخر مقطع زمنياً (بترتيب الانطلاق)، لا أول عنصر في المصفوفة', () => {
    // بلا ترتيب مسبق عمداً — normalizeItinerary داخل tripEndTime هي ما يرتّب.
    const unsorted = [
      segmentWithArrival('later',  '2026-09-01T10:00:00', '2026-09-01T14:00:00'),
      segmentWithArrival('first',  '2026-07-01T10:00:00', '2026-07-01T14:00:00'),
      segmentWithArrival('middle', '2026-08-01T10:00:00', '2026-08-01T14:00:00'),
    ]
    expect(tripEndTime(unsorted)).toBe(new Date('2026-09-01T14:00:00').getTime())
  })

  it('يتجاهل مقاطع تالفة عبر normalizeItinerary (نفس فلترة findNextSegment)', () => {
    const withGarbage = [
      segmentWithArrival('valid', '2026-07-01T10:00:00', '2026-07-01T14:00:00'),
      { id: 'broken' } as unknown as ItinerarySegment,
    ]
    expect(tripEndTime(withGarbage)).toBe(new Date('2026-07-01T14:00:00').getTime())
  })

  it('يُرجع null لمدخل غير مصفوفة (undefined، نص، إلخ)', () => {
    expect(tripEndTime(undefined)).toBeNull()
    expect(tripEndTime('not-an-array')).toBeNull()
  })
})

describe('tripRouteSummary', () => {
  const seg = (id: string, depTime: string, arrTime: string, from: string, to: string): ItinerarySegment => ({
    id,
    mode: 'flight',
    identifier: `QR ${id}`,
    departure: { location: from, time: depTime },
    arrival: { location: to, time: arrTime },
  })

  it('يُرجع null لمسار فارغ أو مدخل غير مصفوفة', () => {
    expect(tripRouteSummary([])).toBeNull()
    expect(tripRouteSummary(undefined)).toBeNull()
  })

  it('يبني الملخّص من أول انطلاق وآخر وصول (بترتيب الانطلاق لا ترتيب المصفوفة)', () => {
    const unsorted = [
      seg('later', '2026-09-01T10:00:00', '2026-09-01T14:00:00', 'دبي', 'طوكيو'),
      seg('first', '2026-07-01T10:00:00', '2026-07-01T14:00:00', 'الرياض', 'دبي'),
    ]
    expect(tripRouteSummary(unsorted)).toEqual({
      start: '2026-07-01T10:00:00',
      end: '2026-09-01T14:00:00',
      fromLocation: 'الرياض',
      toLocation: 'طوكيو',
    })
  })

  it('يتجاهل مقاطع تالفة عبر normalizeItinerary', () => {
    const withGarbage = [
      seg('valid', '2026-07-01T10:00:00', '2026-07-01T14:00:00', 'أ', 'ب'),
      { id: 'broken' } as unknown as ItinerarySegment,
    ]
    expect(tripRouteSummary(withGarbage)).toEqual({
      start: '2026-07-01T10:00:00', end: '2026-07-01T14:00:00', fromLocation: 'أ', toLocation: 'ب',
    })
  })
})

describe('deriveTripType', () => {
  const seg = (dep: string, arr: string): ItinerarySegment => ({
    id: 's', mode: 'flight', identifier: 'QR 1',
    departure: { location: 'أ', time: dep }, arrival: { location: 'ب', time: arr },
  })

  it('يبقي standard إن كان المسار 14 يوماً أو أقل', () => {
    const exactly14 = [seg('2026-07-01T10:00:00', '2026-07-15T10:00:00')]
    expect(deriveTripType('standard', exactly14)).toBe('standard')
  })

  it('يرقّي إلى long_term إن تجاوز المسار 14 يوماً', () => {
    const over14 = [seg('2026-07-01T10:00:00', '2026-07-15T10:00:01')]
    expect(deriveTripType('standard', over14)).toBe('long_term')
  })

  it('يبقي standard بلا مسار على الإطلاق', () => {
    expect(deriveTripType('standard', [])).toBe('standard')
    expect(deriveTripType('standard', undefined)).toBe('standard')
  })

  it('لا يُخفِّض رحلة long_term أبداً حتى لو قصُر مسارها لاحقاً', () => {
    const oneDay = [seg('2026-07-01T10:00:00', '2026-07-02T10:00:00')]
    expect(deriveTripType('long_term', oneDay)).toBe('long_term')
    expect(deriveTripType('long_term', [])).toBe('long_term')
  })
})

describe('newSegmentId / emptySegmentDraft', () => {
  it('يولّد 16 محرفاً ست عشرياً مطابقاً لما تكتبه السكربتات', () => {
    expect(newSegmentId()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('لا يكرّر المعرّفات', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSegmentId()))
    expect(ids.size).toBe(200)
  })

  it('المسوّدة الفارغة تبدأ برحلة جوية ومعرّف جاهز', () => {
    const d = emptySegmentDraft()
    expect(d.mode).toBe('flight')
    expect(d.id).toMatch(/^[0-9a-f]{16}$/)
    expect(validateDraft(d)).not.toBeNull()
  })
})
