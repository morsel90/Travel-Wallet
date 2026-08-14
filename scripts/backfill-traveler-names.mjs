// ─── ترحيل: إنشاء مستندات حجز الأسماء للمسافرين القائمين ─────────────────────
//
// لماذا هذا السكربت مطلوب مرة واحدة؟ تفرّد الاسم المختصر صار مفروضاً خادميًا عبر
// مستند حجز معرّفه هو الاسم نفسه:
//   artifacts/{tripId}/public/data/travelerNames/{shortName}
// المسافرون الذين أُضيفوا قبل هذا التغيير لا حجز لأسمائهم، فلا شيء يمنع تسجيل
// اسم مطابق لأحدهم من جهاز آخر (الفحص المحلي وحده يبقى، وهو ما نحاول تجاوزه).
// هذا السكربت يملأ الفجوة لكل الرحلات دفعة واحدة.
//
// الاستخدام:
//   node scripts/backfill-traveler-names.mjs           # عرض ما سيحدث دون كتابة
//   node scripts/backfill-traveler-names.mjs --apply   # التنفيذ الفعلي
//
// آمن للتكرار (idempotent): يتخطّى أي حجز موجود، فلا يضرّ تشغيله مرتين.
//
// 🆕 ولا يُحذف بعد اكتمال الترحيل: **وضع العرض (بلا ‎--apply) أداة تدقيق دائمة.**
// الترحيل نفسه لمرة واحدة — سكّانه مغلقون لأن كل مسافر جديد يُكتب مع حجز اسمه
// في writeBatch واحدة (القاعدة ٦) — لكن التشغيل بلا ‎--apply يكشف حالتين لا
// يفحصهما شيء آخر في المشروع:
//
//   • تكرار فعلي في shortName وقع قبل فرض التفرّد خادميًا (conflicts أدناه)
//   • اسم لا يصلح معرّف مستند فيستحيل حجزه أصلاً (invalid أدناه)
//
// وكلاهما يعني أن التفرّد **غير مفروض** على ذلك المسافر تحديداً، بينما تفترض
// الواجهة أنه مفروض على الجميع. هذا نفس مبرّر بقاء audit-legacy-docs.mjs: سؤال
// يُطرح مرة كل بضعة أشهر ولا يستحق أن يُدفع ثمنه في كل كتابة.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const APPLY = process.argv.includes('--apply')

// نفس فحص isValidNameKey في src/utils/travelerName.ts — اسم لا يصلح معرّف
// مستند لا يمكن حجزه، ويجب أن يُعاد تسميته يدوياً من الواجهة.
function isValidNameKey(shortName) {
  if (!shortName) return false
  if (shortName.includes('/')) return false
  if (shortName === '.' || shortName === '..') return false
  if (/^__.*__$/.test(shortName)) return false
  return Buffer.byteLength(shortName, 'utf8') <= 1500
}

async function backfillTrip(tripId) {
  const travelersCol = db.collection(`artifacts/${tripId}/public/data/travelers`)
  const namesCol = db.collection(`artifacts/${tripId}/public/data/travelerNames`)

  const snap = await travelersCol.get()
  if (snap.empty) return { tripId, created: 0, skipped: 0, conflicts: [], invalid: [] }

  let created = 0
  let skipped = 0
  const conflicts = []
  const invalid = []

  for (const docSnap of snap.docs) {
    const t = docSnap.data()

    // المحذوفون نعومةً لا يحجزون أسماءهم — يطابق سلوك التطبيق: النقل للسلة
    // يُحرِّر الاسم، والاستعادة تعيد حجزه.
    if (t.deletedAt) { skipped++; continue }

    const shortName = String(t.shortName ?? '').trim()
    if (!isValidNameKey(shortName)) {
      invalid.push({ id: t.id, name: t.name, shortName })
      continue
    }

    const claimRef = namesCol.doc(shortName)
    const existing = await claimRef.get()

    if (existing.exists) {
      // حجز موجود لمسافر آخر = تكرار فعلي وقع قبل التغيير ويحتاج قراراً بشرياً
      if (existing.data().travelerId !== t.id) {
        conflicts.push({ shortName, keptId: existing.data().travelerId, conflictingId: t.id, name: t.name })
      } else {
        skipped++
      }
      continue
    }

    if (APPLY) await claimRef.set({ travelerId: t.id })
    created++
  }

  return { tripId, created, skipped, conflicts, invalid }
}

async function main() {
  console.log(APPLY ? '🚀 تنفيذ فعلي\n' : '🔍 عرض فقط (بلا كتابة) — أضف ‎--apply للتنفيذ\n')

  const trips = await db.collection('trips').get()
  if (trips.empty) {
    console.log('⚠️ لا توجد رحلات.')
    return
  }

  let totalCreated = 0
  const allConflicts = []
  const allInvalid = []

  for (const tripDoc of trips.docs) {
    const r = await backfillTrip(tripDoc.id)
    totalCreated += r.created
    r.conflicts.forEach(c => allConflicts.push({ ...c, tripId: r.tripId }))
    r.invalid.forEach(i => allInvalid.push({ ...i, tripId: r.tripId }))
    console.log(`📌 ${r.tripId}: ${r.created} حجز ${APPLY ? 'أُنشئ' : 'سيُنشأ'}، ${r.skipped} متخطّى`)
  }

  if (allConflicts.length) {
    console.log('\n⚠️ تكرارات فعلية وقعت قبل هذا التغيير — تحتاج إعادة تسمية يدوية:')
    for (const c of allConflicts) {
      console.log(`   [${c.tripId}] "${c.shortName}": الحجز للمسافر ${c.keptId}، والمسافر ${c.conflictingId} (${c.name}) بلا حجز`)
    }
    console.log('   أعد تسمية أحدهما من التطبيق ثم شغّل السكربت مجدداً.')
  }

  if (allInvalid.length) {
    console.log('\n⚠️ أسماء لا تصلح معرّف مستند (شرطة مائلة أو فارغة):')
    for (const i of allInvalid) {
      console.log(`   [${i.tripId}] المسافر ${i.id} (${i.name}) — الاسم المختصر: "${i.shortName}"`)
    }
  }

  console.log(`\n✅ الإجمالي: ${totalCreated} حجز ${APPLY ? 'أُنشئ' : 'سيُنشأ'}.`)
  if (!APPLY && totalCreated > 0) console.log('   أعد التشغيل بـ ‎--apply للتنفيذ.')
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
