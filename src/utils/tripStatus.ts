// أدوات دورة حياة الرحلة — دوال نقية.
//
// ⚠️ لا تحمي شيئاً: الحماية في firestore.rules (tripAcceptsExpenses /
// tripAcceptsWrites). أي تغيير في الدلالة هنا يقابله تغيير مطابق هناك.
import type { TripStatus } from '../types'

const VALID: readonly TripStatus[] = ['active', 'completed', 'archived']

/**
 * يحوّل `status` القادمة من Firestore إلى حالة صالحة.
 *
 * ⚠️ الغياب أو القيمة الغريبة = `active` — توافق خلفي مع الرحلات السابقة للحقل،
 * والقواعد تتبع المبدأ نفسه.
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

/** رسالة تعطيل الإدخال. ⚠️ تصف الأثر ولا تسمّي الحالة (لا «منتهية»/«مؤرشفة») — انظر DECISIONS.md. */
export function closedTripNotice(status: TripStatus): string | null {
  if (status === 'completed') {
    return 'انتهت الرحلة — تسجيل المصاريف متوقّف. يمكنك مراجعة الحسابات وتعديل الأرصدة وتصدير التقارير.'
  }
  if (status === 'archived') {
    return 'رحلة قديمة — للاطّلاع والتقارير فقط، ولا يمكن تعديل أي بيانات فيها.'
  }
  return null
}

// رحلة مؤرشفة منذ 90 يوماً يُتاح حذفها رغم بياناتها المالية — بفعل بشري دائماً.
// ⚠️ للعرض فقط؛ الفرض في functions/index.js بنسخة مطابقة (TRIP_PURGE_ELIGIBLE_MS).
export const TRIP_PURGE_ELIGIBLE_MS = 90 * 24 * 60 * 60 * 1000 // 90 يوماً مؤرشفة

/** هل بلغت رحلة مؤرشفة مدة السماح الكافية لإتاحة حذفها النهائي رغم بياناتها؟ */
export function isEligibleForAgePurge(
  status: TripStatus,
  statusChangedAt: number | undefined,
  now: number = Date.now(),
): boolean {
  return status === 'archived'
    && typeof statusChangedAt === 'number'
    && now - statusChangedAt > TRIP_PURGE_ELIGIBLE_MS
}
