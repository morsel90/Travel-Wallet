// 🆕 رابط التطبيق على عنوانه الأساسي — لمن فتحه من عنوان لا يقبله Firebase.
//
// كل نشر على Vercel يأخذ عنواناً فريداً (`travel-app-final-<hash>-….vercel.app`)،
// وهو ما يصل في رسائل النشر البريدية. قائمة «النطاقات المصرّح بها» في Firebase
// Auth لا تقبل أنماطاً، فالدخول عبر Google يفشل من كل عنوان كهذا بـ
// `auth/unauthorized-domain` — ويستحيل إصلاح ذلك بإضافة العنوان، لأنه يتغيّر مع
// كل نشر. المخرج الوحيد: إرسال المستخدم إلى العنوان الأساسي.
//
// ⚠️ العنوان الأساسي **مُشتقّ لا مكتوب حرفياً**: VITE_APP_PRODUCTION_HOST إن
// عُرِّف، وإلا VERCEL_PROJECT_PRODUCTION_URL (متغيّر نظام يوفّره Vercel لكل
// بناء) — انظر vite.config.js. عنوان حرفي كان سيوجّه بناء staging إلى الإنتاج،
// وهذا بالضبط ما منعته القاعدة 4 في CONTRIBUTING.md.
//
// غيابه (البناء المحلي، E2E) يعني null: لا رابط ولا تنبيه، والتطبيق كما كان.

interface LocationLike {
  host: string
  pathname: string
  search: string
  hash: string
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

/** يُرجع رابط الصفحة نفسها على العنوان الأساسي، أو null حين لا حاجة لذلك. */
export function canonicalAppUrl(location: LocationLike, productionHost: string | undefined): string | null {
  const host = (productionHost ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!host) return null
  if (location.host === host || LOCAL_HOSTS.test(location.host)) return null
  // المسار والاستعلام يُنقلان كما هما — ?trip= و?invite= يجب أن ينجوا من الانتقال.
  return `https://${host}${location.pathname}${location.search}${location.hash}`
}
