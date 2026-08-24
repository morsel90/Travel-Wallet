// 🆕 أدوات نوع الرحلة — دوال نقية قابلة للاختبار بلا React ولا Firestore.
//
// نسخة طبق الأصل من فلسفة utils/tripStatus.ts، ولنفس السبب بالضبط: قيمة قادمة
// من Firestore قد تكون غائبة أو تالفة أو من إصدار أحدث من التطبيق، ولا يجوز أن
// تُشتق منها واجهة مختلفة بالصدفة.
//
// ⚠️ وكما هناك: **هذه الدوال لا تحمي شيئاً**. رحلة قياسية لا تُمنع من الترحيل
// بإخفاء زرّ — تُمنع لأن closeMonth/exitTraveler في functions/index.js ترفضان
// أي رحلة ليست long_term صراحةً. ما هنا هو ما يقرّر أي *مكوّن* يُعرض، لا ما
// يقرّر أي *كتابة* تُقبل.
import type { TripType } from '../types'

const VALID: readonly TripType[] = ['standard', 'long_term']

/**
 * يحوّل قيمة `tripType` القادمة من Firestore إلى نوع صالح.
 *
 * ⚠️ غياب الحقل — أو أي قيمة غير متوقّعة — يُعامَل كـ `standard`. هذا شرط
 * توافق خلفي لا تساهل: كل رحلة أُنشئت قبل هذه الميزة لا تحمل الحقل، ولو
 * عُوملت كطويلة المدى لظهرت لها واجهة إغلاق شهر لا معنى لها. القواعد تتبع نفس
 * المبدأ (tripType اختياري في isValidTripConfig).
 */
export function normalizeTripType(value: unknown): TripType {
  return VALID.includes(value as TripType) ? (value as TripType) : 'standard'
}

/** هل هذه رحلة طويلة المدى؟ — الشرط الوحيد الذي تُفتح به مكوّنات longterm/. */
export function isLongTerm(tripType: TripType): boolean {
  return tripType === 'long_term'
}
