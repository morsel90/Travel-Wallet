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
  // معرّفات المسافرين المشاركين (Traveler.id). النصوص مسموحة مؤقتاً للتوافق مع
  // البيانات القديمة (أسماء مختصرة) قبل تشغيل سكربت الهجرة — انظر scripts/.
  participants: Array<number | string>
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

export type ToastType = 'new' | 'edit' | 'success'

export interface ToastMessage {
  text: string
  type: ToastType
  // 🆕 عند وجودها، يعرض مكوّن Toast زر "تراجع" بجانب الرسالة — يُستخدم مع
  // الحذف الليّن (Undo للحذف: مصروف أو مسافر) لإتاحة تراجع فوري خلال نافذة
  // زمنية قصيرة (انظر App.tsx: confirmDelete/confirmDeleteTraveler، مهلة 5
  // ثوانٍ) دون الحاجة لفتح سلة المهملات. دالة client-only بحتة — لا تُخزَّن
  // ولا تُقارَن مع أي حالة، فقط تُستدعى عند الضغط.
  onUndo?: () => void
}