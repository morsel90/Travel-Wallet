// أدوات مسار الرحلة — دوال نقية لمحرّر المسار وعرضه.

import type { ItinerarySegment, TransportMode, TripType } from '../types'

export const TRANSPORT_MODES: TransportMode[] = ['flight', 'car', 'train', 'bus']

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  flight: 'رحلة جوية',
  car: 'سيارة',
  train: 'قطار',
  bus: 'حافلة',
}

/** الحد الأعلى لعدد المقاطع — يطابق isValidTripConfig في firestore.rules. */
export const MAX_SEGMENTS = 50

// ─── مسوّدة النموذج (نصوص <input>، تُحوَّل عند الحفظ) ─────────────────────────
// ⚠️ identifier/reference/arrivalTime بلا حقل في النموذج المبسّط لكنها باقية
// هنا عمداً: قيمة قديمة تمرّ عبر المسوّدة كما هي بدل أن تُمحى بصمت، والفارغة
// لا تُكتب.
export interface SegmentDraft {
  id: string
  mode: TransportMode
  identifier: string
  reference: string
  /** نص حرّ اختياري لأي تفصيل إضافي. */
  notes: string
  departureLocation: string
  departureTime: string // قيمة <input type="datetime-local"> — "YYYY-MM-DDTHH:mm"
  arrivalLocation: string
  arrivalTime: string
}

/** 16 محرفاً ست عشرياً — يطابق ما تكتبه السكربتات. */
export function newSegmentId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** @param prefilledDepartureLocation وصول آخر مقطع — التالي يبدأ غالباً من حيث انتهى. */
export function emptySegmentDraft(prefilledDepartureLocation = ''): SegmentDraft {
  return {
    id: newSegmentId(),
    mode: 'flight',
    identifier: '',
    reference: '',
    notes: '',
    departureLocation: prefilledDepartureLocation,
    departureTime: '',
    arrivalLocation: '',
    arrivalTime: '',
  }
}

/**
 * datetime-local ← الصيغة المخزَّنة ("…T22:30:00").
 * ⚠️ وقت محلي بلا منطقة زمنية عمداً — Z أو إزاحة تُزحزح كل الأوقات المعروضة.
 */
export function toStoredTime(inputValue: string): string {
  if (!inputValue) return ''
  // datetime-local قد يُرجع الثواني أيضاً على بعض المتصفحات
  return inputValue.length === 16 ? `${inputValue}:00` : inputValue
}

/** العكس: من الصيغة المخزَّنة إلى قيمة يقبلها <input type="datetime-local">. */
export function toInputTime(storedValue: string): string {
  if (!storedValue) return ''
  return storedValue.slice(0, 16)
}

export function segmentToDraft(segment: ItinerarySegment): SegmentDraft {
  return {
    id: segment.id,
    mode: segment.mode,
    identifier: segment.identifier ?? '',
    reference: segment.reference ?? '',
    notes: segment.notes ?? '',
    departureLocation: segment.departure.location,
    departureTime: toInputTime(segment.departure.time),
    arrivalLocation: segment.arrival.location,
    arrivalTime: segment.arrival.time ? toInputTime(segment.arrival.time) : '',
  }
}

/** أول رسالة خطأ، أو null. الحقول بلا خانة في النموذج تمرّ بلا فحص. */
export function validateDraft(draft: SegmentDraft): string | null {
  if (!TRANSPORT_MODES.includes(draft.mode)) return 'اختر وسيلة تنقل صحيحة.'
  if (draft.notes.trim().length > 200) return 'الملاحظات طويلة جداً (200 حرف كحد أقصى).'
  if (!draft.departureLocation.trim()) return 'أدخل مكان الانطلاق.'
  if (!draft.arrivalLocation.trim()) return 'أدخل مكان الوصول.'
  if (!draft.departureTime) return 'أدخل وقت الانطلاق.'

  const dep = new Date(toStoredTime(draft.departureTime)).getTime()
  if (Number.isNaN(dep)) return 'وقت الانطلاق غير صالح.'

  return null
}

/** مقطع مخزَّن من مسوّدة صالحة. الحقول الاختيارية الفارغة لا تُكتب. */
export function draftToSegment(draft: SegmentDraft): ItinerarySegment {
  const identifier = draft.identifier.trim()
  const reference = draft.reference.trim()
  const notes = draft.notes.trim()
  const arrivalTime = toStoredTime(draft.arrivalTime)
  return {
    id: draft.id,
    mode: draft.mode,
    ...(identifier ? { identifier } : {}),
    ...(reference ? { reference } : {}),
    ...(notes ? { notes } : {}),
    departure: {
      location: draft.departureLocation.trim(),
      time: toStoredTime(draft.departureTime),
    },
    arrival: {
      location: draft.arrivalLocation.trim(),
      ...(arrivalTime ? { time: arrivalTime } : {}),
    },
  }
}

/** ⚠️ القواعد لا تفحص بنية المقاطع، فمقطع تالف يُصفّى هنا بدل أن يُسقط الواجهة. */
export function isRenderableSegment(value: unknown): value is ItinerarySegment {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<ItinerarySegment>
  return (
    typeof s.id === 'string' &&
    typeof s.mode === 'string' &&
    TRANSPORT_MODES.includes(s.mode as TransportMode) &&
    (s.identifier === undefined || typeof s.identifier === 'string') &&
    typeof s.departure?.location === 'string' &&
    typeof s.departure?.time === 'string' &&
    typeof s.arrival?.location === 'string' &&
    (s.arrival?.time === undefined || typeof s.arrival.time === 'string')
  )
}

