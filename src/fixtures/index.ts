// 🆕 بيانات عيّنة للعرض المنعزل (Storybook) والاختبارات.
//
// القيمة الحقيقية هنا ليست «بيانات جميلة» بل **الحالات التي يصعب بلوغها في
// التطبيق الحيّ**: رصيد سالب، مسافر قيد المزامنة، مسافر مربوط بمصاريف فيتعذّر
// حذفه، اسم عربي طويل يكسر التخطيط، قائمة فارغة. الوصول لكل واحدة منها اليوم
// يتطلب تجهيز بيانات فعلية في Firestore ثم محاولة إعادة إنتاج الحالة يدوياً.
//
// ⚠️ ملف بيانات فقط: لا يستورد React ولا Firebase، فيصلح للاختبارات كما يصلح
// للقصص، ولا يدخل حزمة الإنتاج ما لم يستورده كود إنتاجي (ولا ينبغي).

import {
  calculateBalances, calculateSettlements,
  calculateCategoryTotals, calculateSpendingTrend,
} from '../utils/calculations'
import type {
  Traveler, TravelerBalance, Expense, ItinerarySegment, BankDetails,
} from '../types'

// تواريخ ثابتة لا Date.now() — القصص واللقطات يجب أن تكون متطابقة في كل تشغيل،
// وإلا اختلف الناتج بين يوم وآخر بلا أي تغيير في الكود.
const T0 = new Date('2026-07-21T09:00:00').getTime()
const day = 86_400_000

// ─── مسافرون ─────────────────────────────────────────────────────────────────

export const travelerNormal: Traveler = {
  id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 3000, deletedAt: null,
}

export const travelerLongName: Traveler = {
  // اسم طويل عمداً: يكشف قصّ النص (truncate) في بطاقة المسافر وفي القوائم
  id: 2, name: 'عبدالرحمن بن عبدالعزيز آل عبدالمحسن', shortName: 'عبدالرحمن', deposited: 1500, deletedAt: null,
}

export const travelerPending: Traveler = {
  // _pending يظهر كشارة «جارٍ المزامنة» — حالة عابرة جداً في التطبيق الحيّ
  id: 3, name: 'سعد المطيري', shortName: 'سعد', deposited: 500, deletedAt: null, _pending: true,
}

export const travelerZeroDeposit: Traveler = {
  // 0 مودَع: يجعل نسبة الاستهلاك قسمةً على صفر — يجب ألا تُنتج NaN في الشريط
  id: 4, name: 'فهد القحطاني', shortName: 'فهد', deposited: 0, deletedAt: null,
}

export const travelerDeleted: Traveler = {
  id: 5, name: 'خالد العتيبي', shortName: 'خالد', deposited: 800, deletedAt: T0,
}

export const travelers: Traveler[] = [
  travelerNormal, travelerLongName, travelerPending, travelerZeroDeposit,
]

// (الأرصدة والمخرجات المحسوبة معرّفة بعد المصاريف — انظر أسفل الملف)

// ─── مصاريف ──────────────────────────────────────────────────────────────────

export const expenseSimple: Expense = {
  id: 'exp-1',
  date: '2026-07-21',
  description: 'عشاء في وارسو',
  amount: 480,
  originalAmount: 480,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [1, 2, 3, 4],
  createdAt: T0,
  category: 'مطاعم',
  deletedAt: null,
}

export const expenseForeignCurrency: Expense = {
  // عملة أجنبية: يعرض المبلغ الأصلي وسعر الصرف بجانب المبلغ بالريال
  id: 'exp-2',
  date: '2026-07-22',
  description: 'تذاكر متحف',
  amount: 375,
  originalAmount: 100,
  currency: 'EUR',
  exchangeRate: 3.75,
  participants: [1, 2],
  createdAt: T0 + day,
  category: 'ترفيه',
  deletedAt: null,
}

export const expenseUnevenSplit: Expense = {
  // تقسيم غير متساوٍ: أحمد يتحمّل الضعف — يظهر المبلغ بجانب كل اسم
  id: 'exp-3',
  date: '2026-07-23',
  description: 'إيجار سيارة',
  amount: 900,
  originalAmount: 900,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [1, 2, 3],
  shares: { '1': 2, '2': 1, '3': 1 },
  createdAt: T0 + 2 * day,
  category: 'مواصلات',
  deletedAt: null,
}

