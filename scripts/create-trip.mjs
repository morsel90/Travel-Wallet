// ─── إنشاء/تحديث رحلة (دعم رحلات متعددة) ─────────────────────────────────────
// 🆕 يُنشئ مستندي إعدادات الرحلة في Firestore:
//   trips/{tripId}       — الاسم + تفاصيل الحساب البنكي (يقرأها العميل بعد التحقق)
//   tripSecrets/{tripId} — هاش رمز PIN (salt + pinHash)، لا يُقرأ من العميل إطلاقاً
// كلا المستندين محظور الكتابة إليهما من العميل في firestore.rules — الطريقة
// الوحيدة لإنشاء رحلة جديدة (أو تعديل رمزها) هي تشغيل هذا السكربت بصلاحيات
// Admin SDK (نفس نمط migrate-deletedAt.mjs/migrate-participants.mjs).
//
// الاستخدام: node scripts/create-trip.mjs
// (تفاعلي بالكامل — سيسألك عن كل قيمة بالترتيب)
//
// ⚠️ لتفعيل الرحلة الافتراضية الحالية (travelapp-87206) بعد نشر هذا التحديث،
// شغّل هذا السكربت مرة واحدة بمعرّف travelapp-87206 ونفس رمز PIN الذي كان
// مُعرَّفاً سابقاً في Secret Manager (TRIP_PIN) — حتى لا ينقطع الوصول عن
// الأعضاء الحاليين. أعضاء هذه الرحلة سيحتاجون لإعادة إدخال الرمز مرة واحدة
// فقط (تنسيق العضوية تغيّر — انظر تعليق firestore.rules).

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline/promises'
import { randomBytes, createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serviceAccount = JSON.parse(readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'))

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts
// وfunctions/index.js
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => rl.question(q)

function hashPin(pin, salt) {
  return createHash('sha256').update(salt + pin).digest('hex')
}

async function main() {
  console.log('🆕 إنشاء/تحديث رحلة\n')

  const tripId = (await ask('معرّف الرحلة (يُستخدم في الرابط كـ ?trip=xyz — إنجليزي/أرقام/- فقط، بدون مسافات): ')).trim()
  if (!TRIP_ID_PATTERN.test(tripId)) {
    console.error('❌ معرّف غير صالح — إنجليزي/أرقام وشرطة (-) وشرطة سفلية (_) فقط، بطول 1-64 حرفاً.')
    rl.close()
    process.exit(1)
  }

  const existing = await db.collection('trips').doc(tripId).get()
  if (existing.exists) {
    const overwrite = (await ask(`⚠️ الرحلة "${tripId}" موجودة مسبقاً. الكتابة فوق بياناتها ورمزها؟ (اكتب "نعم" للتأكيد): `)).trim()
    if (overwrite !== 'نعم') {
      console.log('أُلغي — لم يتغيّر شيء.')
      rl.close()
      return
    }
  }

  const name        = (await ask('اسم الرحلة (يظهر لاحقاً في الواجهة): ')).trim()
  const bankName    = (await ask('اسم البنك: ')).trim()
  const beneficiary = (await ask('اسم المستفيد على الحساب: ')).trim()
  const iban        = (await ask('رقم الآيبان (IBAN): ')).trim()
  const pin         = (await ask('رمز PIN الخاص بهذه الرحلة (سيُشارَك مع أعضائها): ')).trim()

  if (!pin) {
    console.error('❌ رمز PIN مطلوب.')
    rl.close()
    process.exit(1)
  }

  const salt = randomBytes(16).toString('hex')
  const pinHash = hashPin(pin, salt)

  await db.collection('trips').doc(tripId).set({
    name,
    bankDetails: { bankName, beneficiary, iban },
  })

  await db.collection('tripSecrets').doc(tripId).set({ salt, pinHash })

  console.log(`\n✅ تم إنشاء/تحديث الرحلة "${tripId}".`)
  console.log(`🔗 رابط الرحلة: <رابط موقعك>/?trip=${tripId}`)
  console.log(`🔑 رمز PIN لهذه الرحلة: ${pin} — شاركه مع أعضاء هذه الرحلة فقط، ولن يُعرض مرة أخرى (الرمز نفسه غير مخزَّن، فقط هاشه).`)

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
