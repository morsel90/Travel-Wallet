// ─── إنشاء/تحديث رحلة (دعم رحلات متعددة + مسار التنقل) ────────────────────────
// 🆕 يُنشئ مستندي إعدادات الرحلة في Firestore:
//   trips/{tripId}       — الاسم + تفاصيل الحساب البنكي + مسار الرحلة (itinerary)
//   tripSecrets/{tripId} — هاش رمز PIN (salt + pinHash)، لا يُقرأ من العميل إطلاقاً
//
// الاستخدام: node scripts/create-trip.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createInterface } from 'readline/promises'
import { randomBytes, createHash } from 'crypto'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts وfunctions/index.js
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => rl.question(q)

function hashPin(pin, salt) {
  return createHash('sha256').update(salt + pin).digest('hex')
}

// دالة مساعدة للتحقق من صحة التاريخ وتحويله إلى ISO
function parseDate(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) {
    throw new Error('تنسيق التاريخ غير صحيح.')
  }
  return d.toISOString()
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
    const overwrite = (await ask(
      `⚠️ الرحلة "${tripId}" موجودة مسبقاً.\n` +
      `   سيُستبدل رمز الدخول (يُخرج كل أعضائها)، وتُحدَّث الحقول التي تُدخلها فقط.\n` +
      `   الحقول التي لا تُدخلها (مثل مسار الرحلة) تبقى كما هي.\n` +
      `   المتابعة؟ (اكتب "نعم" للتأكيد): `
    )).trim()
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

  // 🆕--- جمع بيانات مسار الرحلة (Itinerary) ---🆕
  const itinerary = []
  let addSegment = (await ask('\nهل ترغب بإضافة مسار رحلة (طيران، سيارة، قطار)؟ (نعم/لا): ')).trim()
  
  while (addSegment === 'نعم') {
    console.log('\n--- تفاصيل المسار ---')
    const mode = (await ask('نوع التنقل (اكتب: flight أو car أو train أو bus): ')).trim() || 'flight'
    const identifier = (await ask('الوصف أو رقم الرحلة (مثال: QR 1155 أو سيارة يوكن): ')).trim()
    const reference = (await ask('رقم الحجز / PNR (اختياري - اضغط Enter للتخطي): ')).trim()
    
    const depLocation = (await ask('مكان الانطلاق (مدينة أو مطار): ')).trim()
    let depTime
    while (true) {
      try {
        const t = (await ask('وقت الانطلاق (مثال: 2026-07-21 22:30): ')).trim()
        depTime = parseDate(t)
        break
      } catch (e) {
        console.error('❌ التاريخ غير صالح، حاول مجدداً.')
      }
    }

    const arrLocation = (await ask('مكان الوصول (مدينة أو مطار): ')).trim()
    let arrTime
    while (true) {
      try {
        const t = (await ask('وقت الوصول (مثال: 2026-07-22 07:00): ')).trim()
        arrTime = parseDate(t)
        break
      } catch (e) {
        console.error('❌ التاريخ غير صالح، حاول مجدداً.')
      }
    }

    // إضافة الجزء إلى المصفوفة
    itinerary.push({
      id: randomBytes(8).toString('hex'),
      mode,
      identifier,
      ...(reference ? { reference } : {}),
      departure: { location: depLocation, time: depTime },
      arrival: { location: arrLocation, time: arrTime }
    })

    addSegment = (await ask('\nهل ترغب بإضافة وجهة / رحلة أخرى للمسار؟ (نعم/لا): ')).trim()
  }

  // إعداد بيانات الرحلة للحفظ
  const tripData = {
    name,
    bankDetails: { bankName, beneficiary, iban },
  }
  
  // إذا تم إدخال مسار رحلة، أضفه للمستند
  if (itinerary.length > 0) {
    tripData.itinerary = itinerary
  }

  const salt = randomBytes(16).toString('hex')
  const pinHash = hashPin(pin, salt)

  // ⚠️ merge إلزامي: مستند الرحلة يحوي أقساماً مستقلة (الاسم، البنك، المسار)،
  // وtripData أعلاه لا يحوي itinerary إلا إذا أدخلتَه في هذه الجلسة. بلا merge
  // كانت إعادة تشغيل السكربت لتغيير تفاصيل البنك تمحو مسار الرحلة بالكامل
  // بصمت. نفس القاعدة المطبَّقة في hooks/useTripAdminActions.ts.
  await db.collection('trips').doc(tripId).set(tripData, { merge: true })

  // السرّ يُستبدل كاملاً عمداً — ملح وهاش جديدان لا يُدمجان مع القديم.
  await db.collection('tripSecrets').doc(tripId).set({ salt, pinHash })

  console.log(`\n✅ تم إنشاء/تحديث الرحلة "${tripId}".`)
  console.log(`🔗 رابط الرحلة: <رابط موقعك>/?trip=${tripId}`)
  console.log(`🔑 رمز PIN لهذه الرحلة: ${pin} — شاركه مع أعضاء هذه الرحلة فقط، ولن يُعرض مرة أخرى (الرمز نفسه غير مخزَّن، فقط هاشه).`)
  
  if (itinerary.length > 0) {
    console.log(`✈️ تم إضافة عدد (${itinerary.length}) مسار تنقل للرحلة بنجاح.`)
  }

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})