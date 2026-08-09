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

const argv = process.argv.slice(2)
const separator = argv.indexOf('--')

if (separator === -1 || separator === argv.length - 1) {
  console.error('الاستخدام: node scripts/run-with-emulators.mjs <خيارات firebase> -- <الأمر>')
  process.exit(1)
}

const firebaseFlags = argv.slice(0, separator)
const command = argv.slice(separator + 1).join(' ')

const marker = `.emulator-exit-${process.pid}`
rmSync(marker, { force: true })

/**
 * اقتباس مفرد بصيغة POSIX.
 *
 * ⚠️ حرج: لا تستبدله بـ JSON.stringify (اقتباس مزدوج). الصدفة الخارجية توسّع
 * `$?` داخل الاقتباس المزدوج **قبل** أن يصل النص إلى firebase، فيتحوّل الأمر إلى
 * `echo 0 > marker` حرفياً ويُكتب رمز نجاح دائماً مهما فشلت الاختبارات — أي CI
 * خضراء أبداً وهي عمياء تماماً. الاقتباس المفرد يمنع التوسيع فيصل `$?` كما هو
 * وتوسّعه صدفة firebase الداخلية في وقته الصحيح.
 */
const shQuote = (value) => `'${value.replace(/'/g, `'\\''`)}'`

// لا نستخدم && أو ; مع set -e: نريد كتابة رمز الخروج مهما كان (نجاحاً أو فشلاً)
const inner = `${command}; echo $? > ${marker}`
const full = `firebase emulators:exec ${firebaseFlags.join(' ')} ${shQuote(inner)}`

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
rmSync(marker, { force: true })

process.exit(exitCode)
