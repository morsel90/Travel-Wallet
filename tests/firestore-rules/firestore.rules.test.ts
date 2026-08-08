// 🔴 اختبارات firestore.rules ضد محاكي Firestore الحقيقي (Firebase Emulator) —
// لا تختبر كود التطبيق، بل قواعد الأمان نفسها: من يملك صلاحية القراءة/الكتابة
// على كل مسار، بمعزل تام عن أي منطق في src/.
//
// التشغيل: `npm run test:rules` (يشغّل المحاكي عبر firebase emulators:exec ثم
// يشغّل هذا الملف بإعداد Vitest منفصل — انظر vitest.rules.config.ts). لا يعمل
// عبر `npm test` العادي عمداً — انظر التعليق في vitest.rules.config.ts.
//
// مسارات المستندات هنا مبنية يدوياً (لا نستورد src/firestore.ts) لأن ذلك
// الملف يستورد src/firebase.ts الذي يفشل فوراً بلا متغيرات VITE_FIREBASE_*
// حقيقية وقت الاستيراد — واختبارات القواعد لا تحتاج أي إعداد Firebase حقيقي أصلاً.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { RulesTestContext, RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

const PROJECT_ID  = 'demo-travelapp-rules'
const TRIP_ID      = 'trip-test'
const OTHER_TRIP_ID = 'trip-other'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      // FIRESTORE_EMULATOR_HOST تُحقَن تلقائياً من `firebase emulators:exec` —
      // لا حاجة لتحديد host/port هنا يدوياً (ويتفادى تكرار رقم المنفذ في مكانين
      // قد يختلفان: firebase.json وهذا الملف).
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

// ─── سياقات المصادقة ────────────────────────────────────────────────────────
const anonDb      = (): Firestore => testEnv.unauthenticatedContext().firestore()
const strangerDb   = (uid = 'stranger'): Firestore => testEnv.authenticatedContext(uid).firestore() // موقّع دخول بلا أي claim
const memberDb     = (uid = 'member-1'): Firestore =>
  testEnv.authenticatedContext(uid, { trips: { [TRIP_ID]: true } }).firestore()
const otherTripMemberDb = (uid = 'member-other-trip'): Firestore =>
  testEnv.authenticatedContext(uid, { trips: { [OTHER_TRIP_ID]: true } }).firestore()
const adminDb      = (uid = 'admin-1'): Firestore =>
  testEnv.authenticatedContext(uid, { admin: true }).firestore()

/** يكتب بيانات تجهيزية متجاوزاً القواعد تماماً — لتحضير حالة سابقة قبل الاختبار الفعلي. */
const seed = (fn: (db: Firestore) => Promise<void>) =>
  testEnv.withSecurityRulesDisabled(async (ctx: RulesTestContext) => fn(ctx.firestore()))

// ─── مسارات المستندات (نسخة مستقلة — انظر التعليق أعلى الملف) ────────────────
const expensesCol    = (db: Firestore, tripId = TRIP_ID) => collection(db, 'artifacts', tripId, 'public', 'data', 'expenses')
const expenseDoc     = (db: Firestore, id: string, tripId = TRIP_ID) => doc(db, 'artifacts', tripId, 'public', 'data', 'expenses', id)
const travelerDoc    = (db: Firestore, id: number, tripId = TRIP_ID) => doc(db, 'artifacts', tripId, 'public', 'data', 'travelers', String(id))
const travelerNameDoc = (db: Firestore, name: string, tripId = TRIP_ID) => doc(db, 'artifacts', tripId, 'public', 'data', 'travelerNames', name)
const depositLogsCol  = (db: Firestore, travelerId: number, tripId = TRIP_ID) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'travelers', String(travelerId), 'depositLogs')
const rateLimitDoc    = (db: Firestore, uid: string, tripId = TRIP_ID) => doc(db, 'artifacts', tripId, 'public', 'data', 'rateLimits', uid)
const tripConfigDoc   = (db: Firestore, tripId = TRIP_ID) => doc(db, 'trips', tripId)
const tripSecretsDoc  = (db: Firestore, tripId = TRIP_ID) => doc(db, 'tripSecrets', tripId)
const pinRateLimitDoc = (db: Firestore, key = 'k1') => doc(db, 'rateLimits', key)

// ─── حمولات صالحة (تطابق isValidExpense/isValidTraveler/isValidDepositLog) ───
const validExpense = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-08-01',
  description: 'عشاء',
  amount: 100,
  originalAmount: 100,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [1, 2],
  createdAt: Date.now(),
  ...overrides,
})

