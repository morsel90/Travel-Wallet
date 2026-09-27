import type { ErrorEvent, Breadcrumb } from '@sentry/react'

// تنقية أحداث Sentry من البيانات الحساسة (IBAN، البريد، الأسماء، وصف المصروف) —
// حزام أمان فوق `sendDefaultPii: false`.
//
// ⚠️ أسماء حقول لا مسارات عمداً: تُحذف أينما ظهرت، حتى في مكان جديد لم يُتوقَّع.
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
