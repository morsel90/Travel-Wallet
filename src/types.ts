// ─── نماذج بيانات Firestore ──────────────────────────────────────────────────

export interface Traveler {
  id: number
  name: string
  shortName: string   // ★ مفتاح الربط مع Expense.participants — لا يتغير بعد الإنشاء
  deposited: number   // إجمالي الدفع المسبق بالريال
  deletedAt?: number | null   // Unix timestamp | null — حذف ليّن (Soft Delete)
  // 🆕 حقل مؤقت (client-only) لا يُكتب لـ Firestore أبداً — مشتق من
  // snapshot.metadata.hasPendingWrites في useTravelers لعرض شارة "جارٍ المزامنة"
  // على العنصر أثناء التحديث المتفائل (Optimistic Update)، قبل تأكيد الخادم.
  _pending?: boolean
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
  // 🆕 uid الجلسة/الجهاز اللي أضاف المصروف أصلاً (مسجّل الدخول المجهول أو المسؤول).
  // يُستخدم للسماح لصاحب المصروف بتعديله أو حذفه بنفسه لاحقاً دون انتظار المسؤول.
  // اختياري لأن المصاريف القديمة (قبل هذا التعديل) لا تملكه — تبقى تلك admin-only.
  createdByUid?: string
  deletedAt?: number | null   // Unix timestamp | null — حذف ليّن (Soft Delete)
  // 🆕 حقل مؤقت (client-only) لا يُكتب لـ Firestore أبداً — مشتق من
  // snapshot.metadata.hasPendingWrites في useExpenses لعرض شارة "جارٍ المزامنة"
  // على العنصر أثناء التحديث المتفائل (Optimistic Update)، قبل تأكيد الخادم.
  _pending?: boolean
  // 🆕 فئة المصروف (من EXPENSE_CATEGORIES في constants.ts) — اختياري لأن
  // المصاريف القديمة (قبل هذا التعديل) لا تملكه؛ تُصنَّف "أخرى" في الرسم البياني.
  category?: string
  // 🆕 تقسيم غير متساوٍ (اختياري) — وزن/حصة نسبية لكل مشارك (المفتاح: id
  // المسافر كنص، لأن مفاتيح الخرائط في Firestore نصوص دائماً). أي مشارك غير
  // مذكور هنا يُعامَل بوزن 1 (حصة عادية) — وغياب هذا الحقل بالكامل = تقسيم
  // بالتساوي التام كما كان قبل هذا التحديث؛ كل المصاريف القديمة تعمل دون أي
  // حاجة لترحيل بيانات. انظر splitByShares في utils/calculations.ts.
  shares?: Record<string, number>
  // 🆕 من دفع المصروف فعلياً: رقم = Traveler.id دفعها من جيبه (يُقيَّد لحسابه في
  // calculateBalances قبل خصم نصيبه)، أو 'fund' = من الصندوق المشترك كالمعتاد.
  // غياب الحقل بالكامل (كل المصاريف قبل هذا التحديث) يُعامَل كـ 'fund' — لا حاجة
  // لترحيل بيانات. انظر calculateBalances في utils/calculations.ts.
  paidBy?: number | 'fund'
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
  category: string         // 🆕 من EXPENSE_CATEGORIES — دائماً له قيمة افتراضية في النموذج
  // 🆕 تقسيم غير متساوٍ — 'equal' افتراضياً (كما كان الحال دائماً)؛ 'custom' عند
  // الضغط على زر "تخصيص التقسيم" في ExpenseForm. shares يُملأ فقط في حالة
  // 'custom' (المفتاح: id المسافر رقماً هنا في النموذج، ويُحفظ كنص في Firestore
  // تلقائياً). عند الحفظ بوضع 'equal' يُهمَل shares تماماً (لا يُكتب لـ Firestore).
  splitMode: 'equal' | 'custom'
  shares: Record<number, number>
  // 🆕 دائماً له قيمة افتراضية ('fund') في النموذج، تماماً كـ category — انظر
  // Expense.paidBy لدلالة القيم.
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
// 🆕 سجل غير قابل للتعديل أو الحذف (immutable) يُنشأ تلقائيًا عند كل تعديل لرصيد
// مسافر — يوثّق من غيّره، متى، القيمة السابقة/الجديدة، والسبب (اختياري) لتفادي
// نزاعات لاحقة حول "لماذا تغيّر رصيدي؟". مرئي للمسؤول فقط.
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

// ─── تصوّر بياني للأرصدة ─────────────────────────────────────────────────────
// 🆕 أنواع بيانات مشتقة (derived) تُبنى من travelers/expenses الموجودة أصلاً —
// لا تُخزَّن في Firestore ولا تُقرأ منه مباشرة، بل تُحسب محلياً عبر دوال نقية في
// utils/calculations.ts (calculateSettlements/calculateCategoryTotals/
// calculateSpendingTrend) وتُغذّي مكوّنات src/components/charts/.

/**
 * تحويل مقترح لتسوية الحسابات بين عضوين — ليس تحويلاً بنكياً فعلياً، بل اقتراح
 * محسوب محلياً (خوارزمية جشعة/Greedy) لتصفير أرصدة remaining بأقل عدد ممكن من
 * الخطوات تقريباً. انظر calculateSettlements.
 */
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
  // 🆕 عند وجودها، يعرض مكوّن Toast زر "تراجع" بجانب الرسالة — يُستخدم مع
  // الحذف الليّن (Undo للحذف: مصروف أو مسافر) لإتاحة تراجع فوري خلال نافذة
  // زمنية قصيرة (انظر App.tsx: confirmDelete/confirmDeleteTraveler، مهلة 5
  // ثوانٍ) دون الحاجة لفتح سلة المهملات. دالة client-only بحتة — لا تُخزَّن
  // ولا تُقارَن مع أي حالة، فقط تُستدعى عند الضغط.
  onUndo?: () => void
  // 🆕 عند وجودها، يعرض مكوّن Toast زر "إعادة المحاولة" بجانب الرسالة — يُستخدم
  // عند فشل حفظ المصروف (غالباً انقطاع الشبكة) لإعادة استدعاء نفس عملية الكتابة
  // (انظر handleAddExpense/handleQuickAddExpense في hooks/useExpenseActions.ts).
  // client-only بحتة كـ onUndo — لا تُخزَّن ولا تُقارَن، فقط تُستدعى عند الضغط.
  onRetry?: () => void
}
// ─── إعدادات الرحلة ومسار التنقل (ميزة جديدة) ──────────────────────────────────

