#!/usr/bin/env node
// ─── تشغيل أمر داخل محاكيات Firebase مع رمز خروج موثوق ───────────────────────
//
// ⚠️ سبب وجود هذا الغلاف: `firebase emulators:exec` يُنهي العملية أحياناً برمز
// خروج غير صفري (2) أثناء *إطفاء* المحاكيات، حتى بعد أن يعلن صراحةً
// «✔ Script exited successfully (code 0)». رُصد هذا فعلياً على Node 24 (وهو
// أحدث مما تدعمه firebase-tools رسمياً) في كل من اختبارات القواعد وE2E.
//
// الأثر لولا هذا الغلاف: وظائف CI تفشل دائماً رغم نجاح كل الاختبارات — وهو أسوأ
// من عدم وجود اختبارات أصلاً، لأن فشلاً دائماً متوقَّعاً يُدرَّب الفريق على تجاهله
// فيمرّ الفشل الحقيقي دون أن يلاحظه أحد.
//
// الحل: الأمر الداخلي نفسه يكتب رمز خروجه في ملف مؤقت، وهذا الملف هو المصدر
// الموثوق الوحيد. غياب الملف يعني أن الأمر لم يُنفَّذ إطلاقاً (فشل إقلاع
// المحاكيات مثلاً) ويُعامَل فشلاً — فلا يبتلع الغلاف أخطاءً حقيقية.
//
// الاستخدام:
//   node scripts/run-with-emulators.mjs --only firestore --project demo-x -- vitest run
//
// ملاحظة: يعتمد `echo $?` أي صدفة متوافقة مع POSIX (macOS/Linux وعدّادات CI).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const separator = argv.indexOf('--')

if (separator === -1 || separator === argv.length - 1) {
  console.error('الاستخدام: node scripts/run-with-emulators.mjs <خيارات firebase> -- <الأمر>')
  process.exit(1)
}

/**
 * اقتباس مفرد بصيغة POSIX.
 *
 * ⚠️ حرج: لا تستبدله بـ JSON.stringify (اقتباس مزدوج). الصدفة الخارجية توسّع
 * `$?` داخل الاقتباس المزدوج **قبل** أن يصل النص إلى firebase، فيتحوّل الأمر إلى
 * `echo 0 > marker` حرفياً ويُكتب رمز نجاح دائماً مهما فشلت الاختبارات — أي CI
 * خضراء أبداً وهي عمياء تماماً. الاقتباس المفرد يمنع التوسيع فيصل `$?` كما هو
 * وتوسّعه صدفة firebase الداخلية في وقته الصحيح.
 */
const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const firebaseFlags = argv.slice(0, separator)

// ⚠️ نقتبس كل وسيط على حدة: process.argv يُجرّد اقتباسات الصدفة، فإعادة تجميعها
// بـ join(' ') وحدها تفقد الحدود بين الوسائط. وسيط يحوي مسافة أو قوساً أو أي رمز
// صدفة (مثل `node -e "process.exit(7)"`) كان سيُعاد تفسيره خطأً ويفشل الأمر
// لسبب لا علاقة له بالاختبارات إطلاقاً.
const command = argv.slice(separator + 1).map(shQuote).join(' ')

const marker = `.emulator-exit-${process.pid}`

/**
 * حذف ملف العلامة دون أن يُسقط العملية.
 *
 * ⚠️ `rmSync` قد يرمي رغم `force: true` (صلاحيات، أو نظام ملفات للقراءة فقط —
 * حدث فعلاً أثناء تطوير هذا السكربت). ولو تُرك بلا حماية لانهار الغلاف *قبل*
 * قراءة النتيجة أو بعدها، فأرجع 1 وأظهر اختبارات ناجحة على أنها فاشلة. تنظيف
 * ملف مؤقت لا يجوز أن يقرر مصير تشغيل الاختبارات — لذا نتجاهل فشله بصمت.
 */
function removeMarker() {
  try {
    rmSync(marker, { force: true })
  } catch {
    // متعمّد: انظر أعلاه
  }
}

removeMarker()

/**
 * نسخة firebase-tools المثبّتة في المشروع، لا أي نسخة عامة على النظام.
 *
 * ⚠️ `npm run` وحده هو ما يضيف node_modules/.bin إلى PATH. تشغيل هذا السكربت
 * مباشرةً (`node scripts/run-with-emulators.mjs ...`) يلتقط firebase العام إن
 * وُجد — وقد يكون إصداراً مختلفاً كلياً يطلب نسخة محاكي أخرى فيحاول تنزيلها،
 * فيفشل التشغيل لسبب لا علاقة له بالمشروع. حدث هذا فعلاً: نسخة عامة 15.x طلبت
 * محاكياً أحدث بينما نسخة المشروع 13.x تستخدم المخزَّن أصلاً.
 *
 * تثبيت المسار يجعل السلوك واحداً سواء شُغّل عبر npm أو مباشرةً أو في CI.
 */
const localFirebase = join(process.cwd(), 'node_modules', '.bin', 'firebase')
const firebaseBin = existsSync(localFirebase) ? localFirebase : 'firebase'

// لا نستخدم && أو ; مع set -e: نريد كتابة رمز الخروج مهما كان (نجاحاً أو فشلاً)
const inner = `${command}; echo $? > ${marker}`
const full = `${shQuote(firebaseBin)} emulators:exec ${firebaseFlags.join(' ')} ${shQuote(inner)}`

spawnSync(full, { stdio: 'inherit', shell: true })

let exitCode = 1
if (existsSync(marker)) {
  const parsed = Number.parseInt(readFileSync(marker, 'utf8').trim(), 10)
  exitCode = Number.isFinite(parsed) ? parsed : 1
} else {
  console.error(
    '\n✖ لم يُنفَّذ الأمر داخل المحاكيات إطلاقاً — راجع firebase-debug.log ' +
    '(سبب شائع: منفذ مشغول، أو Java غير مثبّتة).'
  )
}
removeMarker()

process.exit(exitCode)
