// 🆕 أدوات مسار الرحلة — دوال بحتة (بلا React ولا Firestore) تدعم محرّر المسار
// في واجهة الإدارة (components/admin/TripAdminView.tsx). قابلة للاختبار بالكامل
// عبر Vitest — انظر itinerary.test.ts.

import type { ItinerarySegment, TransportMode } from '../types'

export const TRANSPORT_MODES: TransportMode[] = ['flight', 'car', 'train', 'bus']

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  flight: 'رحلة جوية',
  car: 'سيارة',
  train: 'قطار',
  bus: 'حافلة',
}

/** الحد الأعلى لعدد المقاطع — يطابق isValidTripConfig في firestore.rules. */
export const MAX_SEGMENTS = 50

// ─── مسوّدة النموذج ─────────────────────────────────────────────────────────
// النموذج يتعامل مع نصوص فقط (قيم <input>)، والتحويل لـ ItinerarySegment يحدث
// عند الحفظ بعد التحقق — نفس نمط ExpenseFormData مقابل Expense.
export interface SegmentDraft {
  id: string
  mode: TransportMode
  identifier: string
  reference: string
  departureLocation: string
  departureTime: string // قيمة <input type="datetime-local"> — "YYYY-MM-DDTHH:mm"
  arrivalLocation: string
  arrivalTime: string
}

/**
 * معرّف عشوائي للمقطع. يطابق شكل ما تكتبه السكربتات
 * (randomBytes(8).toString('hex')) أي 16 محرفاً ست عشرياً.
 */
export function newSegmentId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function emptySegmentDraft(): SegmentDraft {
  return {
    id: newSegmentId(),
    mode: 'flight',
    identifier: '',
    reference: '',
    departureLocation: '',
    departureTime: '',
    arrivalLocation: '',
    arrivalTime: '',
  }
}

/**
 * يحوّل قيمة حقل datetime-local ("2026-07-21T22:30") إلى الصيغة المخزَّنة
 * ("2026-07-21T22:30:00"). المخزون تاريخ محلي بلا منطقة زمنية عمداً — نفس ما
 * تكتبه السكربتات، وهو ما تتوقّعه شاشات العرض عند استدعاء new Date(...).
 * إضافة Z أو إزاحة هنا كانت ستُزحزح كل الأوقات المعروضة بمقدار فارق التوقيت.
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
    identifier: segment.identifier,
    reference: segment.reference ?? '',
    departureLocation: segment.departure.location,
    departureTime: toInputTime(segment.departure.time),
    arrivalLocation: segment.arrival.location,
    arrivalTime: toInputTime(segment.arrival.time),
  }
}

/**
 * يتحقق من مسوّدة مقطع ويُرجع أول رسالة خطأ بالعربية، أو null إن كانت صالحة.
 * يُستدعى قبل الحفظ وقبل بناء ItinerarySegment.
 */
export function validateDraft(draft: SegmentDraft): string | null {
  if (!TRANSPORT_MODES.includes(draft.mode)) return 'اختر وسيلة تنقل صحيحة.'
  if (!draft.identifier.trim()) return 'أدخل رقم الرحلة أو وصف المركبة.'
  if (draft.identifier.trim().length > 80) return 'رقم الرحلة أو الوصف طويل جداً (80 حرفاً كحد أقصى).'
  if (draft.reference.trim().length > 40) return 'رقم الحجز طويل جداً (40 حرفاً كحد أقصى).'
  if (!draft.departureLocation.trim()) return 'أدخل مكان الانطلاق.'
  if (!draft.arrivalLocation.trim()) return 'أدخل مكان الوصول.'
  if (!draft.departureTime) return 'أدخل وقت الانطلاق.'
  if (!draft.arrivalTime) return 'أدخل وقت الوصول.'

  const dep = new Date(toStoredTime(draft.departureTime)).getTime()
  const arr = new Date(toStoredTime(draft.arrivalTime)).getTime()
  if (Number.isNaN(dep)) return 'وقت الانطلاق غير صالح.'
  if (Number.isNaN(arr)) return 'وقت الوصول غير صالح.'
  if (arr < dep) return 'وقت الوصول قبل وقت الانطلاق — تحقّق من التاريخين.'

  return null
}

/** يبني مقطعاً مخزَّناً من مسوّدة صالحة. لا يكتب reference إن كان فارغاً. */
export function draftToSegment(draft: SegmentDraft): ItinerarySegment {
  const reference = draft.reference.trim()
  return {
    id: draft.id,
    mode: draft.mode,
    identifier: draft.identifier.trim(),
    ...(reference ? { reference } : {}),
    departure: {
      location: draft.departureLocation.trim(),
      time: toStoredTime(draft.departureTime),
    },
    arrival: {
      location: draft.arrivalLocation.trim(),
      time: toStoredTime(draft.arrivalTime),
    },
  }
}

/**
 * حارس دفاعي عند القراءة: firestore.rules تتحقق من أن itinerary قائمة بحدّ أقصى
 * 50 عنصراً فقط، ولا تفحص بنية كل مقطع (قيد لغة القواعد — موثّق هناك). أي مقطع
 * تالف مكتوب مباشرة عبر Firestore SDK كان سيُسقط الواجهة عند قراءة
 * segment.departure.time، فنُصفّيه هنا بدل ذلك.
 */
export function isRenderableSegment(value: unknown): value is ItinerarySegment {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<ItinerarySegment>
  return (
    typeof s.id === 'string' &&
    typeof s.mode === 'string' &&
    TRANSPORT_MODES.includes(s.mode as TransportMode) &&
    typeof s.identifier === 'string' &&
    typeof s.departure?.location === 'string' &&
    typeof s.departure?.time === 'string' &&
    typeof s.arrival?.location === 'string' &&
    typeof s.arrival?.time === 'string'
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

/** أول مقطع لم يحن وقت انطلاقه بعد — يستخدمه NextSegmentWidget. */
export function findNextSegment(
  itinerary: ItinerarySegment[],
  now: number = Date.now()
): ItinerarySegment | null {
  return itinerary.find(s => new Date(s.departure.time).getTime() > now) ?? null
}