// 🆕 تحديد أنواع التنقل المدعومة في التطبيق
export type TransportMode = 'flight' | 'car' | 'train' | 'bus'

export interface ItinerarySegment {
  id: string
  mode: TransportMode
  
  // 🆕 يمثل رقم الرحلة للطيران (QR 1155) أو وصف المركبة (مثال: سيارة يوكن، قطار الحرمين)
  identifier: string 
  
  // 🆕 رقم الحجز (PNR) للطيران، أو رقم حجز الإيجار للسيارة/القطار (اختياري)
  reference?: string 
  
  departure: {
    location: string // اسم المطار أو مدينة الانطلاق / نقطة التجمع
    time: string     // ISO timestamp (مثال: "2026-07-21T22:30:00")
  }
  arrival: {
    location: string // اسم المطار أو مدينة الوصول
    time: string     // ISO timestamp
  }
}

// ─── دورة حياة الرحلة ────────────────────────────────────────────────────────
// 🆕 حالة الرحلة — مخزَّنة في trips/{tripId}.status ومفروضة في firestore.rules
// (انظر tripAcceptsExpenses/tripAcceptsWrites هناك) لا في الواجهة وحدها.
//
//   active    → كل شيء مسموح
//   completed → لا مصاريف جديدة، لكن تعديل المسافرين والإيداعات يبقى متاحاً
//               لتسوية الحسابات بعد انتهاء الرحلة
//   archived  → لا كتابة إطلاقاً، وتختفي من القوائم افتراضياً
//
// ⚠️ غياب الحقل = active. كل الرحلات المنشأة قبل هذه الميزة بلا `status`، ولو
// عُوملت كغير نشطة لتجمّدت جميعها. لا ترحيل مطلوب — لا في القواعد ولا هنا.
export type TripStatus = 'active' | 'completed' | 'archived'