const validTraveler = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'أحمد الغامدي',
  shortName: 'أحمد',
  deposited: 0,
  deletedAt: null,
  ...overrides,
})

const validDepositLog = (changedByUid: string, overrides: Record<string, unknown> = {}) => ({
  travelerId: 1,
  previousDeposited: 1000,
  newDeposited: 1200,
  delta: 200,
  mode: 'add',
  reason: null,
  changedByEmail: 'admin@example.com',
  changedByUid,
  createdAt: Date.now(),
  ...overrides,
})

// ═══════════════════════════════════════════════════════════════════════════

describe('عضوية الرحلة — expenses', () => {
  it('مستخدم مجهول تماماً (بلا تسجيل دخول) يُمنع من القراءة والإضافة', async () => {
    await assertFails(getDocs(expensesCol(anonDb())))
    await assertFails(setDoc(expenseDoc(anonDb(), 'e1'), validExpense()))
  })

  it('مستخدم موقّع دخول لكن ليس عضواً في أي رحلة يُمنع من القراءة والإضافة', async () => {
    await assertFails(getDocs(expensesCol(strangerDb())))
    await assertFails(setDoc(expenseDoc(strangerDb(), 'e1'), validExpense()))
  })

  it('عضو الرحلة يستطيع قراءة المصاريف وإضافة مصروف صالح', async () => {
    await assertSucceeds(getDocs(expensesCol(memberDb())))
    await assertSucceeds(setDoc(expenseDoc(memberDb(), 'e1'), validExpense()))
  })

  it('عضو رحلة أخرى لا يرى ولا يكتب في رحلة لا ينتمي إليها (عزل بين الرحلات)', async () => {
    await assertFails(getDocs(expensesCol(otherTripMemberDb())))
    await assertFails(setDoc(expenseDoc(otherTripMemberDb(), 'e1'), validExpense()))
  })

  it('مصروف ببنية غير صالحة (وصف فارغ) يُرفض حتى من عضو حقيقي', async () => {
    await assertFails(setDoc(expenseDoc(memberDb(), 'e1'), validExpense({ description: '' })))
  })

  it('مصروف بحقل غير معروف يُرفض (hasOnly)', async () => {
    await assertFails(setDoc(expenseDoc(memberDb(), 'e1'), validExpense({ extraField: 'x' })))
  })
})

describe('ملكية المصروف — update', () => {
  beforeEach(async () => {
    await seed(db => setDoc(expenseDoc(db, 'owned'), validExpense({ createdByUid: 'member-1' })))
  })

  it('عضو آخر غير صاحب المصروف لا يستطيع تعديله', async () => {
    await assertFails(updateDoc(expenseDoc(memberDb('member-2'), 'owned'), { amount: 200 }))
  })

  it('صاحب المصروف يستطيع تعديل مصروفه الخاص', async () => {
    await assertSucceeds(updateDoc(expenseDoc(memberDb('member-1'), 'owned'), { amount: 200 }))
  })

  it('صاحب المصروف لا يستطيع تغيير createdByUid عند التعديل', async () => {
    await assertFails(updateDoc(expenseDoc(memberDb('member-1'), 'owned'), { createdByUid: 'member-2' }))
  })

  it('المسؤول يستطيع تعديل أي مصروف حتى لو لم يُنشئه', async () => {
    await assertSucceeds(updateDoc(expenseDoc(adminDb(), 'owned'), { amount: 300 }))
  })

  it('⚠️ ملاحظة: الإنشاء لا يتحقق أن createdByUid يطابق هوية الكاتب الفعلية', async () => {
    // ليس اختبار حماية بل توثيق سلوك حالي: isExpenseOwner يُفعَّل عند update
    // فقط. عند create يُقبَل أي createdByUid يرسله العميل دون تحقق أنه
    // auth.uid الفعلي — عضو يمكنه نظرياً كتابة مصروف منسوب لعضو آخر.
    await assertSucceeds(
      setDoc(expenseDoc(memberDb('member-1'), 'impersonated'), validExpense({ createdByUid: 'member-2' }))
    )
  })
})

describe('الحذف الصلب ممنوع دائماً (Soft Delete only)', () => {
  beforeEach(async () => {
    await seed(db => setDoc(expenseDoc(db, 'e1'), validExpense()))
    await seed(db => setDoc(travelerDoc(db, 1), validTraveler()))
  })

  it('لا أحد يستطيع حذف مصروف حذفاً حقيقياً — حتى المسؤول', async () => {
    await assertFails(deleteDoc(expenseDoc(adminDb(), 'e1')))
  })

  it('لكن تحديث deletedAt (حذف ليّن) يعمل بدلاً منه', async () => {
    await assertSucceeds(updateDoc(expenseDoc(adminDb(), 'e1'), { deletedAt: Date.now() }))
  })

  it('لا أحد يستطيع حذف مسافر حذفاً حقيقياً — حتى المسؤول', async () => {
    await assertFails(deleteDoc(travelerDoc(adminDb(), 1)))
  })
})

