// 🆕 أدوات مسار الرحلة — دوال بحتة (بلا React ولا Firestore) تدعم محرّر المسار
// في لوحة تفاصيل الرحلة (components/admin/TripDetailPanel.tsx). قابلة للاختبار بالكامل
// عبر Vitest — انظر itinerary.test.ts.

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

// ─── مسوّدة النموذج ─────────────────────────────────────────────────────────
// النموذج يتعامل مع نصوص فقط (قيم <input>)، والتحويل لـ ItinerarySegment يحدث
// عند الحفظ بعد التحقق — نفس نمط ExpenseFormData مقابل Expense.
//
// 🆕 identifier/reference/arrivalTime لم يعد لها حقل في SegmentForm.tsx
// المبسّط، لكنها تبقى هنا لسبب واحد: مقطع قديم فيه قيمة لأحدها يُحرَّر عبر
// segmentToDraft ثم draftToSegment بلا لمس، فتُحفَظ كما هي بدل أن يمحوها
// النموذج المبسّط بصمت. مقطع جديد (emptySegmentDraft) يبدأ بها فارغة، فتُحذف
// عند البناء (انظر draftToSegment) بدل أن تُكتب كنصوص فارغة.
export interface SegmentDraft {
  id: string
  mode: TransportMode
  identifier: string
  reference: string
  /** 🆕 حقل نصي حرّ اختياري — بديل الحقول المحذوفة لأي تفصيل إضافي. */
  notes: string
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

/**
 * @param prefilledDepartureLocation 🆕 وجهة وصول آخر مقطع مسجَّل في المسار، إن
 * وُجدت — تُملأ بها "من" تلقائياً بدل تركها فارغة، على افتراض أن المقطع
 * التالي غالباً يبدأ من حيث انتهى السابق.
 */
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
    identifier: segment.identifier ?? '',
    reference: segment.reference ?? '',
    notes: segment.notes ?? '',
    departureLocation: segment.departure.location,
    departureTime: toInputTime(segment.departure.time),
    arrivalLocation: segment.arrival.location,
    arrivalTime: segment.arrival.time ? toInputTime(segment.arrival.time) : '',
  }
}

/**
 * يتحقق من مسوّدة مقطع ويُرجع أول رسالة خطأ بالعربية، أو null إن كانت صالحة.
 * يُستدعى قبل الحفظ وقبل بناء ItinerarySegment.
 *
 * 🆕 لا يتحقق من identifier/reference/arrivalTime — لا حقل لها في النموذج
 * المبسّط ليُخطئ فيه المستخدم أصلاً. قيمها (إن وُجدت من تعديل مقطع قديم) تمرّ
 * كما هي بلا فحص، لأنها كانت صالحة أصلاً حين حُفظت أول مرة ولم يلمسها أحد هنا.
 */
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

/**
 * يبني مقطعاً مخزَّناً من مسوّدة صالحة. لا يكتب identifier/reference/notes/
 * وقت الوصول إن كانت فارغة — 🆕 هذا ما يجعل مقطعاً جديداً (بلا هذه القيم أصلاً
 * في المسوّدة) يُحفظ بلا الحقول المحذوفة تماماً، بينما مقطع قديم يُحرَّر بقيمة
 * موجودة لأحدها (مررت بلا تغيير من segmentToDraft) يحتفظ بها كما هي.
 */
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
    // 🆕 identifier اختياري الآن (النموذج المبسّط لا يجمعه لمقطع جديد) — لا
    // يُرفض غيابه، فقط نوعه إن وُجد.
    (s.identifier === undefined || typeof s.identifier === 'string') &&
    typeof s.departure?.location === 'string' &&
    typeof s.departure?.time === 'string' &&
    typeof s.arrival?.location === 'string' &&
    // 🆕 نفس الشيء لوقت الوصول — اختياري، فلا يُرفض المقطع لغيابه.
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
 * 🆕 نسخة المسار المقروءة من مستند الرحلة — أساس القفل التفاؤلي الذي تفرضه
 * `itineraryRevIsBumped` في firestore.rules.
 *
 * ⚠️ **كل ما ليس عدداً صحيحاً موجباً يُقرأ صفراً**، لا فقط الحقل الغائب: رحلة
 * أُنشئت قبل هذه الميزة لا تحمل الحقل إطلاقاً (نفس مبدأ غياب `status` = active)،
 * وقيمة تالفة كُتبت مباشرة عبر SDK لا يجوز أن تُسقط الواجهة ولا أن تنتج
 * `NaN + 1` فيُرفض كل حفظ لاحق بلا سبب مفهوم. الصفر يعيد الرحلة إلى بداية
 * البروتوكول: أول حفظ يكتب 1، وتستمر من هناك.
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
 * 🆕 وقت وصول آخر مقطع في المسار — "متى انتهت الرحلة فعلياً"، تستخدمه دورة
 * الحياة التلقائية (advanceTripLifecycle في functions/index.js) لتقرير متى
 * تنتقل رحلة من `active` إلى `completed`. `itinerary` يُمرَّر خاماً (غير
 * مرتَّب بالضرورة)، فيُمرَّر أولاً عبر normalizeItinerary — نفس ما تفعله كل
 * دالة أخرى هنا. مسار فارغ أو بلا مقاطع صالحة يُعيد `null`: لا إشارة صادقة
 * لـ"متى انتهت" رحلة بلا مسار، فتبقى خارج الانتقال التلقائي بالكامل (قرار
 * نطاق، لا نقص — انظر docs/DECISIONS.md).
 *
 * ⚠️ **نسخة مطابقة خادمياً**: `tripEndTimeJs` في functions/index.js — الدالة
 * المجدولة تعمل في بيئة Node منفصلة بلا حزمة مشتركة مع هذا الملف، فتُعاد
 * كتابتها هناك يدوياً بنفس المنطق بالضبط، على نمط isValidNameKeyJs/
 * deriveShortNameJs الموجود أصلاً لنفس السبب.
 */
