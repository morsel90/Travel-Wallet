// ─── يوم بداية الشهر لرحلة طويلة المدى ────────────────────────────────────────
//
// 🆕 يضبط `cycleStartDay` على trips/{tripId} (1..28). بيوم 27 يمتد «أكتوبر» من
// 27 سبتمبر إلى 26 أكتوبر — من الراتب إلى الراتب. انظر src/utils/period.ts.
//
// لماذا سكربت لا زرّ؟ لأن تغيير اليوم **يعيد رسم حدود كل الأشهر السابقة**،
// والقواعد تمنع العميل من كتابته أصلاً (firestore.rules). ونفس منطق
// set-trip-type.mjs: عملية نادرة بأثر بنيوي لا تستحق خطر ضغطة خاطئة.
//
// ⚠️ **ولا يكفي تغيير الحقل وحده.** closeMonth كتبت قيود كل إغلاق سابق بتاريخ
// حدّه القديم (آخر الشهر وأوّله)، والتقارير تجد حدّ الشهر بمطابقة ذلك التاريخ
// حرفياً (boundaryRolloverAmount). فالسكربت ينقل تواريخ تلك القيود إلى الحدّ
// الجديد في الكتابة نفسها. المبالغ لا تُمسّ، ولا أي مصروف حقيقي، ولا قيود
// «تسوية خروج» — الأرصدة لا تتغيّر بحرف، وحدها نسبة المصاريف إلى الأشهر.
//
// الاستخدام:
//   node scripts/set-cycle-start-day.mjs <tripId> <day>           → معاينة فقط، بلا كتابة
//   node scripts/set-cycle-start-day.mjs <tripId> <day> --apply   → التنفيذ

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ⚠️ نسخ من src/utils/longTerm.ts وfunctions/index.js — غيّرها معاً.
const ROLLOVER_CATEGORY = 'تسوية شهرية'
const CLOSING_PREFIX = 'ترحيل رصيد'
const OPENING_PREFIX = 'عجز مُرحَّل'

// ─── نسخة من src/utils/period.ts (السكربتات لا تستورد TypeScript) ─────────────
const pad2 = (n) => String(n).padStart(2, '0')
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

