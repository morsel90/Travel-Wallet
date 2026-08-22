import * as Sentry from '@sentry/react'
import { scrubEvent, scrubBreadcrumb } from './utils/errorScrubbing'

// 🆕 تتبع الأخطاء (Sentry) — اختياري بالكامل، خلافاً لفشل Firebase المتعمَّد
// في firebase.ts. غياب VITE_SENTRY_DSN لا يُسقط التطبيق ولا يمنع تشغيله؛
// تتبع الأخطاء تحسين مراقبة، ليس شرط عمل.
//
// ⚠️ لا Performance Monitoring ولا Session Replay هنا عمداً
// (tracesSampleRate: 0) — المطلوب تتبّع أخطاء فقط.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    sampleRate: 1.0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}
