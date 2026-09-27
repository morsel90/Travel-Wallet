// ─── نماذج بيانات Firestore ──────────────────────────────────────────────────

export interface Traveler {
  id: number
  name: string
  shortName: string   // ★ مفتاح الربط مع Expense.participants — لا يتغير بعد الإنشاء
  deposited: number   // إجمالي الدفع المسبق بالريال
  deletedAt?: number | null   // Unix timestamp | null — حذف ليّن (Soft Delete)
  // client-only، لا يُكتب أبداً — من hasPendingWrites لشارة «جارٍ المزامنة».
  _pending?: boolean
  // الحساب المرتبط بالملف (الحسابات تبقى على Traveler.id). غائب أو null =
  // غير مربوط (قديم، أو «شبح» أنشأه المنظّم). يُملأ عبر joinViaInvite أو linkTravelerAccount.
  uid?: string | null
  // يُكتب مع joinViaInvite وحده، لا عند الربط اللاحق. غيابه ليس خطأً.
  joinedAt?: number
}

export interface TravelerBalance extends Traveler {
  totalExpenses: number
  remaining: number
}

export interface Expense {
  id: string
  date: string          // YYYY-MM-DD
  description: string
  amount: number        // المبلغ بالريال دائماً (بعد تحويل العملة)
  originalAmount: number
  currency: string      // رمز العملة (SAR | USD | ...)
  exchangeRate: number
  participants: number[]   // معرّفات المسافرين المشاركين (Traveler.id)
  createdAt: number     // Unix timestamp (ms)
  // كاتب المصروف — يملك تعديله وحذفه. غائب في القديمة فتبقى للمسؤول وحده.
  createdByUid?: string
  deletedAt?: number | null   // Unix timestamp | null — حذف ليّن (Soft Delete)
  // client-only، لا يُكتب أبداً — من hasPendingWrites لشارة «جارٍ المزامنة».
  _pending?: boolean
  // غيابه = «أخرى».
  category?: string
  // أوزان التقسيم؛ المفتاح id نصّاً (مفاتيح Firestore نصوص). غير المذكور = 1،
  // والغياب = تساوٍ تام.
  shares?: Record<string, number>
  // Traveler.id = دفعه من جيبه، 'fund' أو الغياب = من الصندوق.
  paidBy?: number | 'fund'
  // آخر من عدّل/حذف/استعاد. ⚠️ القواعد تُلزم به المنظّم في مصروف غيره وتمنع
  // انتحال هوية (stampsEditor).
  lastEditedByUid?: string
  lastEditedByName?: string
  lastEditedAt?: number
}

// ─── نماذج نموذج إدخال المصروف ───────────────────────────────────────────────

// قيم النموذج قبل الحفظ — amount و exchangeRate نصوص لأنها مدخلات HTML
export interface ExpenseFormData {
  date: string
  description: string
  amount: string
  currency: string
  exchangeRate: string
  participants: number[]   // معرّفات المسافرين المختارين (Traveler.id)
  category: string
  // shares لا يُكتب إلا في 'custom'.
  splitMode: 'equal' | 'custom'
  shares: Record<number, number>
  paidBy: number | 'fund'
}

// ─── العملات ─────────────────────────────────────────────────────────────────

export interface CurrencyInfo {
  label: string
  rate: number
}

export type CurrencyMap = Record<string, CurrencyInfo>

// ─── أنواع واجهة المستخدم ────────────────────────────────────────────────────

export type DepositMode = 'add' | 'subtract' | 'set'

// ─── سجل تدقيق تعديلات الرصيد ────────────────────────────────────────────────
// سطر غير قابل للتعديل أو الحذف مع كل تعديل رصيد — جواب «لماذا تغيّر رصيدي؟».
export interface DepositLogEntry {
  id: string
  travelerId: number
  previousDeposited: number
  newDeposited: number
  delta: number
  mode: DepositMode
  reason: string | null
  changedByEmail: string
  changedByUid: string
  createdAt: number   // Unix timestamp (ms)
}

