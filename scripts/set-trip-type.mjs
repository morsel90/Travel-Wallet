// ─── تحويل رحلة إلى انتداب طويل المدى (والعكس) ───────────────────────────────
//
// 🆕 يضبط `tripType` على مستند trips/{tripId} — وهو الحقل الوحيد الذي يفتح
// واجهة «الشهر المحاسبي» وإغلاق الشهر (انظر src/utils/tripType.ts).
//
// لماذا سكربت Admin SDK لا زرّ في لوحة الإدارة؟
//   لأن التحويل عملية تُنفَّذ **مرة واحدة لكل رحلة** ولها أثر بنيوي: بعدها
//   تصير حركات مالية تُكتب تلقائياً في دفتر الرحلة عند كل إغلاق شهر. القواعد
//   تسمح للمنظّم/المسؤول بكتابة الحقل أصلاً (isValidTripConfig)، فلا حاجز
//   تقنياً — لكن إضافة زرّ لعملية بهذا الأثر وبهذه الندرة تشتري خطر ضغطة خاطئة
//   بلا مقابل. نفس منطق set-admin.mjs بالضبط.
//
// الاستخدام:
//   node scripts/set-trip-type.mjs list                          → عرض كل الرحلات وأنواعها
//   node scripts/set-trip-type.mjs long_term <tripId>            → تحويل لانتداب طويل
//   node scripts/set-trip-type.mjs standard  <tripId>            → إرجاعها رحلة قياسية
//
// ⚠️ التحويل إلى long_term يضبط أيضاً `currentPeriod` على الشهر الميلادي
// الجاري **إن لم يكن مضبوطاً**، ولا يلمسه إن كان — فرحلة أُغلق فيها شهر ثم
// أُعيد ضبط نوعها لا يُعاد شهرها للوراء (وذلك بالضبط ما يسمح بترحيل مزدوج).
//
// ⚠️ الرجوع إلى standard **لا يحذف أي حركة مُرحَّلة سابقاً** ولا يُلغي أثرها
// المالي — يُخفي الواجهة فقط. الحركات مصاريف وإيداعات عادية موثّقة، وحذفها
// يخالف القاعدة ٥ (لا حذف صلب) ويترك سطور تدقيق بلا رصيد يقابلها.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const VALID_TYPES = ['standard', 'long_term']

const currentPeriodKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

async function listTrips() {
  const snap = await db.collection('trips').get()
  if (snap.empty) {
    console.log('لا توجد رحلات في هذا المشروع.')
    return
  }
  console.log(`\nالرحلات (${snap.size}):\n`)
  snap.docs.forEach((doc) => {
    const d = doc.data()
    const type = d.tripType || 'standard'
    const period = type === 'long_term' ? `  الشهر المفتوح: ${d.currentPeriod || '(غير مضبوط)'}` : ''
    const closed = d.lastClosedPeriod ? `  آخر إغلاق: ${d.lastClosedPeriod}` : ''
    console.log(`  ${doc.id}  —  ${d.name || '(بلا اسم)'}  [${type}]${period}${closed}`)
  })
  console.log('')
}

async function main() {
  const [, , action, tripId] = process.argv

  if (action === 'list') return listTrips()

  if (!VALID_TYPES.includes(action) || !tripId) {
    console.error(
      'الاستخدام:\n' +
      '  node scripts/set-trip-type.mjs list\n' +
      '  node scripts/set-trip-type.mjs long_term <tripId>\n' +
      '  node scripts/set-trip-type.mjs standard  <tripId>'
    )
    process.exit(1)
  }

  const ref = db.collection('trips').doc(tripId)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`❌ الرحلة "${tripId}" غير موجودة. شغّل \`list\` لعرض الرحلات المتاحة.`)
    process.exit(1)
  }

  const data = snap.data()
  const previous = data.tripType || 'standard'
  const update = { tripType: action }

  // لا يُلمس currentPeriod إن كان مضبوطاً — انظر تحذير الأعلى.
  if (action === 'long_term' && !data.currentPeriod) {
    update.currentPeriod = currentPeriodKey()
  }

  await ref.set(update, { merge: true })

  console.log(`✅ "${data.name || tripId}" (${tripId}): ${previous} → ${action}`)
  if (update.currentPeriod) console.log(`   الشهر المحاسبي المفتوح: ${update.currentPeriod}`)
  if (action === 'long_term') {
    console.log('   افتح الرحلة الآن — سيظهر قسم «الشهر المحاسبي» لمنظّمها وللمسؤول.')
  }
}

main().catch((err) => {
  console.error('❌ فشل التنفيذ:', err.message)
  process.exit(1)
})