/** يُصفّي المقاطع التالفة ثم يرتّب زمنياً تصاعدياً حسب وقت الانطلاق. */
export function normalizeItinerary(raw: unknown): ItinerarySegment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRenderableSegment)
    .slice()
    .sort((a, b) => new Date(a.departure.time).getTime() - new Date(b.departure.time).getTime())
}

/**
 * نسخة المسار — أساس القفل التفاؤلي (itineraryRevIsBumped في القواعد).
 * ⚠️ كل ما ليس صحيحاً موجباً = 0، وإلا أنتج `NaN + 1` رفضاً دائماً لكل حفظ.
 */
export function normalizeItineraryRev(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : 0
}

/** أول مقطع لم يحن وقت انطلاقه بعد — يستخدمه NextSegmentWidget. */
export function findNextSegment(
  itinerary: ItinerarySegment[],
  now: number = Date.now()
): ItinerarySegment | null {
  return itinerary.find(s => new Date(s.departure.time).getTime() > now) ?? null
}

/**
 * «متى انتهت الرحلة» (وصول آخر مقطع) لدورة الحياة التلقائية. بلا مسار = null،
 * فتبقى الرحلة خارج الانتقال التلقائي عمداً.
 *
 * ⚠️ نسخة مطابقة يدوياً في functions/index.js (tripEndTimeJs) — غيّرهما معاً.
 */
export function tripEndTime(itinerary: unknown): number | null {
  const normalized = normalizeItinerary(itinerary)
  if (normalized.length === 0) return null
  const last = normalized[normalized.length - 1]
  // وقت الوصول اختياري — الانطلاق أفضل تقدير بدل NaN.
  return new Date(last.arrival.time ?? last.departure.time).getTime()
}

export interface TripRouteSummary {
  /** وقت انطلاق أول مقطع (ISO) — تُستخدم كـ"بداية الرحلة" في القوائم. */
  start: string
  /** وقت وصول آخر مقطع (ISO) — نفس منطق tripEndTime أعلاه. */
  end: string
  fromLocation: string
  toLocation: string
}

/** أول انطلاق ← آخر وصول، أو null بلا مسار صالح. */
export function tripRouteSummary(itinerary: unknown): TripRouteSummary | null {
  const normalized = normalizeItinerary(itinerary)
  if (normalized.length === 0) return null
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  return {
    start: first.departure.time,
    end: last.arrival.time ?? last.departure.time,
    fromLocation: first.departure.location,
    toLocation: last.arrival.location,
  }
}

/** تجاوز هذا العدد من الأيام (أول انطلاق ← آخر وصول) يرقّي الرحلة تلقائياً لطويلة المدى عند حفظ مسارها. */
export const LONG_TERM_THRESHOLD_DAYS = 14

/**
 * نوع الرحلة من مدّة مسارها، بدل سؤال المنشئ.
 *
 * ⚠️ ترقية فقط، لا تخفيض أبداً: الرجوع لا يُلغي أثر شهر أُغلق — قرار بشري عبر
 * scripts/set-trip-type.mjs.
 */
export function deriveTripType(currentType: TripType, itinerary: unknown): TripType {
  if (currentType === 'long_term') return 'long_term'
  const summary = tripRouteSummary(itinerary)
  if (!summary) return currentType
  const days = (new Date(summary.end).getTime() - new Date(summary.start).getTime()) / 86_400_000
  return days > LONG_TERM_THRESHOLD_DAYS ? 'long_term' : currentType
}

// ─── العدّ التنازلي للمقطع القادم ──────────────────────────────────────────

/** بداية اليوم التقويمي بالتوقيت المحلي — أساس المقارنة "أي يوم؟" لا "كم ساعة؟". */
function startOfDay(timestamp: number): number {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * نص العدّ التنازلي، أو null لوقت غير صالح أو مضى.
 *
 * باليوم التقويمي لا الساعات: رحلة الثامنة صباحاً «غداً» في الحادية عشرة ليلاً.
 * ثم ساعات في اليوم نفسه، ثم دقائق في الساعة الأخيرة. أرقام لاتينية عمداً.
 */
export function formatCountdown(departureTime: string, now: number = Date.now()): string | null {
  const departure = new Date(departureTime).getTime()
  if (Number.isNaN(departure) || departure <= now) return null

  // round لا floor: يوم التوقيت الصيفي 23 أو 25 ساعة.
  const days = Math.round((startOfDay(departure) - startOfDay(now)) / 86_400_000)
  if (days === 1) return 'غداً'
  if (days === 2) return 'بعد يومين'
  if (days > 2) return days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يوماً`

  // نفس اليوم التقويمي — ساعات، ثم دقائق في آخر ساعة.
  const remainingMs = departure - now
  const hours = Math.floor(remainingMs / 3_600_000)
  if (hours >= 1) {
    if (hours === 1) return 'بعد ساعة'
    if (hours === 2) return 'بعد ساعتين'
    return hours <= 10 ? `بعد ${hours} ساعات` : `بعد ${hours} ساعة`
  }

  // Math.ceil: 90 ثانية متبقية تُقرأ «بعد دقيقتين» لا «بعد دقيقة» ثم تختفي فجأة.
  const minutes = Math.ceil(remainingMs / 60_000)
  if (minutes <= 1) return 'بعد أقل من دقيقة'
  if (minutes === 2) return 'بعد دقيقتين'
  return minutes <= 10 ? `بعد ${minutes} دقائق` : `بعد ${minutes} دقيقة`
}