// سداد بين مسافرَين — القيد الثالث: رصيد الدافع يرتفع والمستلم ينخفض، ولا يدخل
// الصندوق ريال ولا يُنفَق. ⚠️ لا تُعِده إيداعاً ولا مصروفاً — DECISIONS.md.
// يكتبه recordSettlement وحده، وحذفه ليّن.
export interface Repayment {
  id: string
  /** من سدّد — رصيده يرتفع بالمبلغ. */
  fromId: number
  /** من استلم — رصيده ينخفض بالمبلغ. */
  toId: number
  /** بالريال، موجب دائماً. */
  amount: number
  date: string          // YYYY-MM-DD
  createdAt: number     // Unix timestamp (ms)
  createdByUid: string
  deletedAt?: number | null
  _pending?: boolean
}

// ─── أنواع مشتقة — تُحسب محلياً في utils/calculations.ts ولا تُخزَّن ──────────

/** تحويل مقترح (لا بنكي فعلي) — انظر calculateSettlements. */
export interface Settlement {
  fromId: number
  fromName: string
  toId: number
  toName: string
  amount: number
}

/** إجمالي مصاريف فئة واحدة (من EXPENSE_CATEGORIES، أو "أخرى" للمصاريف بلا فئة). */
export interface CategoryTotal {
  category: string
  total: number
}

/** نقطة على مخطط تطوّر المصاريف عبر الزمن — مجموع يوم واحد + المجموع التراكمي حتى ذلك اليوم. */
export interface SpendingTrendPoint {
  date: string
  total: number
  cumulative: number
}

export type SortOrder = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export type ToastType = 'new' | 'edit' | 'success' | 'error'

export interface ToastMessage {
  text: string
  type: ToastType
  // زرّ «تراجع» بعد الحذف الليّن.
  onUndo?: () => void
  // زرّ «إعادة المحاولة» بعد فشل حفظ مصروف.
  onRetry?: () => void
}
// ─── مسار الرحلة ─────────────────────────────────────────────────────────────

export type TransportMode = 'flight' | 'car' | 'train' | 'bus'

export interface ItinerarySegment {
  id: string
  mode: TransportMode

  // ⚠️ identifier (رقم الرحلة/المركبة) وreference (PNR): بيانات قديمة فقط، لا يجمعهما النموذج.
  identifier?: string

  reference?: string

  // نص حرّ بديل الحقلين أعلاه.
  notes?: string

  departure: {
    location: string // اسم المطار أو مدينة الانطلاق / نقطة التجمع
    time: string     // ISO timestamp (مثال: "2026-07-21T22:30:00")
  }
  arrival: {
    location: string // اسم المطار أو مدينة الوصول
    // اختياري — غيابه = وقت الانطلاق في الحسابات، ولا يُعرض.
    time?: string    // ISO timestamp
  }
}

// ─── دورة حياة الرحلة — مفروضة في firestore.rules ────────────────────────────
//   active    → كل شيء مسموح
//   completed → لا مصاريف جديدة؛ المسافرون والإيداعات متاحة للتسوية
//   archived  → لا كتابة إطلاقاً
// ⚠️ الغياب = active (الرحلات السابقة للحقل).
export type TripStatus = 'active' | 'completed' | 'archived'

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  active:    'نشطة',
  completed: 'منتهية',
  archived:  'مؤرشفة',
}

// ─── سجلّ عضوية الرحلة (trips/{tripId}/members/{uid}) — تكتبه الدوال وحدها ──
// ⚠️ فهرس إداري لا مصدر صلاحية: الوصول من claims التوكن، والسجلّ موجود لأن
// Auth لا يقبل استعلاماً عليها.
export interface TripMember {
  /** معرّف حساب Firebase — هو معرّف المستند نفسه. */
  uid: string
  /** ⚠️ الغياب = «غير معروف» (سطور الترحيل) — لا تُسقطه إلى 0 أو تاريخ آخر. */
  joinedAt?: number
  /** آخر تسجيل عضوية (recordMembership) — يُحدَّث في كل مرة، بخلاف joinedAt. */
  lastVerifiedAt?: number
  email?: string
  displayName?: string
  /** إرث: uid الجلسة المجهولة التي نُقلت منها العضوية. */
  mergedFrom?: string
  /** وُجد بالترحيل لا بالانضمام؛ ملازم لغياب joinedAt. */
  backfilledAt?: number
  /** دور الرحلة، منفصل عن admin العالمي. الغياب = member. تكتبه manageMember وحدها. */
  role?: 'organizer' | 'member'
}

