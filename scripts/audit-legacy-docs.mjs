// scripts/audit-legacy-docs.mjs
//
// ─── جرد المستندات القديمة ────────────────────────────────────────────────────
//
// يجيب على سؤال واحد لا يجيب عليه أي شيء آخر في المشروع:
// **هل ما زالت شروط الـ fallback في الكود والقواعد ضرورية؟**
//
// المشكلة التي يحلّها: عدة أماكن تتعامل مع بيانات كُتبت قبل إضافة حقل ما —
// `status` الغائب يعني 'active'، و`createdByUid` الغائب يعني مصروفاً بلا مالك،
// و`participants` قد تحمل أسماءً مختصرة نصية بدل معرّفات رقمية. كل واحد منها
// حارسٌ مكتوب مرة، ثم يبقى إلى الأبد — لا لأن الحاجة إليه قائمة، بل لأن **لا
// أحد يعرف** إن كانت المجموعة القديمة قد أصبحت فارغة. هذا هو الدين الحقيقي:
// ليس وجود الحارس بل استحالة إثبات أنه لم يعد لازماً.
//
// البديل المعتاد هو `schemaVersion` في كل مستند، وهو أثقل مما يستحقه المشروع:
// حقل إضافي في كل كتابة، وتحقّق في القواعد، ومنطق ترقية. وهذا السكربت يعطي
// النتيجة نفسها بلا أي تكلفة على مسار الكتابة — لأن السؤال يُطرح مرة كل بضعة
// أشهر، لا في كل قراءة.
//
// ⚠️ **قراءة فقط.** لا يكتب شيئاً ولا يعدّل مستنداً واحداً. الهجرة الفعلية —
// إن قُرّرت — قرار منفصل يحتاج نسخة احتياطية أولاً (انظر RECOVERY.md §٤).
//
// التشغيل:
//   node scripts/audit-legacy-docs.mjs
//   FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.staging.json node scripts/audit-legacy-docs.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const bold = s => `\x1b[1m${s}\x1b[0m`
const green = s => `\x1b[32m${s}\x1b[0m`
const amber = s => `\x1b[33m${s}\x1b[0m`
const dim = s => `\x1b[2m${s}\x1b[0m`

/**
 * كل صف = حارس واحد في الكود. `where` يشرح أين يعيش الحارس، حتى يعرف القارئ
 * ما الذي يصبح حذفه آمناً حين يبلغ العدّاد صفراً.
 */
const findings = {
  tripsWithoutStatus: {
    label: 'رحلات بلا حقل status',
    where: 'firestore.rules (tripAcceptsExpenses/tripAcceptsWrites) + utils/tripStatus.ts (normalizeTripStatus)',
    note: 'مجمّدة منذ أن صار manageTrip يكتب status: active عند الإنشاء.',
    count: 0,
    samples: [],
  },
  expensesWithoutCreator: {
    label: 'مصاريف بلا createdByUid',
    where: 'firestore.rules (preservesCreator) — الفرع الذي يسمح بختم كاتب على مستند بلا مالك',
    note: 'مجمّدة: قاعدة isOwnCreation تشترط الحقل في كل إنشاء جديد.',
    count: 0,
    samples: [],
  },
  expensesWithStringParticipants: {
    label: 'مصاريف بمشاركين نصيين (أسماء مختصرة قبل الهجرة)',
    where: 'types.ts (Array<number | string>) + utils/participants.ts (matchesTraveler/toIds/toDisplayNames)',
    note: 'مجمّدة: العميل يكتب معرّفات رقمية فقط.',
    count: 0,
    samples: [],
  },
  tripsWithoutBankDetails: {
    label: 'رحلات بلا حقل bankDetails',
    where: 'hooks/useTripConfig.ts — السقوط إلى BANK_DETAILS في constants.ts',
    note: '⚠️ هذه وحدها تعرض الحساب البنكي الافتراضي في constants.ts لمستخدميها.',
    count: 0,
    samples: [],
  },
}

const record = (key, id) => {
  findings[key].count++
  if (findings[key].samples.length < 5) findings[key].samples.push(id)
}

async function main() {
  console.log(`\n${bold('جرد المستندات القديمة')} ${dim(`(المشروع: ${serviceAccount.project_id})`)}\n`)

  const trips = await db.collection('trips').get()
  if (trips.empty) {
    console.log(amber('لا توجد رحلات في قاعدة البيانات.'))
    return
  }

  let totalExpenses = 0

  for (const trip of trips.docs) {
    const data = trip.data()
    if (!('status' in data)) record('tripsWithoutStatus', trip.id)
    if (!('bankDetails' in data)) record('tripsWithoutBankDetails', trip.id)

    // المصاريف تعيش خارج مستند الرحلة — انظر بنية Firestore في CLAUDE.md
    const expenses = await db
      .collection('artifacts').doc(trip.id)
      .collection('public').doc('data')
      .collection('expenses')
      .get()

    totalExpenses += expenses.size

    for (const exp of expenses.docs) {
      const e = exp.data()
      if (!('createdByUid' in e)) record('expensesWithoutCreator', `${trip.id}/${exp.id}`)
      if (Array.isArray(e.participants) && e.participants.some(p => typeof p === 'string')) {
        record('expensesWithStringParticipants', `${trip.id}/${exp.id}`)
      }
    }
  }

  console.log(dim(`فُحص: ${trips.size} رحلة، ${totalExpenses} مصروفاً.\n`))

  let allClear = true
  for (const f of Object.values(findings)) {
    const clear = f.count === 0
    if (!clear) allClear = false
    console.log(`${clear ? green('✓') : amber('•')} ${bold(f.label)}: ${clear ? green('0') : amber(String(f.count))}`)
    console.log(`  ${dim(f.where)}`)
    if (!clear) {
      console.log(`  ${dim(`أمثلة: ${f.samples.join('، ')}${f.count > f.samples.length ? ' …' : ''}`)}`)
    }
    console.log(`  ${dim(f.note)}\n`)
  }

  if (allClear) {
    console.log(green(bold('كل العدّادات صفر.')))
    console.log('يمكن حذف شروط الـ fallback أعلاه — بدليل لا بظنّ.\n')
    console.log(amber('⚠️ لكن ليس فوراً:'))
    console.log('  ١. الكتابة دون اتصال قد تصل متأخرة بأيام (persistentLocalCache).')
    console.log('  ٢. أي جهاز يحمل نسخة قديمة من التطبيق ما زال يكتب بالشكل القديم.')
    console.log('  ٣. شغّل الجرد على *كل* بيئة (إنتاج وstaging) لا على واحدة.')
    console.log(dim('  فأعد التشغيل بعد فترة، ثم احذف.\n'))
  } else {
    console.log(amber(bold('توجد مستندات قديمة — الحرّاس أعلاه ما زالت لازمة.')))
    console.log(dim('لا تحذف أياً منها. المجموعات الثلاث الأولى مجمّدة، فنسبتها تتناقص وحدها مع نمو البيانات.\n'))
  }
}

main()
  .catch(err => {
    console.error('❌ فشل الجرد:', err)
    process.exitCode = 1
  })
  .finally(() => process.exit())
