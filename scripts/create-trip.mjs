// ─── إنشاء/تحديث رحلة (دعم رحلات متعددة + مسار التنقل) ────────────────────────
// 🆕 ينشئ مستند إعدادات الرحلة trips/{tripId} — الاسم + مسار الرحلة
// (itinerary). لا رمز رحلة/PIN بعد الآن (انظر docs/DECISIONS.md) — الانضمام
// يقع حصراً عبر رابط دعوة (يُنشَأ من واجهة إدارة الرحلة بعد إنشائها هنا).
//
// 🆕 لا حقول بنك هنا — بيانات البنك المعروضة لأعضاء الرحلة تُقرأ حيّة من
// بروفايل منظّمها (users/{organizerUid})، لا من مستند الرحلة. هذا السكربت
// أداة يدوية بديلة عن الإنشاء الذاتي داخل التطبيق (الطريق الأساسي الآن)، لذا
// يسأل اختيارياً عن بريد المنظّم ليكتب organizerUid + سجلّ عضويته — إن تُرك
// فارغاً، الرحلة تبقى بلا منظّم معروف حتى يُعيَّن أحد لاحقاً من تبويب الأعضاء.
//
// الاستخدام: node scripts/create-trip.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { createInterface } from 'readline/promises'
import { randomBytes } from 'crypto'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
const auth = getAuth()

// ⚠️ يجب أن يطابق هذا التنسيق تماماً TRIP_ID_PATTERN في src/utils/tripId.ts وfunctions/index.js
const TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => rl.question(q)

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
      `   ستُحدَّث الحقول التي تُدخلها فقط.\n` +
      `   الحقول التي لا تُدخلها (مثل مسار الرحلة) تبقى كما هي.\n` +
      `   المتابعة؟ (اكتب "نعم" للتأكيد): `
    )).trim()
    if (overwrite !== 'نعم') {
      console.log('أُلغي — لم يتغيّر شيء.')
      rl.close()
      return
    }
  }

  const name = (await ask('اسم الرحلة (يظهر لاحقاً في الواجهة): ')).trim()

  // 🆕 منظّم الرحلة — اختياري، بريد حساب سجّل دخوله مرة واحدة على الأقل (نفس
  // شرط set-admin.mjs). بلا منظّم، بطاقة التحويل تعرض حالة فارغة حتى يُعيَّن
  // أحد لاحقاً من تبويب الأعضاء داخل التطبيق.
  const organizerEmail = (await ask('بريد منظّم الرحلة (اختياري — اضغط Enter للتخطي): ')).trim()
  let organizerUid = null
  if (organizerEmail) {
    try {
      const organizerUser = await auth.getUserByEmail(organizerEmail)
      organizerUid = organizerUser.uid
    } catch {
      console.error(`⚠️ لم يُعثر على حساب بالبريد "${organizerEmail}" — الرحلة ستُنشأ بلا منظّم معروف.`)
    }
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
  const tripData = { name }
  if (organizerUid) {
    tripData.organizerUid = organizerUid
  }

  // إذا تم إدخال مسار رحلة، أضفه للمستند
  if (itinerary.length > 0) {
    tripData.itinerary = itinerary
  }

  // 🆕 status: 'active' فقط إن كانت الرحلة جديدة أو تفتقد الحقل أصلاً — لا نكتبه
  // فوق رحلة completed/archived موجودة، وإلا أعاد كل تشغيل لهذا السكربت (لتعديل
  // تفاصيل البنك مثلاً) تفعيل رحلة أُغلقت عمداً. بدون هذا، هذا المسار كان
  // الثغرة الوحيدة المتبقية في إغلاق مجموعة «رحلات بلا status» — manageTrip
  // وrestoreTrip يكتبانه دائماً، وهذا السكربت وحده كان يتجاهله. انظر
  // scripts/audit-legacy-docs.mjs وCLAUDE.md («Legacy-data fallbacks»).
  if (!existing.exists || !('status' in existing.data())) {
    tripData.status = 'active'
  }

  // ⚠️ merge إلزامي: مستند الرحلة يحوي أقساماً مستقلة (الاسم، المسار، المنظّم)،
  // وtripData أعلاه لا يحوي itinerary إلا إذا أدخلتَه في هذه الجلسة. بلا merge
  // كانت إعادة تشغيل السكربت لتعديل الاسم فقط تمحو مسار الرحلة بالكامل بصمت.
  // نفس القاعدة المطبَّقة في hooks/useTripAdminActions.ts.
  await db.collection('trips').doc(tripId).set(tripData, { merge: true })

  // 🆕 claim العضوية + سطر عضوية بدور 'organizer' + organizesTripIds على
  // بروفايله — نفس ما يفعله manageTrip عند الإنشاء الذاتي داخل التطبيق (انظر
  // functions/index.js). بلا claim العضوية، المنظّم لا يستطيع فتح الرحلة أصلاً
  // (isMember() تقرأها من التوكن)، فروسته وحدها لا تكفيه وصولاً حقيقياً.
  if (organizerUid) {
    const organizerRecord = await auth.getUser(organizerUid)
    const existingTrips = (organizerRecord.customClaims && organizerRecord.customClaims.trips) || {}
    await auth.setCustomUserClaims(organizerUid, {
      ...organizerRecord.customClaims,
      trips: { ...existingTrips, [tripId]: true },
    })
    await db.collection('trips').doc(tripId).collection('members').doc(organizerUid)
      .set({ role: 'organizer', joinedAt: Date.now(), lastVerifiedAt: Date.now() }, { merge: true })
    await db.collection('users').doc(organizerUid)
      .set({ organizesTripIds: FieldValue.arrayUnion(tripId) }, { merge: true })
  }

  console.log(`\n✅ تم إنشاء/تحديث الرحلة "${tripId}".`)
  console.log(`🔗 رابط الرحلة: <رابط موقعك>/?trip=${tripId}`)
  console.log('👥 لدعوة الأعضاء: افتح لوحة إدارة الرحلة داخل التطبيق وأنشئ رابط دعوة من تبويب "الأعضاء".')
  if (!organizerUid) {
    console.log('⚠️ لا منظّم معروف لهذه الرحلة — عيّن أحداً من تبويب "الأعضاء" داخل التطبيق ليظهر لبيانات بنكه.')
  }

  if (itinerary.length > 0) {
    console.log(`✈️ تم إضافة عدد (${itinerary.length}) مسار تنقل للرحلة بنجاح.`)
  }

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})