// ─── tripInvites/{token} — خادمي بالكامل، مرجع للشكل فقط ────────────────────
export interface TripInvite {
  tripId: string
  createdAt: number
  createdByUid: string
}

// paymentType: بنك أو محفظة رقمية (stc pay…)، الغياب = bank. حقول البنك إلزامية
// شكلياً (سلاسل فارغة افتراضياً) توافقاً مع المستهلكين القائمين.
export interface BankDetails {
  paymentType?: 'bank' | 'wallet'
  bankName: string
  beneficiary: string
  iban: string
  walletName?: string
  walletPhone?: string
}

// TripConfig في hooks/useTripConfig.ts — لا تُكرَّر هنا.

// users/{uid} — المصدر الوحيد لبيانات بنك المستخدم (لا نسخة على الرحلة).
// كل الحقول اختيارية لأن الكتابة بـ merge.
export interface UserProfile {
  displayName?: string
  bankDetails?: BankDetails
  /** خادمي فقط — يكتبه manageTrip حصراً لحدّ إساءة الإنشاء الذاتي للرحلات. */
  lastTripCreatedAt?: number
  /** خادمي فقط — يفتح قراءة البروفايل لأعضاء رحلاته (organizesSharedTrip في القواعد). */
  organizesTripIds?: string[]
}
// ─── نوع الرحلة ─────────────────────────────────────────────────────────────
//   standard  → بداية ونهاية، فترة واحدة وتسوية واحدة.
//   long_term → بلا نهاية معروفة، شهور تُغلق بترحيل الرصيد (utils/longTerm.ts).
// ⚠️ الغياب = standard. وهو وصف لا صلاحية: يفتح components/longterm/، ودوال
// الترحيل ترفض الرحلة القياسية.
export type TripType = 'standard' | 'long_term'

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  standard:  'رحلة قياسية',
  long_term: 'انتداب طويل المدى',
}

/** شهر محاسبي `YYYY-MM` — نص لا تاريخ عمداً (انظر utils/period.ts). */
export type PeriodKey = string

/** حركة مسافر واحد عند إغلاق الشهر. ⚠️ معاينة لا أمر — closeMonth يعيد الحساب ولا يستلمها. */
export interface RolloverMovement {
  travelerId: number
  travelerName: string
  /** رصيد المسافر لحظة الإغلاق: موجب = له، سالب = عليه. */
  remaining: number
  /**
   * `credit` → له رصيد: يُصفَّر بمصروف تسوية في الشهر المنتهي، ويُفتح الشهر
   * الجديد بإيداع بنفس القيمة.
   * `debt` → عليه عجز: يُصفَّر بإيداع تسوية في الشهر المنتهي، ويُفتح الشهر
   * الجديد بمصروف بنفس القيمة.
   * `settled` → رصيده صفر عملياً؛ لا حركة له إطلاقاً.
   */
  direction: 'credit' | 'debt' | 'settled'
}

/** ما نفّذه closeMonth فعلاً. */
export interface RolloverResult {
  success: boolean
  tripId: string
  closedPeriod: PeriodKey
  openedPeriod: PeriodKey
  movements: RolloverMovement[]
  /** عدد المستندات المكتوبة فعلاً — مصاريف التسوية + حركات الإيداع. */
  written: { expenses: number; deposits: number }
}

/**
 * المستخدم كما تراه الواجهة. ⚠️ يبقي نوع Firebase داخل src/hooks/ (قاعدة
 * eslint.config.js)؛ `User` يطابقه بنيوياً. أضف حقلاً حين يحتاجه مستهلك فعلي.
 */
export interface AppUser {
  uid: string
}
