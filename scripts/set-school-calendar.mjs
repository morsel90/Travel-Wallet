// scripts/set-school-calendar.mjs
//
// يكتب مسار رحلة "المدرسة" كاملاً من التقويم الدراسي 1448/1449 هـ (2026/2027 م).
// كل إجازة مقطعان: الذهاب إليها (أول يوم إجازة) والعودة منها (أول يوم دراسة)،
// وهو نفس الاصطلاح المستخدم في المقاطع الأربعة التي أُدخلت يدوياً قبل ذلك.
//
//   node scripts/set-school-calendar.mjs            → معاينة فقط، بلا كتابة
//   node scripts/set-school-calendar.mjs --write    → يكتب فعلياً (مع نسخة احتياطية)
//   TRIP_ID=other node scripts/set-school-calendar.mjs   → رحلة أخرى
//
// ⚠️ يستبدل حقل itinerary بالكامل. النسخة القديمة تُحفظ في ملف JSON بجانب
//    الجذر قبل أي كتابة، فالرجوع ممكن دائماً.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import { loadServiceAccount } from './serviceAccount.mjs'

const TRIP_ID = process.env.TRIP_ID?.trim() || 'Mdrsah'
const WRITE = process.argv.includes('--write')

const nid = () => randomBytes(8).toString('hex')
const seg = (id, from, to, time) => ({
  id,
  mode: 'car',
  departure: { location: from, time },
  arrival: { location: to },
})

// معرّفات المقاطع الأربعة الموجودة أصلاً — تبقى كما هي بدل إنشاء بدائل لها.
const KEEP = {
  start:        'c82d6307fe76e891',
  toNational:   '89268c519df3189c',
  fromNational: '0ecd3a7842be9390',
  endOfYear:    '2fb141eebe36ac80',
}

const itinerary = [
  seg(KEEP.start,        'إجازة الصيف',        'المدرسة',            '2026-08-23T06:45:00'),
  seg(KEEP.toNational,   'المدرسة',            'إجازة اليوم الوطني', '2026-09-23T18:15:00'),
  seg(KEEP.fromNational, 'إجازة اليوم الوطني', 'المدرسة',            '2026-09-27T06:15:00'),
  seg(nid(), 'المدرسة',           'إجازة الخريف',      '2026-11-20T11:45:00'),
  seg(nid(), 'إجازة الخريف',      'المدرسة',           '2026-11-29T06:15:00'),
  seg(nid(), 'المدرسة',           'إجازة منتصف العام', '2027-01-08T11:45:00'),
  seg(nid(), 'إجازة منتصف العام', 'المدرسة',           '2027-01-17T06:15:00'),
  seg(nid(), 'المدرسة',           'إجازة يوم التأسيس', '2027-02-19T11:45:00'),
  seg(nid(), 'إجازة يوم التأسيس', 'المدرسة',           '2027-02-23T06:15:00'),
  seg(nid(), 'المدرسة',           'إجازة عيد الفطر',   '2027-02-26T11:45:00'),
  seg(nid(), 'إجازة عيد الفطر',   'المدرسة',           '2027-03-14T06:15:00'),
  seg(nid(), 'المدرسة',           'إجازة عيد الأضحى',  '2027-05-07T11:45:00'),
  seg(nid(), 'إجازة عيد الأضحى',  'المدرسة',           '2027-05-23T06:15:00'),
  seg(KEEP.endOfYear,    'المدرسة',            'إجازة نهاية العام',  '2027-06-24T11:45:00'),
]

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const show = s => {
  const d = new Date(s.departure.time)
  return `${DAYS[d.getDay()]} ${d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' })}` +
         ` — ${s.departure.location} ← ${s.arrival.location}`
}

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()
const ref = db.collection('trips').doc(TRIP_ID)
const snap = await ref.get()
if (!snap.exists) {
  console.error(`❌ الرحلة ${TRIP_ID} غير موجودة.`)
  process.exit(1)
}

console.log(`\n📅 المسار المقترح (${itinerary.length} مقطعاً):`)
itinerary.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${show(s)}`))

if (!WRITE) {
  console.log('\nℹ️  معاينة فقط. أضف --write للكتابة الفعلية.')
  process.exit(0)
}

const old = snap.data().itinerary ?? []
const backup = `itinerary-backup-${TRIP_ID}-${Date.now()}.json`
writeFileSync(backup, JSON.stringify(old, null, 2))
console.log(`\n💾 نسخة احتياطية للمسار القديم (${old.length} مقاطع) → ${backup}`)

// 🆕 رفع عدّاد نسخة المسار — Admin SDK يتجاوز firestore.rules، فلا شيء يفرض
// هذا سوى السطر نفسه. وتركه كان **السبب المباشر** لضياع أول كتابة بهذا
// السكربت: نجحت، ثم محتها بعد عشر ثوانٍ مسوّدة قديمة مفتوحة في متصفح، بلا أي
// خطأ في الطرفين (انظر CHANGELOG 2026-09-05). برفعه هنا يصير المحرّر المفتوح
// حاملاً نسخة قديمة، فيُرفض حفظه بدل أن يفوز.
const rev = Number.isInteger(snap.data().itineraryRev) ? snap.data().itineraryRev : 0
await ref.update({ itinerary, itineraryRev: rev + 1 })
console.log(`✅ حُفظ المسار في الرحلة ${TRIP_ID} (itineraryRev: ${rev} → ${rev + 1}).`)
process.exit(0)
