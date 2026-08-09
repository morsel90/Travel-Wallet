// 🆕 أدوات دورة حياة الرحلة — دوال نقية قابلة للاختبار بلا React ولا Firestore.
//
// ⚠️ هذه الدوال **لا تحمي شيئاً**. الحماية الفعلية في firestore.rules
// (tripAcceptsExpenses / tripAcceptsWrites). ما هنا لإخفاء الأزرار وعرض رسائل
// مفهومة بدل ترك المستخدم يضغط زراً سترفضه القواعد بخطأ صلاحيات غامض.
//
// أي تعديل على الدلالة هنا يجب أن يقابله تعديل مطابق في القواعد — وإلا اختلفت
// الواجهة عن الخادم وظهر السلوك كعطل عشوائي.
import type { TripStatus } from '../types'

const VALID: readonly TripStatus[] = ['active', 'completed', 'archived']

/**
 * يحوّل قيمة `status` القادمة من Firestore إلى حالة صالحة.
 *
 * ⚠️ غياب الحقل — أو أي قيمة غير متوقّعة — يُعامَل كـ `active`. هذا ليس تساهلاً
 * بل شرط توافق خلفي: كل رحلة أُنشئت قبل هذه الميزة لا تملك الحقل، ولو عوملناها
 * كغير نشطة لتجمّدت كل الرحلات القائمة فور نشر الميزة. القواعد تتبع نفس المبدأ.
 */
export function normalizeTripStatus(value: unknown): TripStatus {
  return VALID.includes(value as TripStatus) ? (value as TripStatus) : 'active'
}

/** هل تقبل الرحلة مصاريف جديدة أو تعديلاً عليها؟ (يطابق tripAcceptsExpenses في القواعد) */
export function acceptsExpenses(status: TripStatus): boolean {
  return status === 'active'
}

/** هل تقبل الرحلة بقية الكتابات (مسافرون، إيداعات)؟ (يطابق tripAcceptsWrites في القواعد) */
export function acceptsWrites(status: TripStatus): boolean {
  return status !== 'archived'
}

/** رسالة تشرح سبب تعطيل الإدخال — تُعرض للمستخدم بدل ترك الواجهة صامتة. */
export function closedTripNotice(status: TripStatus): string | null {
  if (status === 'completed') {
    return 'هذه الرحلة منتهية — لا يمكن تسجيل مصاريف جديدة، لكن يمكنك مراجعة الحسابات وتعديل الأرصدة وتصدير التقارير.'
  }
  if (status === 'archived') {
    return 'هذه الرحلة مؤرشفة — للاطّلاع والتقارير فقط، ولا يمكن تعديل أي بيانات فيها.'
  }
  return null
}