export function tripEndTime(itinerary: unknown): number | null {
  const normalized = normalizeItinerary(itinerary)
  if (normalized.length === 0) return null
  const last = normalized[normalized.length - 1]
  // 🆕 وقت الوصول اختياري الآن (النموذج المبسّط لا يجمعه) — نسقط لوقت
  // الانطلاق كأفضل تقدير معروف بدل NaN. نفس المنطق في tripEndTimeJs
  // (functions/index.js) يجب أن يبقى مطابقاً — انظر تعليقها هناك.
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

/**
 * 🆕 ملخّص المسار (أول انطلاق ← آخر وصول) لعرضه في قوائم الرحلات (TripPicker)
 * دون تكرار محرّر المسار الكامل هناك. `itinerary` يُمرَّر خاماً كما في
 * tripEndTime أعلاه — يمرّ أولاً عبر normalizeItinerary. مسار فارغ أو بلا
 * مقاطع صالحة يُعيد null: لا مسار لعرضه.
 */
export function tripRouteSummary(itinerary: unknown): TripRouteSummary | null {
  const normalized = normalizeItinerary(itinerary)
  if (normalized.length === 0) return null
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  return {
    start: first.departure.time,
    // 🆕 نفس سقوط tripEndTime أعلاه لوقت الانطلاق حين يغيب وقت الوصول.
    end: last.arrival.time ?? last.departure.time,
    fromLocation: first.departure.location,
    toLocation: last.arrival.location,
  }
}

/** تجاوز هذا العدد من الأيام (أول انطلاق ← آخر وصول) يرقّي الرحلة تلقائياً لطويلة المدى عند حفظ مسارها. */
export const LONG_TERM_THRESHOLD_DAYS = 14

/**
 * 🆕 يقترح نوع الرحلة بعد حفظ مسار جديد — بديل الاختيار اليدوي (والسكربت
 * الإداري القديم) لتحديد long_term: يُشتَق تلقائياً من مدّة المسار نفسه بدل
 * إزعاج من ينشئ الرحلة بخيار تقني إضافي.
 *
 * ⚠️ اتجاه واحد فقط — يُرقّي standard← long_term عند تجاوز الحدّ، ولا يُخفِّض
 * رحلة long_term قائمة إلى standard أبداً حتى لو قصُر مسارها لاحقاً (حُذف
 * مقطع، أو عُدِّل بالخطأ). التخفيض يبقى قراراً بشرياً صريحاً وحده
 * (scripts/set-trip-type.mjs) لأن الرجوع لا يُلغي أثر أي شهر أُغلق فعلياً على
 * الرحلة — انظر docs/DECISIONS.md.
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
 * 🆕 نص العدّ التنازلي حتى وقت الانطلاق، يعرضه NextSegmentWidget.
 *
 * التدرّج **باليوم التقويمي لا بعدد الساعات**: رحلة الغد الساعة 8 صباحاً تبقى
 * «غداً» حين ينظر إليها المسافر الساعة 11 ليلاً، ولا تصير «بعد 9 ساعات» —
 * الأخيرة أدقّ عددياً لكن «غداً» هي ما يفكّر به المسافر فعلاً. وحين يحلّ اليوم
 * نفسه تتحول للساعات، ثم للدقائق في الساعة الأخيرة حيث يصير كل ربع ساعة مهماً.
 *
 * يُرجع null لوقت غير صالح أو لانطلاق مضى — لا نص عدّ لشيء فات.
 *
 * ⚠️ الأرقام لاتينية (الافتراضي في JS) عمداً، مطابقةً لقرار العرض في
 * ItinerarySection.tsx: تقويم ميلادي وأرقام لاتينية أوضح للمسافر.
 */
export function formatCountdown(departureTime: string, now: number = Date.now()): string | null {
  const departure = new Date(departureTime).getTime()
  if (Number.isNaN(departure) || departure <= now) return null

  // Math.round لا floor: فارق اليومين يُحسب بين بدايتَي يومين، وقد يكون 23 أو
  // 25 ساعة عند تغيّر التوقيت الصيفي، فيكسر القسمة الصحيحة.
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