/** ترتيب دلالي للتقييد: كل حالة تشمل قيود ما قبلها. مفيد للمقارنات في الواجهة. */
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  active:    'نشطة',
  completed: 'منتهية',
  archived:  'مؤرشفة',
}

// ─── سجلّ عضوية الرحلة ───────────────────────────────────────────────────────
// 🆕 مستند لكل من انضمّ للرحلة، في trips/{tripId}/members/{uid}. تكتبه
// verifyTripPin عند الانضمام (وmergeAnonymousTrips على مسار الدمج)، ولا يكتبه
// أي عميل إطلاقاً.
//
// ⚠️ **فهرس إداري لا مصدر صلاحية.** الوصول يُقرأ من الـ claim في التوكن، وهذا
// السجلّ موجود لأن Firebase Auth لا يقبل استعلاماً على الـ claims — فبدونه لا
// جواب أصلاً لسؤال «من في هذه الرحلة؟».
export interface TripMember {
  /** معرّف حساب Firebase — هو معرّف المستند نفسه. */
  uid: string
  /**
   * ⚠️ **اختياري، وغيابه ليس خطأً.** السطور التي بناها
   * scripts/backfill-member-roster.mjs لمن انضمّ قبل وجود السجلّ لا تعرف تاريخ
   * الانضمام — ولا مكان يحفظه. الغياب يعني «غير معروف»، ويجب أن يُعرض كذلك؛
   * أي سقوط إلى 0 أو إلى تاريخ الحساب يخترع معلومة لا يمكن تمييزها لاحقاً.
   */
  joinedAt?: number
  /** آخر مرة أدخل فيها رمز الرحلة — يُحدَّث في كل تحقّق، بخلاف joinedAt. */
  lastVerifiedAt?: number
  /** للحسابات الدائمة فقط؛ الجلسة المجهولة بلا بريد ولا اسم. */
  email?: string
  displayName?: string
  /** uid الجلسة المجهولة التي نُقلت منها العضوية — يربط سطرين لشخص واحد. */
  mergedFrom?: string
  /** وُجد بالترحيل لا بالانضمام؛ ملازم لغياب joinedAt. */
  backfilledAt?: number
  /**
   * 🆕 دور الرحلة (docs/PLAN-member-management.md المرحلة ٣) — منفصل تماماً عن
   * admin: true العالمي. غيابه يعني 'member' (نفس مبدأ غياب `status` = active).
   * تكتبه manageMember (mode: 'setRole') وحدها؛ لا كتابة من أي عميل مهما كان.
   */
  role?: 'organizer' | 'member'
}

// ─── دعوة الرحلة (رابط دخول بنقرة واحدة) ─────────────────────────────────────
// 🆕 tripInvites/{token} — يكتبه manageInvite (Cloud Function) حصراً، `read,
// write: if false` في firestore.rules لأي عميل. لا يُقرأ من الواجهة مباشرةً
// إطلاقاً (لا صلاحية لذلك)؛ الشكل موثَّق هنا كمرجع فقط.
export interface TripInvite {
  tripId: string
  createdAt: number
  createdByUid: string
}

// 🆕 تفاصيل الحساب البنكي — كانت مُعرَّفة محلياً في useTripConfig.ts وMisc.tsx
// معاً؛ وُحِّدت هنا لأن واجهة إدارة الرحلة تحتاج نفس النوع للنموذج.
export interface BankDetails {
  bankName: string
  beneficiary: string
  iban: string
}

// ملاحظة: واجهة إعدادات الرحلة الكاملة (TripConfig) معرّفة ومُصدَّرة من
// hooks/useTripConfig.ts — وهي الشكل الفعلي الذي يُرجعه الـ hook
// (tripName + bankDetails ككائن + itinerary). لا تُكرَّر هنا لتفادي التعارض.