// ─── ترحيل + تدقيق: بناء سجلّ عضوية الرحلات للأعضاء القائمين ─────────────────
//
// **لماذا هذا السكربت موجود؟** العضوية تعيش في custom claims حساب العضو نفسه،
// و`trips/{tripId}/members/{uid}` لم يوجد إلا في 2026-08-14. فكل من انضمّ قبل
// ذلك التاريخ **له وصول فعلي ولا سطر له في أي سجلّ** — أي أن قائمة الأعضاء التي
// تعرضها لوحة الإدارة ستبدأ ناقصة، وستبقى ناقصة إلى الأبد ما لم يُعَد بناؤها.
//
// وهذا السكربت هو الطريقة الوحيدة لبنائها: Firebase Auth **لا يقبل استعلاماً على
// الـ claims**، فلا سبيل لسؤال «من عضو في الرحلة س؟». البديل الوحيد هو المرور
// على كل مستخدمي المشروع صفحةً صفحة وقراءة claims كلٍّ منهم — وهو ما نفعله هنا.
// عمليّ لعشرات أو آلاف المستخدمين؛ ولو بلغ المشروع ملايين المستخدمين يوماً لصار
// هذا المسار نفسه غير عملي، وهو سبب إضافي لأن يُكتب السجلّ وقت الانضمام لا لاحقاً.
//
// الاستخدام:
//   node scripts/backfill-member-roster.mjs           # عرض ما سيحدث دون كتابة
//   node scripts/backfill-member-roster.mjs --apply   # التنفيذ الفعلي
//
// آمن للتكرار (idempotent): لا يلمس أي سطر موجود إطلاقاً — انظر التحذير أدناه.
//
// ⚠️ **لا يخترع `joinedAt`.** تاريخ الانضمام غير محفوظ في أي مكان قبل هذا
// التغيير، فلا سبيل لاستنتاجه: لا الـ claims ولا `metadata.creationTime` يعرفانه
// (الأخير يقول متى أُنشئ الحساب، لا متى انضم لهذه الرحلة تحديداً — وهما مختلفان
// لكل من انضمّ لأكثر من رحلة). فيُكتب `backfilledAt` بدله، ويبقى `joinedAt`
// **غائباً** ليقول الحقيقة: غير معروف. كتابة تاريخ تقريبي هنا كانت ستملأ الحقل
// ببيانات تبدو صحيحة ولا أحد يعرف لاحقاً أنها مُخترعة.
//
// ⚠️ **ولا يكتب فوق سطر قائم أبداً.** سطرٌ كتبته joinViaInvite (أو verifyTripPin
// قبل إلغائها) يحمل joinedAt حقيقياً؛ الكتابة فوقه تستبدل معلومة صادقة بأخرى
// مجهولة — أي أن تشغيل السكربت مرتين كان سيُفسد ما أصلحه في المرة الأولى.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
const auth = getAuth()

const APPLY = process.argv.includes('--apply')

/** يمرّ على كل مستخدمي المشروع صفحةً صفحة (1000 لكل صفحة، وهو حدّ Admin SDK). */
async function* allUsers() {
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    for (const user of page.users) yield user
    pageToken = page.pageToken
  } while (pageToken)
}

async function main() {
  console.log(APPLY ? '🚀 تنفيذ فعلي\n' : '🔍 عرض فقط (بلا كتابة) — أضف ‎--apply للتنفيذ\n')

  // الرحلات القائمة — لتمييز عضوية تشير إلى رحلة محذوفة (تبقى في الـ claims لأن
  // حذف الرحلة لا يمسّ claims أعضائها).
  const tripsSnap = await db.collection('trips').get()
  const knownTrips = new Set(tripsSnap.docs.map(d => d.id))

  let scanned = 0
  let withMemberships = 0
  let created = 0
  let alreadyPresent = 0
  const orphanTrips = new Map()   // tripId → عدد الأعضاء المشيرين لرحلة غير موجودة
  const perTrip = new Map()       // tripId → عدد السطور التي ستُنشأ

  for await (const user of allUsers()) {
    scanned++
    const trips = user.customClaims?.trips
    if (!trips || typeof trips !== 'object' || Array.isArray(trips)) continue

    const tripIds = Object.keys(trips).filter(id => trips[id] === true)
    if (tripIds.length === 0) continue
    withMemberships++

    for (const tripId of tripIds) {
      if (!knownTrips.has(tripId)) {
        orphanTrips.set(tripId, (orphanTrips.get(tripId) ?? 0) + 1)
        continue
      }

      const ref = db.collection('trips').doc(tripId).collection('members').doc(user.uid)
      if ((await ref.get()).exists) { alreadyPresent++; continue }

      const payload = { backfilledAt: Date.now() }
      if (user.email) payload.email = user.email
      if (user.displayName) payload.displayName = user.displayName

      if (APPLY) await ref.set(payload)
      created++
      perTrip.set(tripId, (perTrip.get(tripId) ?? 0) + 1)
    }
  }

  console.log(`👥 مستخدمون فُحصوا: ${scanned} — منهم ${withMemberships} لهم عضوية رحلة واحدة على الأقل`)
  console.log(`✅ سطور موجودة مسبقاً (لم تُمسّ): ${alreadyPresent}`)

  if (perTrip.size) {
    console.log(`\n📌 سطور ${APPLY ? 'أُنشئت' : 'ستُنشأ'} لكل رحلة:`)
    for (const [tripId, n] of perTrip) console.log(`   ${tripId}: ${n}`)
  }

  if (orphanTrips.size) {
    console.log('\n⚠️ عضويات تشير إلى رحلات غير موجودة — حذف الرحلة لا يمسح claims أعضائها:')
    for (const [tripId, n] of orphanTrips) console.log(`   ${tripId}: ${n} عضو`)
    console.log('   غير ضارّة (لا بيانات تُقرأ)، لكنها تشغل من ميزانية الـ 900 بايت للـ claims.')
  }

  console.log(`\n✅ الإجمالي: ${created} سطر ${APPLY ? 'أُنشئ' : 'سيُنشأ'} بلا joinedAt (غير معروف).`)
  if (!APPLY && created > 0) console.log('   أعد التشغيل بـ ‎--apply للتنفيذ.')
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
