// ─── تحميل مفتاح حساب الخدمة (Admin SDK) ─────────────────────────────────────
//
// 🆕 مصدر واحد لتحديد المفتاح، ويقبل مساراً مختلفاً لكل بيئة عبر متغير البيئة
// FIREBASE_SERVICE_ACCOUNT. كانت كل السكربتات تقرأ `serviceAccountKey.json`
// حرفياً، أي أن تشغيل أي منها على بيئة أخرى (staging) كان يتطلب استبدال الملف
// يدوياً — وهو خطأ مؤجَّل: تنسى الاستبدال فتكتب في الإنتاج وأنت تظن أنك في
// بيئة الاختبار، ولا شيء في المخرجات يخبرك بذلك.
//
// الاستخدام:
//   node scripts/create-trip.mjs                                   → مفتاح الإنتاج الافتراضي
//   FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.staging.json node …  → بيئة أخرى
//
// ⚠️ كل ملفات المفاتيح مستثناة من git (انظر .gitignore) ويجب أن تبقى كذلك.
import { readFileSync } from 'fs'
import { dirname, join, isAbsolute } from 'path'
import { fileURLToPath } from 'url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')

export function loadServiceAccount() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  const relativeOrAbsolute = configured || 'serviceAccountKey.json'
  const path = isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : join(projectRoot, relativeOrAbsolute)

  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.error(
      `❌ تعذّرت قراءة مفتاح حساب الخدمة من: ${path}\n` +
      `   حدّد مساراً آخر عبر FIREBASE_SERVICE_ACCOUNT، أو نزّل المفتاح من\n` +
      `   Firebase Console › Project settings › Service accounts.`
    )
    process.exit(1)
  }

  const parsed = JSON.parse(raw)

  // إعلان صريح للمشروع المستهدف قبل أي كتابة — الحاجز الأخير ضد تشغيل سكربت
  // إداري على الإنتاج بالخطأ وأنت تحسبه على بيئة الاختبار.
  console.log(`🔑 مشروع Firebase المستهدَف: ${parsed.project_id}`)

  return parsed
}