describe('المسافرون — إنشاء وتعديل', () => {
  it('عضو الرحلة يستطيع إنشاء مسافر ببيانات صالحة', async () => {
    await assertSucceeds(setDoc(travelerDoc(memberDb(), 1), validTraveler()))
  })

  it('مسافر ببنية غير صالحة (إيداع سالب) يُرفض', async () => {
    await assertFails(setDoc(travelerDoc(memberDb(), 1), validTraveler({ deposited: -5 })))
  })

  it('عضو عادي لا يستطيع تعديل مسافر — التعديل للمسؤول حصراً', async () => {
    await seed(db => setDoc(travelerDoc(db, 1), validTraveler()))
    await assertFails(updateDoc(travelerDoc(memberDb(), 1), { deposited: 500 }))
  })

  it('المسؤول يستطيع تعديل مسافر', async () => {
    await seed(db => setDoc(travelerDoc(db, 1), validTraveler()))
    await assertSucceeds(updateDoc(travelerDoc(adminDb(), 1), { deposited: 500 }))
  })
})

describe('تفرّد الاسم المختصر — travelerNames', () => {
  it('عضو يستطيع حجز اسم مختصر جديد لم يُستخدم من قبل', async () => {
    await assertSucceeds(setDoc(travelerNameDoc(memberDb(), 'فهد'), { travelerId: 1 }))
  })

  it('الكتابة الثانية على اسم محجوز مسبقاً تُرفض دائماً (تُصنَّف update لا create)', async () => {
    await seed(db => setDoc(travelerNameDoc(db, 'فهد'), { travelerId: 1 }))
    await assertFails(setDoc(travelerNameDoc(memberDb('member-2'), 'فهد'), { travelerId: 2 }))
  })

  it('المسؤول يستطيع حذف حجز اسم (تحرير الاسم عند نقل مسافر للسلة)', async () => {
    await seed(db => setDoc(travelerNameDoc(db, 'فهد'), { travelerId: 1 }))
    await assertSucceeds(deleteDoc(travelerNameDoc(adminDb(), 'فهد')))
  })

  it('عضو عادي لا يستطيع حذف حجز اسم', async () => {
    await seed(db => setDoc(travelerNameDoc(db, 'فهد'), { travelerId: 1 }))
    await assertFails(deleteDoc(travelerNameDoc(memberDb(), 'فهد')))
  })
})

describe('حدّ المعدّل — expense rate limiting', () => {
  it('عضو غير مسؤول بلا سجل حدّ معدّل سابق يستطيع إضافة مصروف', async () => {
    await assertSucceeds(setDoc(expenseDoc(memberDb('member-1'), 'e1'), validExpense()))
  })

  it('عضو غير مسؤول يُمنع من إضافة مصروف ثانٍ خلال أقل من ثانية من آخر مصروف', async () => {
    await seed(db => setDoc(rateLimitDoc(db, 'member-1'), { lastExpenseCreatedAt: Date.now() }))
    await assertFails(setDoc(expenseDoc(memberDb('member-1'), 'e2'), validExpense()))
  })

  it('المسؤول معفى من حدّ المعدّل حتى لو وُجد سجل حديث', async () => {
    await seed(db => setDoc(rateLimitDoc(db, 'admin-1'), { lastExpenseCreatedAt: Date.now() }))
    await assertSucceeds(setDoc(expenseDoc(adminDb('admin-1'), 'e1'), validExpense()))
  })

  it('مستند حدّ المعدّل لا يُقرأ من العميل مباشرة أبداً — حتى من صاحبه', async () => {
    await seed(db => setDoc(rateLimitDoc(db, 'member-1'), { lastExpenseCreatedAt: Date.now() }))
    await assertFails(getDoc(rateLimitDoc(memberDb('member-1'), 'member-1')))
  })

  it('لا يمكن كتابة مستند حدّ معدّل بقيمة زمنية بعيدة عن الوقت الفعلي (تلاعب بالساعة)', async () => {
    await assertFails(
      setDoc(rateLimitDoc(memberDb('member-1'), 'member-1'), { lastExpenseCreatedAt: Date.now() - 60_000 })
    )
  })

  it('لا يمكن لعضو كتابة مستند حدّ معدّل بمعرّف مستخدم آخر (انتحال)', async () => {
    await assertFails(
      setDoc(rateLimitDoc(memberDb('member-1'), 'member-2'), { lastExpenseCreatedAt: Date.now() })
    )
  })
})

