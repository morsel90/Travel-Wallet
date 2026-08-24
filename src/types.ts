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
  // 🆕 نموذج الهوية الهجين: ربط بروفايل الدفتر (Traveler.id، الرقمي، يبقى مصدر
  // كل حساب في calculations.ts دون تغيير) بحساب Firebase Auth الذي يديره
  // (uid). قيمتان ممكنتان لملف "غير مربوط": الحقل غائب تماماً (كل المسافرين
  // قبل هذا التحديث) أو null (مسافر "شبح" أنشأه المنظّم يدوياً لشخص لم ينضمّ
  // بعد). يُملأ تلقائياً عند الانضمام عبر رابط الدعوة (joinViaInvite) إن لم
  // يوجد ملف بهذا uid أصلاً، أو يدوياً عبر linkTravelerAccount (منظّم/مسؤول
  // يربط ملفاً شبحاً بحساب انضمّ فعلاً). انظر functions/index.js.
  uid?: string | null
  // 🆕 متى انضمّ صاحب هذا الملف فعلياً — يُكتب فقط مع الإنشاء التلقائي عبر
  // joinViaInvite، لا عند linkTravelerAccount (ربط ملف موجود بحساب لاحقاً لا
  // يُعيد تعريف "متى انضم"). غيابه لا يعني خطأً — كل المسافرين قبل هذا
  // التحديث، وكل الملفات "الشبح" التي لم تُربَط بعد، بلا هذا الحقل تماماً.
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
// joinViaInvite عند الانضمام، ولا يكتبه أي عميل إطلاقاً.
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
// (tripName + organizerUid + itinerary). لا تُكرَّر هنا لتفادي التعارض.

// 🆕 بروفايل المستخدم العام users/{uid} — مستقل عن أي رحلة، وهو **المصدر
// الوحيد** لبيانات بنك المستخدم. أي رحلة ينظّمها هذا الحساب تقرأ bankDetails
// حيّة من هنا مباشرة (لا نسخة محلية على مستند الرحلة) — انظر docs/DECISIONS.md.
// كل الحقول اختيارية لأن الكتابة تتم بـ merge (نفس مبدأ isValidTripConfig).
export interface UserProfile {
  displayName?: string
  bankDetails?: BankDetails
  /** خادمي فقط — يكتبه manageTrip حصراً لحدّ إساءة الإنشاء الذاتي للرحلات. */
  lastTripCreatedAt?: number
  /**
   * خادمي فقط — معرّفات الرحلات التي هذا الحساب منظّمها حالياً (يكتبها
   * manageTrip عند الإنشاء وmanageMember عند setRole). تُستهلك في
   * firestore.rules (organizesSharedTrip) لفتح قراءة هذا البروفايل لأعضاء
   * تلك الرحلات تحديداً — لا استهلاك لها في الواجهة مباشرة.
   */
  organizesTripIds?: string[]
}
// ─── نوع الرحلة: قياسية أم طويلة المدى ───────────────────────────────────────
// 🆕 مخزَّن في trips/{tripId}.tripType ومسموح به في firestore.rules
// (isValidTripConfig). يفصل بين نمطين مختلفين جوهرياً:
//
//   standard  → رحلة قصيرة لها بداية ونهاية. الدفتر كله فترة واحدة، وينتهي
//               بتسوية واحدة. هذا سلوك التطبيق منذ البداية وكل الرحلات القائمة.
//   long_term → انتداب/إقامة طويلة بلا نهاية معروفة. الدفتر مستمر، ويُقسَّم
//               إلى **شهور** تُغلق واحداً تلو الآخر بترحيل الرصيد (انظر
//               utils/longTerm.ts وcloseMonth في functions/index.js).
//
// ⚠️ غياب الحقل = standard، تماماً كغياب `status` = active وغياب `role` =
// member. كل رحلة أُنشئت قبل هذه الميزة بلا الحقل، ولو عُوملت كطويلة المدى
// لظهرت لكل مسافريها واجهة إغلاق شهر لا معنى لها. **لا ترحيل بيانات مطلوب** —
// لا هنا ولا في القواعد.
//
// ⚠️ وهذا الحقل **ليس صلاحية ولا قيداً أمنياً** — هو وصف لنمط الرحلة. ما يفرضه
// فعلاً: أن دوال الترحيل (closeMonth/exitTraveler) ترفض العمل على رحلة قياسية،
// وأن الواجهة تفتح مكوّنات مستقلة كلياً (components/longterm/) بدل تكديس شروط
// داخل مكوّنات الرحلة القياسية الناضجة.
export type TripType = 'standard' | 'long_term'

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  standard:  'رحلة قياسية',
  long_term: 'انتداب طويل المدى',
}

/**
 * 🆕 مفتاح الشهر المحاسبي بصيغة `YYYY-MM` — الوحدة التي تُغلق ويُرحَّل رصيدها.
 * نص لا كائن تاريخ عمداً: يُقارن ويُرتَّب معجمياً، ويُطابق بادئة `Expense.date`
 * (‏`YYYY-MM-DD`) مباشرةً بلا أي تحويل منطقة زمنية. انظر utils/period.ts.
 */
export type PeriodKey = string

/**
 * 🆕 حركة واحدة ضمن خطة ترحيل شهر — ما سيحدث لمسافر واحد عند الإغلاق.
 *
 * ⚠️ هذه **معاينة (preview) لا أمر تنفيذ**. الخطة الفعلية تُحسب من جديد داخل
 * closeMonth (functions/index.js) على بيانات الخادم لحظة التنفيذ، ولا تُرسَل
 * من العميل إطلاقاً — وإلا لأصبح المتصفح قادراً على إملاء حركات مالية.
 */
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

/** 🆕 ناتج استدعاء closeMonth — ما نُفِّذ فعلاً، لا ما كان مُتوقَّعاً. */
export interface RolloverResult {
  success: boolean
  tripId: string
  closedPeriod: PeriodKey
  openedPeriod: PeriodKey
  movements: RolloverMovement[]
  /** عدد المستندات المكتوبة فعلاً — مصاريف التسوية + حركات الإيداع. */
  written: { expenses: number; deposits: number }
}
