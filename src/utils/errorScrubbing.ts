import type { ErrorEvent, Breadcrumb } from '@sentry/react'

// 🆕 تنقية بيانات Sentry من الحقول الحساسة — دوال بحتة (انظر
// errorScrubbing.test.ts).
//
// هذا تطبيق مالي حقيقي: IBAN كامل واسم مستفيد (BankDetails)، بريد واسم
// عرض حقيقيين (User)، نص وصف مصروف حر (Expense.description). الافتراضات
// الجاهزة لأي أداة تتبع أخطاء (breadcrumbs من console/XHR/fetch، سياق
// المستخدم) قد تلتقط أياً من هذا دون قصد. `sendDefaultPii: false` في إعداد
// Sentry يمنع أغلبه، وهذا حزام أمان إضافي يعمل على أي بيانات تصل فعلياً
// عبر extra/breadcrumbs.
//
// ⚠️ القائمة أسماء حقول لا مسارات — أي حقل بهذا الاسم يُحذَف أينما ظهر
// متداخلاً، عمداً: أبسط من تتبع كل مسار محتمل، وأكثر أماناً حين يُضاف حقل
// جديد بنفس الاسم في مكان لم يُتوقَّع.
const SENSITIVE_KEYS = new Set([
  'iban', 'bankName', 'beneficiary', 'bankDetails', 'walletName', 'walletPhone',
  'email', 'displayName', 'changedByEmail',
  'description', 'name', 'shortName',
])

const REDACTED = '[محذوف]'

function deepScrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepScrub)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEYS.has(key) ? REDACTED : deepScrub(v)])
    )
  }
  return value
}

/**
 * `beforeSend` لـ Sentry — يُستدعى قبل إرسال أي حدث خطأ. يحذف سياق المستخدم
 * وتفاصيل الطلب كاملة (قد تحمل querystring حساساً)، وينقّي أي بيانات إضافية
 * (extra) تكرارياً.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user
  delete event.request
  if (event.extra) event.extra = deepScrub(event.extra) as Record<string, unknown>
  return event
}

/**
 * `beforeBreadcrumb` لـ Sentry — أثر XHR/fetch قد يحمل حمولة الطلب (مثال:
 * جسم كتابة Firestore ببيانات مصروف أو بروفايل). نُبقي نوع الأثر وفئته،
 * وننقّي أي بيانات مرفقة به فقط.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = deepScrub(breadcrumb.data) as Record<string, unknown>
  return breadcrumb
}