describe('سجلات تدقيق الإيداع — depositLogs', () => {
  it('عضو عادي لا يستطيع قراءة سجلات الإيداع', async () => {
    await assertFails(getDocs(depositLogsCol(memberDb(), 1)))
  })

  it('عضو عادي لا يستطيع إنشاء سجل إيداع', async () => {
    await assertFails(setDoc(doc(depositLogsCol(memberDb(), 1)), validDepositLog('member-1')))
  })

  it('المسؤول يستطيع إنشاء سجل إيداع صالح بهويته الفعلية', async () => {
    await assertSucceeds(setDoc(doc(depositLogsCol(adminDb('admin-1'), 1)), validDepositLog('admin-1')))
  })

  it('المسؤول لا يستطيع كتابة changedByUid يخالف هويته الفعلية (منع انتحال)', async () => {
    await assertFails(setDoc(doc(depositLogsCol(adminDb('admin-1'), 1)), validDepositLog('someone-else')))
  })

  it('سجل الإيداع غير قابل للتعديل أو الحذف بعد إنشائه — حتى من المسؤول (immutable)', async () => {
    let logId = ''
    await seed(async db => {
      const ref = doc(depositLogsCol(db, 1))
      logId = ref.id
      await setDoc(ref, validDepositLog('admin-1'))
    })
    const ref = doc(depositLogsCol(adminDb('admin-1'), 1), logId)
    await assertFails(updateDoc(ref, { reason: 'تعديل لاحق' }))
    await assertFails(deleteDoc(ref))
  })
})

describe('حماية tripSecrets — لا وصول من العميل تحت أي ظرف', () => {
  beforeEach(async () => {
    await seed(db => setDoc(tripSecretsDoc(db), { pinHash: 'x', salt: 'y' }))
  })

  it('المسؤول نفسه ممنوع من قراءة tripSecrets', async () => {
    await assertFails(getDoc(tripSecretsDoc(adminDb())))
  })

  it('عضو الرحلة ممنوع من قراءة tripSecrets', async () => {
    await assertFails(getDoc(tripSecretsDoc(memberDb())))
  })

  it('لا أحد يستطيع الكتابة على tripSecrets مباشرة — حتى المسؤول', async () => {
    await assertFails(setDoc(tripSecretsDoc(adminDb()), { pinHash: 'z', salt: 'w' }))
  })
})

describe('إدارة الرحلات — trips/{tripId}', () => {
  it('عضو الرحلة يستطيع قراءة إعدادات رحلته', async () => {
    await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
    await assertSucceeds(getDoc(tripConfigDoc(memberDb())))
  })

  it('عضو رحلة أخرى لا يستطيع قراءة إعدادات هذه الرحلة', async () => {
    await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
    await assertFails(getDoc(tripConfigDoc(otherTripMemberDb())))
  })

  it('عضو عادي لا يستطيع كتابة إعدادات الرحلة — الإدارة للمسؤول حصراً', async () => {
    await assertFails(setDoc(tripConfigDoc(memberDb()), { name: 'اسم جديد' }))
  })

  it('المسؤول يستطيع كتابة إعدادات رحلة (إنشاء أو تحديث) ببيانات صالحة', async () => {
    await assertSucceeds(setDoc(tripConfigDoc(adminDb()), { name: 'اسم جديد' }, { merge: true }))
  })

  it('حقل غير معروف في إعدادات الرحلة يُرفض حتى من المسؤول', async () => {
    await assertFails(setDoc(tripConfigDoc(adminDb()), { notAllowed: true }))
  })

  it('لا أحد يستطيع حذف مستند الرحلة — حتى المسؤول', async () => {
    await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
    await assertFails(deleteDoc(tripConfigDoc(adminDb())))
  })
})

describe('حدّ معدّل تحقّق رمز الرحلة — rateLimits/ العلوية (verifyTripPin)', () => {
  it('لا تُقرأ ولا تُكتب من العميل إطلاقاً — حتى من المسؤول', async () => {
    await assertFails(getDoc(pinRateLimitDoc(adminDb())))
    await assertFails(setDoc(pinRateLimitDoc(adminDb()), { count: 1 }))
  })
})

describe('حماية افتراضية لأي مسار غير معرَّف', () => {
  it('مسار عشوائي خارج القواعد المعرَّفة مرفوض افتراضياً — حتى للمسؤول', async () => {
    await assertFails(setDoc(doc(adminDb(), 'someRandomCollection', 'x'), { a: 1 }))
  })
})
