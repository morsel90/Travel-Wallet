// scripts/add-flights.mjs
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serviceAccount = JSON.parse(readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'))

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function main() {
  // ⚠️ ضع معرّف الرحلة الحالي الخاص بك هنا (الموجود في الرابط بعد ?trip=)
  const TRIP_ID = 'travelapp-87206' 

  if (TRIP_ID === 'YOUR_TRIP_ID') {
    console.error('❌ يرجى تعديل TRIP_ID في السكربت أولاً!')
    process.exit(1)
  }

  const itinerary = [
    {
      id: randomBytes(8).toString('hex'),
      mode: 'flight',
      identifier: 'QR 1155',
      reference: '8L2HTY',
      departure: { location: 'الدمام (مطار الملك فهد)', time: '2026-07-21T22:30:00' },
      arrival: { location: 'الدوحة (مطار حمد)', time: '2026-07-21T23:35:00' }
    },
    {
      id: randomBytes(8).toString('hex'),
      mode: 'flight',
      identifier: 'QR 263',
      reference: '8L2HTY',
      departure: { location: 'الدوحة (مطار حمد)', time: '2026-07-22T02:00:00' },
      arrival: { location: 'وارسو (مطار شوبان)', time: '2026-07-22T07:00:00' }
    },
    {
      id: randomBytes(8).toString('hex'),
      mode: 'flight',
      identifier: 'QR 260',
      reference: '8L2HTY',
      departure: { location: 'وارسو (مطار شوبان)', time: '2026-08-06T17:40:00' },
      arrival: { location: 'الدوحة (مطار حمد)', time: '2026-08-07T00:10:00' }
    },
    {
      id: randomBytes(8).toString('hex'),
      mode: 'flight',
      identifier: 'QR 1156',
      reference: '8L2HTY',
      departure: { location: 'الدوحة (مطار حمد)', time: '2026-08-07T02:20:00' },
      arrival: { location: 'الدمام (مطار الملك فهد)', time: '2026-08-07T03:25:00' }
    }
  ]

  try {
    const tripRef = db.collection('trips').doc(TRIP_ID)
    const doc = await tripRef.get()

    if (!doc.exists) {
      console.error(`❌ الرحلة ${TRIP_ID} غير موجودة في قاعدة البيانات.`)
      process.exit(1)
    }

    await tripRef.update({ itinerary })
    console.log(`✅ تم إضافة مسار الرحلة بنجاح إلى الرحلة: ${TRIP_ID}`)
  } catch (error) {
    console.error('❌ حدث خطأ أثناء التحديث:', error)
  }
}

main()