function shiftPeriod(key, months) {
  const absolute = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + months
  const year = Math.floor(absolute / 12)
  return `${String(year).padStart(4, '0')}-${pad2(absolute - year * 12 + 1)}`
}
function periodForDate(date, startDay) {
  if (typeof date !== 'string' || !PERIOD_KEY.test(date.slice(0, 7))) return null
  const month = date.slice(0, 7)
  if (startDay <= 1) return month
  const day = Number(date.slice(8, 10))
  return Number.isFinite(day) && day >= startDay ? shiftPeriod(month, 1) : month
}
function periodStartDate(key, startDay) {
  return startDay <= 1 ? `${key}-01` : `${shiftPeriod(key, -1)}-${pad2(startDay)}`
}
function periodEndDate(key, startDay) {
  if (startDay > 1) return `${key}-${pad2(startDay - 1)}`
  const days = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()
  return `${key}-${pad2(days)}`
}
const normalizeDay = (v) => (Number.isInteger(v) && v >= 1 && v <= 28 ? v : 1)
const today = () => {
  const n = new Date()
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`
}

async function main() {
  const [, , tripId, dayArg, flag] = process.argv
  const newDay = Number(dayArg)
  const apply = flag === '--apply'

  if (!tripId || !Number.isInteger(newDay) || newDay < 1 || newDay > 28 || (flag && !apply)) {
    console.error('الاستخدام: node scripts/set-cycle-start-day.mjs <tripId> <1..28> [--apply]')
    process.exit(1)
  }

  const tripRef = db.collection('trips').doc(tripId)
  const tripSnap = await tripRef.get()
  if (!tripSnap.exists) {
    console.error(`❌ الرحلة "${tripId}" غير موجودة.`)
    process.exit(1)
  }
  const trip = tripSnap.data()
  if (trip.tripType !== 'long_term') {
    console.error(`❌ "${tripId}" ليست رحلة طويلة المدى — يوم البداية لا معنى له فيها.`)
    process.exit(1)
  }

  const oldDay = normalizeDay(trip.cycleStartDay)
  console.log(`\nالرحلة: ${trip.name || tripId}`)
  console.log(`يوم البداية: ${oldDay} ← ${newDay}`)
  console.log(`الشهر المفتوح: ${trip.currentPeriod ?? '(غير مضبوط)'} | آخر إغلاق: ${trip.lastClosedPeriod ?? '(لا شيء)'}`)
  console.log(`اليوم ${today()} يقع في شهر: ${periodForDate(today(), oldDay)} (قبل) ← ${periodForDate(today(), newDay)} (بعد)`)

  if (oldDay === newDay) {
    console.log('\nلا تغيير — اليوم مضبوط أصلاً.')
    return
  }

  const expensesRef = db.collection('artifacts').doc(tripId).collection('public').doc('data').collection('expenses')
  const all = (await expensesRef.get()).docs

  // ── قيود حدود الإغلاق: تُنقل إلى الحدّ الجديد ────────────────────────────
  const moves = []
  const skipped = []
  for (const doc of all) {
    const e = doc.data()
    if (e.category !== ROLLOVER_CATEGORY || typeof e.description !== 'string') continue
    const isClosing = e.description.startsWith(CLOSING_PREFIX)
    const isOpening = e.description.startsWith(OPENING_PREFIX)
    if (!isClosing && !isOpening) continue // «تسوية خروج» وغيرها — ليست حدّ شهر

    const period = periodForDate(e.date, oldDay)
    const oldBoundary = period && (isClosing ? periodEndDate(period, oldDay) : periodStartDate(period, oldDay))
    if (!period || e.date !== oldBoundary) {
      skipped.push({ id: doc.id, date: e.date, description: e.description })
      continue
    }
    const to = isClosing ? periodEndDate(period, newDay) : periodStartDate(period, newDay)
    if (to !== e.date) moves.push({ ref: doc.ref, from: e.date, to, amount: e.amount, description: e.description })
  }

  console.log(`\nقيود حدود الإغلاق التي ستُنقل تواريخها (${moves.length}) — المبالغ لا تتغيّر:`)
  for (const m of moves) console.log(`  ${m.from} ← ${m.to}  ${String(m.amount).padStart(8)}  ${m.description}`)
  if (skipped.length > 0) {
    console.log(`\n⚠️ قيود حدود لا تقع على حدّها المتوقَّع فلن تُمسّ (${skipped.length}):`)
    for (const s of skipped) console.log(`  ${s.date}  ${s.description}  [${s.id}]`)
  }

  // ── المصاريف الحقيقية التي يتغيّر شهرها (للاطّلاع — لا تُكتب) ─────────────
  const shifted = new Map()
  for (const doc of all) {
    const e = doc.data()
    if (e.category === ROLLOVER_CATEGORY || e.deletedAt) continue
    const before = periodForDate(e.date, oldDay)
    const after = periodForDate(e.date, newDay)
    if (before === after) continue
    const key = `${before} ← ${after}`
    const row = shifted.get(key) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += Number.isFinite(e.amount) ? e.amount : 0
    shifted.set(key, row)
  }
  console.log('\nمصاريف حقيقية ينتقل شهرها (تاريخها لا يتغيّر، فقط الشهر الذي تُحسب عليه):')
  if (shifted.size === 0) console.log('  لا شيء')
  for (const [key, r] of shifted) console.log(`  ${key}: ${r.count} مصروف، ${r.total.toFixed(2)} ريال`)

  if (!apply) {
    console.log('\nمعاينة فقط — لم يُكتب شيء. أعد التشغيل مع --apply للتنفيذ.\n')
    return
  }

  // كتابة واحدة ذرّية: الحقل والقيود معاً، فلا تبقى الرحلة بحدود نصف منقولة.
  if (moves.length + 1 > 500) {
    console.error('❌ أكثر من 500 كتابة — يتجاوز حدّ الدفعة الواحدة.')
    process.exit(1)
  }
  const batch = db.batch()
  for (const m of moves) batch.update(m.ref, { date: m.to })
  batch.update(tripRef, { cycleStartDay: newDay })
  await batch.commit()
  console.log(`\n✅ ضُبط يوم البداية على ${newDay}، ونُقلت ${moves.length} قيود.\n`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