export const expensePending: Expense = {
  id: 'exp-4',
  date: '2026-07-24',
  description: 'قهوة',
  amount: 45,
  originalAmount: 45,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [1, 3],
  createdAt: T0 + 3 * day,
  category: 'مطاعم',
  deletedAt: null,
  _pending: true,
}

export const expenseNoCategory: Expense = {
  // بيانات قديمة بلا فئة — يجب أن تُصنَّف «أخرى» لا أن تختفي
  id: 'exp-5',
  date: '2026-07-25',
  description: 'مصروف قديم بلا فئة',
  amount: 120,
  originalAmount: 120,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [1, 2, 3, 4],
  createdAt: T0 + 4 * day,
  deletedAt: null,
}

export const expenses: Expense[] = [
  expenseSimple, expenseForeignCurrency, expenseUnevenSplit,
  expensePending, expenseNoCategory,
]

// ─── مخرجات محسوبة — مشتقّة لا مكتوبة يدوياً ─────────────────────────────────
//
// ⚠️ كانت هذه الأرقام مكتوبة يدوياً في أول نسخة من هذا الملف، وكانت **لا تطابق**
// ما تنتجه الدوال فعلياً من نفس المصاريف (مثال: نصيب أحمد كان 1200 والصحيح 840).
// عيّنة كهذه أسوأ من عدمها: تجعل القصة تعرض أرقاماً متناقضة، ومن يقارن بطاقة
// المسافر بقائمة المصاريف يظن أن في حساب البرنامج خللاً.
//
// الاشتقاق يجعل التناقض مستحيلاً: أي تعديل على `expenses` ينعكس تلقائياً، وأي
// تغيير في منطق الحساب ينعكس في العيّنة أيضاً — وهو المطلوب، لأن القصص يُفترض
// أن تعرض ما يعرضه التطبيق لا ما يُظن أنه يعرضه.
export const balances: TravelerBalance[] = calculateBalances(travelers, expenses)
export const settlements = calculateSettlements(balances)
export const categoryTotals = calculateCategoryTotals(expenses)
export const spendingTrend = calculateSpendingTrend(expenses)

// أرصدة مفردة للحالات البصرية — تُشتقّ من نفس المصفوفة أعلاه لا تُكتب يدوياً.
// فهد بلا إيداع ونصيبه 150 ⇒ رصيد سالب: الحالة التي تقلب البطاقة والشريط للأحمر.
const byShortName = (shortName: string): TravelerBalance =>
  balances.find(b => b.shortName === shortName) ?? balances[0]

export const balancePositive = byShortName('أحمد')
export const balanceNegative = byShortName('فهد')
export const balancePending  = byShortName('سعد')
/** اسم طويل: يكشف قصّ النص (truncate) في البطاقة والقوائم. */
export const balanceLongName = byShortName('عبدالرحمن')

// ─── إعدادات الرحلة ──────────────────────────────────────────────────────────

export const bankDetails: BankDetails = {
  bankName: 'البنك السعودي للاستثمار (SAIB)',
  beneficiary: 'محمد أحمد العاثم',
  iban: 'SA0000000000000000000000',
}

export const itinerary: ItinerarySegment[] = [
  {
    id: 'seg-1',
    mode: 'flight',
    identifier: 'QR 1155',
    reference: '8L2HTY',
    departure: { location: 'الدمام (مطار الملك فهد)', time: '2026-07-21T22:30:00' },
    arrival:   { location: 'الدوحة (مطار حمد)',       time: '2026-07-21T23:35:00' },
  },
  {
    id: 'seg-2',
    mode: 'car',
    identifier: 'سيارة يوكن',
    departure: { location: 'وارسو — الفندق', time: '2026-07-25T09:00:00' },
    arrival:   { location: 'كراكوف',         time: '2026-07-25T13:30:00' },
  },
  {
    id: 'seg-3',
    // بلا reference: تختبر إخفاء شارة رقم الحجز
    mode: 'train',
    identifier: 'قطار كراكوف — وارسو',
    departure: { location: 'كراكوف', time: '2026-08-05T16:00:00' },
    arrival:   { location: 'وارسو',  time: '2026-08-05T18:40:00' },
  },
]

// ─── حالات فارغة ─────────────────────────────────────────────────────────────
// تُمرَّر صراحةً للقصص التي تعرض EmptyState، حتى يكون «الفارغ» حالة مقصودة
// موثّقة لا نتيجة نسيان تمرير البيانات.

export const noTravelers: Traveler[] = []
export const noExpenses: Expense[] = []
export const noSettlements: typeof settlements = []
export const noItinerary: ItinerarySegment[] = []
