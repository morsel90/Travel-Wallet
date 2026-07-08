import type { Traveler, CurrencyMap } from './types'

export const INITIAL_TRAVELERS: Traveler[] = [
  { id: 1, name: 'محمد العاثم',        shortName: 'محمد',       deposited: 214  },
  { id: 2, name: 'عيسى آل شبير',      shortName: 'عيسى',       deposited: 314  },
  { id: 3, name: 'عبدالمجيد الدبيخي', shortName: 'عبدالمجيد',  deposited: 1214 },
  { id: 4, name: 'فرحان الملا',        shortName: 'فرحان',      deposited: 1214 },
]

export const BANK_DETAILS = {
  bankName:    'البنك السعودي للاستثمار (SAIB)',
  beneficiary: 'محمد أحمد عبدلله العاثم',
  iban:        'SA3265000005555459829001',
} as const

// ⚠️ يجب أن يطابق هذا البريد تماماً:
//   1) المستخدم المنشأ في Firebase Console › Authentication › Users
//   2) البريد الوارد في دالة isAdmin() داخل Firestore Security Rules
export const ADMIN_EMAILS: string[] = ['mostqbel.morsel@gmail.com']

export const FALLBACK_RATES: Record<string, number> = {
  SAR: 1, USD: 3.75, PLN: 0.97, AED: 1.02,
  BHD: 9.95, KWD: 12.20, EUR: 4.10, GBP: 4.80, TRY: 0.12,
}

// 🆕 فئات المصاريف الثابتة — تُستخدم في نموذج إضافة/تعديل المصروف وفي الرسم
// البياني الدائري لتوزيع المصاريف حسب الفئة. "أخرى" آخر عنصر عمداً (تصنيف
// افتراضي للمصاريف القديمة التي أُضيفت قبل هذا الحقل ولا تملك فئة محفوظة).
export const EXPENSE_CATEGORIES: string[] = [
  'مواصلات', 'طعام وشراب', 'إقامة', 'أنشطة وترفيه', 'تسوق', 'أخرى',
]

export const CURRENCY_LABELS: Record<string, string> = {
  SAR: 'ريال (SAR)',
  USD: 'دولار (USD)',
  PLN: 'زلوتي بولندي (zł)',
  AED: 'درهم (AED)',
  BHD: 'دينار بحريني (BHD)',
  KWD: 'دينار كويتي (KWD)',
  EUR: 'يورو (EUR)',
  GBP: 'جنيه (GBP)',
  TRY: 'ليرة تركية (TRY)',
}

export const buildCurrencyMap = (rates: Record<string, number>): CurrencyMap =>
  Object.keys(CURRENCY_LABELS).reduce<CurrencyMap>((acc, code) => {
    acc[code] = {
      label: CURRENCY_LABELS[code],
      rate:  rates[code] ?? FALLBACK_RATES[code],
    }
    return acc
  }, {})
