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
  collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
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
//
// ⚠️ `ctx.firestore()` في @firebase/rules-unit-testing v3 يُصرَّح بأنه نسخة
// التوافق (compat) من Firestore، بينما هذا الملف يستخدم الواجهة الحديثة
// (doc/collection/getDoc من 'firebase/firestore'). النسخة المُعادة تعمل معها
// فعلياً وقت التشغيل — الاختبارات تمرّ — لكن التصريحين لا يتطابقان نوعياً.
// نحصر التحويل في هذه الدالة الواحدة بدل نثره في كل استدعاء.
const asModularFirestore = (db: unknown): Firestore => db as Firestore

const anonDb      = (): Firestore => asModularFirestore(testEnv.unauthenticatedContext().firestore())
const strangerDb   = (uid = 'stranger'): Firestore => asModularFirestore(testEnv.authenticatedContext(uid).firestore()) // موقّع دخول بلا أي claim
const memberDb     = (uid = 'member-1'): Firestore =>
  asModularFirestore(testEnv.authenticatedContext(uid, { trips: { [TRIP_ID]: true } }).firestore())
const otherTripMemberDb = (uid = 'member-other-trip'): Firestore =>
  asModularFirestore(testEnv.authenticatedContext(uid, { trips: { [OTHER_TRIP_ID]: true } }).firestore())
const adminDb      = (uid = 'admin-1'): Firestore =>
  asModularFirestore(testEnv.authenticatedContext(uid, { admin: true }).firestore())
// 🆕 منظّم رحلة (docs/PLAN-member-management.md المرحلة ٣): نفس claim العضو
// العادي بالضبط — الدور لا يعيش في الـ claim بل في سجلّ trips/{tripId}/members
// (انظر seedOrganizer أدناه)، فالفارق الوحيد بين memberDb وorganizerDb هو ما
// نزرعه في السجلّ قبل الاختبار، لا سياق المصادقة نفسه.
const organizerDb  = (uid = 'organizer-1'): Firestore =>
  asModularFirestore(testEnv.authenticatedContext(uid, { trips: { [TRIP_ID]: true } }).firestore())

/** يكتب بيانات تجهيزية متجاوزاً القواعد تماماً — لتحضير حالة سابقة قبل الاختبار الفعلي. */
const seed = (fn: (db: Firestore) => Promise<void>) =>
  testEnv.withSecurityRulesDisabled(async (ctx: RulesTestContext) => fn(asModularFirestore(ctx.firestore())))

/** يضبط حالة دورة حياة الرحلة قبل الاختبار (غياب المستند نفسه = active). */
const setTripStatus = (status: 'active' | 'completed' | 'archived') =>
  seed(db => setDoc(doc(db, 'trips', TRIP_ID), { name: 'رحلة', status }))

/** 🆕 يزرع سطر عضوية بدور منظّم — ما يجعل isOrganizer(tripId) صحيحاً لـ uid هذا. */
const seedOrganizer = (uid: string, tripId = TRIP_ID) =>
  seed(db => setDoc(doc(db, 'trips', tripId, 'members', uid), { joinedAt: 1_700_000_000_000, role: 'organizer' }))

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
const tripInvitesDoc  = (db: Firestore, token = 'inv-test') => doc(db, 'tripInvites', token)
const tripMemberDoc   = (db: Firestore, uid: string, tripId = TRIP_ID) => doc(db, 'trips', tripId, 'members', uid)
const tripMembersCol  = (db: Firestore, tripId = TRIP_ID) => collection(db, 'trips', tripId, 'members')
const pinRateLimitDoc = (db: Firestore, key = 'k1') => doc(db, 'rateLimits', key)

// ─── حمولات صالحة (تطابق isValidExpense/isValidTraveler/isValidDepositLog) ───
/** مصروف بلا نسبة — يمثّل المصاريف القديمة السابقة لحقل createdByUid. */
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

/**
 * مصروف منسوب لكاتبه — الشكل الطبيعي لأي إنشاء بعد إغلاق ثغرة النسبة.
 *
 * ⚠️ استخدمه في كل اختبار إنشاء لا يقصد اختبار النسبة نفسها. بدونه يفشل الإنشاء
 * لغياب createdByUid، فيمرّ اختبار `assertFails` **للسبب الخطأ** ويبدو ناجحاً
 * وهو لا يفحص ما وُضع لفحصه إطلاقاً.
 */
const expenseBy = (uid: string, overrides: Record<string, unknown> = {}) =>
  validExpense({ createdByUid: uid, ...overrides })

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
    await assertFails(setDoc(expenseDoc(anonDb(), 'e1'), expenseBy('anon')))
  })

  it('مستخدم موقّع دخول لكن ليس عضواً في أي رحلة يُمنع من القراءة والإضافة', async () => {
    await assertFails(getDocs(expensesCol(strangerDb())))
    await assertFails(setDoc(expenseDoc(strangerDb(), 'e1'), expenseBy('stranger')))
  })

  it('عضو الرحلة يستطيع قراءة المصاريف وإضافة مصروف صالح منسوب لنفسه', async () => {
    await assertSucceeds(getDocs(expensesCol(memberDb())))
    await assertSucceeds(setDoc(expenseDoc(memberDb(), 'e1'), expenseBy('member-1')))
  })

  it('عضو رحلة أخرى لا يرى ولا يكتب في رحلة لا ينتمي إليها (عزل بين الرحلات)', async () => {
    await assertFails(getDocs(expensesCol(otherTripMemberDb())))
    await assertFails(setDoc(expenseDoc(otherTripMemberDb(), 'e1'), expenseBy('member-other-trip')))
  })

  it('مصروف ببنية غير صالحة (وصف فارغ) يُرفض حتى من عضو حقيقي', async () => {
    await assertFails(setDoc(expenseDoc(memberDb(), 'e1'), expenseBy('member-1', { description: '' })))
  })

  it('مصروف بحقل غير معروف يُرفض (hasOnly)', async () => {
    await assertFails(setDoc(expenseDoc(memberDb(), 'e1'), expenseBy('member-1', { extraField: 'x' })))
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

  it('المسؤول لا يستطيع تغيير createdByUid عند التعديل (الحقل ثابت للجميع)', async () => {
    await assertFails(updateDoc(expenseDoc(adminDb(), 'owned'), { createdByUid: 'someone-else' }))
  })

  it('المسؤول يستطيع تعديل مصروف قديم بلا مالك، ويختم نفسه عليه', async () => {
    // المصاريف السابقة لإضافة createdByUid لا تملك الحقل. العميل يرسل
    // `editingExpense?.createdByUid ?? user?.uid` فيختم المحرِّر — يجب أن يُقبل،
    // وإلا انكسر تعديل المسؤول لكل مصروف قديم.
    await seed(db => setDoc(expenseDoc(db, 'legacy'), validExpense())) // بلا createdByUid
    await assertSucceeds(updateDoc(expenseDoc(adminDb('admin-1'), 'legacy'), { createdByUid: 'admin-1' }))
  })

  it('لا يمكن ختم مصروف قديم بلا مالك باسم شخص آخر', async () => {
    await seed(db => setDoc(expenseDoc(db, 'legacy2'), validExpense()))
    await assertFails(updateDoc(expenseDoc(adminDb('admin-1'), 'legacy2'), { createdByUid: 'member-2' }))
  })
})

// 🔒 الثغرة التي كانت مفتوحة وأُغلقت: الإنشاء لم يكن يتحقق أن createdByUid يطابق
// هوية الكاتب، فأي عضو يستطيع نسبة مصروف لغيره. هذه الاختبارات تمنع عودتها.
describe('نسبة المصروف عند الإنشاء — createdByUid', () => {
  it('عضو لا يستطيع إنشاء مصروف منسوب لعضو آخر', async () => {
    await assertFails(
      setDoc(expenseDoc(memberDb('member-1'), 'impersonated'), validExpense({ createdByUid: 'member-2' }))
    )
  })

  it('المسؤول أيضاً لا يستطيع نسبة مصروف لغيره — لا استثناء للصلاحية', async () => {
    await assertFails(
      setDoc(expenseDoc(adminDb('admin-1'), 'impersonated-by-admin'), validExpense({ createdByUid: 'member-2' }))
    )
  })

  it('عضو ينسب المصروف لنفسه — يُقبل', async () => {
    await assertSucceeds(
      setDoc(expenseDoc(memberDb('member-1'), 'own'), validExpense({ createdByUid: 'member-1' }))
    )
  })

  it('إنشاء مصروف بلا createdByUid إطلاقاً يُرفض — كل مصروف جديد يجب أن يكون منسوباً', async () => {
    await assertFails(setDoc(expenseDoc(memberDb('member-1'), 'anonymous'), validExpense()))
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

// 🆕 نموذج الهوية الهجين: uid/joinedAt اختياريان — هذه الاختبارات تثبّت أن
// isValidTraveler تقبل شكلهما الصحيح (نص أو null لـ uid، رقم لـ joinedAt) وترفض
// أي شكل آخر، تماماً كأي حقل اختياري آخر في هذا النوع. الكتابة الفعلية لهذين
// الحقلين تمرّ حصراً عبر Admin SDK (joinViaInvite/linkTravelerAccount) الذي
// يتجاوز هذه القواعد أصلاً — هذا يختبر القاعدة نفسها لا مسار الكتابة الحيّ.
describe('المسافرون — uid/joinedAt (نموذج الهوية الهجين)', () => {
  it('uid كـ null (مسافر شبح غير مربوط) يُقبل', async () => {
    await assertSucceeds(setDoc(travelerDoc(memberDb(), 20), validTraveler({ id: 20, uid: null })))
  })

  it('uid كنص (مسافر مربوط بحساب) و joinedAt رقماً يُقبلان معاً', async () => {
    await assertSucceeds(
      setDoc(travelerDoc(memberDb(), 21), validTraveler({ id: 21, uid: 'member-1', joinedAt: Date.now() })),
    )
  })

  it('uid برقم بدل نص أو null يُرفض', async () => {
    await assertFails(setDoc(travelerDoc(memberDb(), 22), validTraveler({ id: 22, uid: 12345 })))
  })

  it('joinedAt بنص بدل رقم يُرفض', async () => {
    await assertFails(setDoc(travelerDoc(memberDb(), 23), validTraveler({ id: 23, joinedAt: '2026-01-01' })))
  })

  it('غياب الحقلين كليةً يبقى صالحاً — كل المسافرين قبل هذا التحديث', async () => {
    await assertSucceeds(setDoc(travelerDoc(memberDb(), 24), validTraveler({ id: 24 })))
  })
})

// 🆕 الرصيد الابتدائي: `deposited` هو الطرف الدائن الوحيد في الدفتر، وتعديله
// لاحقاً محكوم بـ isAdmin() ويكتب سطراً غير قابل للتعديل. أما الإنشاء فكان
// يقبل أي مبلغ من أي عضو بلا سجلّ — فمن أراد إضافة مال بلا أثر لا يفتح نافذة
// الإيداع بل يُنشئ مسافراً.
describe('الرصيد الابتدائي — deposited == 0 عند الإنشاء', () => {
  it('عضو عادي: إنشاء برصيد ابتدائي > 0 يُرفض', async () => {
    await assertFails(setDoc(travelerDoc(memberDb(), 10), validTraveler({ id: 10, deposited: 3000 })))
  })

  // ⚠️ الشرط الأهم: لا استثناء للمسؤول. ليس لأنه غير موثوق، بل لأن السجلّ
  // **له** لا ضدّه — هو ما يحتجّ به حين يُسأل بعد شهر عن رقم.
  it('المسؤول أيضاً: إنشاء برصيد ابتدائي > 0 يُرفض — لا استثناء للصلاحية', async () => {
    await assertFails(setDoc(travelerDoc(adminDb(), 11), validTraveler({ id: 11, deposited: 3000 })))
  })

  it('الإنشاء بصفر يُقبل — الوظيفة لم تُلغَ بل نُقلت للمسار الموثَّق', async () => {
    await assertSucceeds(setDoc(travelerDoc(memberDb(), 12), validTraveler({ id: 12, deposited: 0 })))
  })

  it('المسؤول يبقى قادراً على تعديل الرصيد لاحقاً — الاشتراط على الإنشاء وحده', async () => {
    await seed(db => setDoc(travelerDoc(db, 13), validTraveler({ id: 13, deposited: 0 })))
    await assertSucceeds(updateDoc(travelerDoc(adminDb(), 13), { ...validTraveler({ id: 13, deposited: 5000 }) }))
  })

  // ⚠️ **حقيقة في Firestore يجب أن تبقى موثَّقة، لا مجرد اختبار.**
  //
  // التصميم الأول كان دفعة واحدة: إنشاء بصفر ثم تحديث نفس المستند. وهي **تُرفض**
  // لأن Firestore تجمع العمليتين على المستند الواحد وتُقيّمهما **إنشاءً واحداً
  // بالقيمة النهائية** — فيصطدم بشرط `deposited == 0`. رسالة الرفض تقول ذلك
  // حرفياً: `false for 'create'`، لا `for 'update'`.
  //
  // ولهذا انقسم الكتابة إلى دفعتين في useTravelerActions. من يحاول «تحسينها»
  // إلى دفعة واحدة سيكسر إضافة المسافر برصيد ابتدائي كلياً — وهذا الاختبار هو
  // ما يمنعه.
  it('دفعة واحدة تُنشئ بصفر ثم تُحدّث نفس المستند: تُرفض — العمليتان تُقيَّمان كإنشاء واحد', async () => {
    const db = adminDb('admin-1')
    const batch = writeBatch(db)
    batch.set(travelerDoc(db, 14), validTraveler({ id: 14, deposited: 0 }))
    batch.update(travelerDoc(db, 14), { deposited: 3000 })
    await assertFails(batch.commit())
  })

  // الشكل المُنفَّذ فعلاً: دفعتان متعاقبتان.
  it('دفعتان: الإنشاء بصفر، ثم سطر التدقيق والرصيد معاً — كلتاهما تُقبل من المسؤول', async () => {
    const db = adminDb('admin-1')

    const createBatch = writeBatch(db)
    createBatch.set(travelerDoc(db, 16), validTraveler({ id: 16, deposited: 0 }))
    createBatch.set(travelerNameDoc(db, 'مسافر16'), { travelerId: 16 })
    await assertSucceeds(createBatch.commit())

    // ⚠️ السطر والرصيد في دفعة واحدة — هذا هو الضمان الذي يهمّ: لا رصيد بلا
    // سطر يفسّره. والاتجاه المعاكس (سطر بلا رصيد) مستحيل لأنهما معاً.
    const depositBatch = writeBatch(db)
    depositBatch.set(doc(depositLogsCol(db, 16)), {
      travelerId: 16,
      previousDeposited: 0,
      newDeposited: 3000,
      delta: 3000,
      mode: 'set',
      reason: 'رصيد ابتدائي عند إضافة المسافر',
      changedByEmail: '',
      changedByUid: 'admin-1',
      createdAt: Date.now(),
    })
    depositBatch.update(travelerDoc(db, 16), { deposited: 3000 })
    await assertSucceeds(depositBatch.commit())
  })

  // العضو غير المسؤول لا يستطيع كتابة سطر التدقيق ولا تحديث الرصيد، فدفعته
  // تفشل كاملةً — وهو المطلوب: لا رصيد ابتدائي بلا توثيق، ولا توثيق بلا صلاحية.
  it('نفس الدفعة من عضو عادي تفشل كاملةً', async () => {
    const db = memberDb('member-1')
    const batch = writeBatch(db)
    batch.set(travelerDoc(db, 15), validTraveler({ id: 15, deposited: 0 }))
    batch.set(doc(depositLogsCol(db, 15)), {
      travelerId: 15,
      previousDeposited: 0,
      newDeposited: 3000,
      delta: 3000,
      mode: 'set',
      reason: 'رصيد ابتدائي عند إضافة المسافر',
      changedByEmail: '',
      changedByUid: 'member-1',
      createdAt: Date.now(),
    })
    await assertFails(batch.commit())
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

// 🆕 دورة حياة الرحلة: active / completed / archived — مفروضة في القواعد لا في
// الواجهة. المنع في الواجهة وحدها يعني أن «رحلة للقراءة فقط» ليست كذلك حقيقةً.
describe('دورة حياة الرحلة — status', () => {
  it('غياب حقل status يُعامَل كـ active — الرحلات القائمة قبل الميزة لا تتجمّد', async () => {
    // مستند رحلة بلا status إطلاقاً — وهي حالة كل رحلة أُنشئت قبل هذه الميزة
    await seed(db => setDoc(doc(db, 'trips', TRIP_ID), { name: 'رحلة قديمة' }))
    await assertSucceeds(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
  })

  it('غياب مستند الرحلة كاملاً يُعامَل كـ active أيضاً', async () => {
    await assertSucceeds(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
  })

  it('الرحلة النشطة تقبل المصاريف', async () => {
    await setTripStatus('active')
    await assertSucceeds(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
  })

  it('الرحلة المنتهية (completed) ترفض المصاريف الجديدة', async () => {
    await setTripStatus('completed')
    await assertFails(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
  })

  it('المسؤول أيضاً لا يستطيع إضافة مصروف لرحلة منتهية — الحالة وصف للرحلة لا قيد على الصلاحية', async () => {
    await setTripStatus('completed')
    await assertFails(setDoc(expenseDoc(adminDb('admin-1'), 'e1'), expenseBy('admin-1')))
  })

  it('الرحلة المنتهية ترفض تعديل مصروف قائم (ويشمل ذلك الحذف الليّن)', async () => {
    await seed(db => setDoc(expenseDoc(db, 'owned'), expenseBy('member-1')))
    await setTripStatus('completed')
    await assertFails(updateDoc(expenseDoc(memberDb('member-1'), 'owned'), { amount: 200 }))
  })

  it('لكن الرحلة المنتهية تُبقي المسافرين والإيداعات قابلة للتعديل — لتسوية الحسابات بعدها', async () => {
    await seed(db => setDoc(travelerDoc(db, 1), validTraveler()))
    await setTripStatus('completed')
    await assertSucceeds(updateDoc(travelerDoc(adminDb(), 1), { deposited: 500 }))
    await assertSucceeds(setDoc(doc(depositLogsCol(adminDb('admin-1'), 1)), validDepositLog('admin-1')))
  })

  it('الرحلة المؤرشفة ترفض كل الكتابات — مصاريف ومسافرين وإيداعات', async () => {
    await seed(db => setDoc(travelerDoc(db, 1), validTraveler()))
    await setTripStatus('archived')
    await assertFails(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
    await assertFails(updateDoc(travelerDoc(adminDb(), 1), { deposited: 500 }))
    await assertFails(setDoc(doc(depositLogsCol(adminDb('admin-1'), 1)), validDepositLog('admin-1')))
  })

  it('القراءة تبقى متاحة في كل الحالات — التقارير يجب أن تعمل بعد الإغلاق', async () => {
    await seed(db => setDoc(expenseDoc(db, 'e1'), expenseBy('member-1')))
    await setTripStatus('archived')
    await assertSucceeds(getDocs(expensesCol(memberDb())))
    await assertSucceeds(getDoc(tripConfigDoc(memberDb())))
  })

  it('المسؤول وحده يغيّر حالة الرحلة', async () => {
    await assertSucceeds(setDoc(tripConfigDoc(adminDb()), { status: 'completed' }, { merge: true }))
    await assertFails(setDoc(tripConfigDoc(memberDb()), { status: 'completed' }, { merge: true }))
  })

  it('حالة غير معروفة تُرفض — لا قيمة خارج الثلاث المعرَّفة', async () => {
    await assertFails(setDoc(tripConfigDoc(adminDb()), { status: 'frozen' }, { merge: true }))
  })
})

describe('حدّ المعدّل — expense rate limiting', () => {
  it('عضو غير مسؤول بلا سجل حدّ معدّل سابق يستطيع إضافة مصروف', async () => {
    await assertSucceeds(setDoc(expenseDoc(memberDb('member-1'), 'e1'), expenseBy('member-1')))
  })

  it('عضو غير مسؤول يُمنع من إضافة مصروف ثانٍ خلال أقل من ثانية من آخر مصروف', async () => {
    await seed(db => setDoc(rateLimitDoc(db, 'member-1'), { lastExpenseCreatedAt: Date.now() }))
    await assertFails(setDoc(expenseDoc(memberDb('member-1'), 'e2'), expenseBy('member-1')))
  })

  it('المسؤول معفى من حدّ المعدّل حتى لو وُجد سجل حديث', async () => {
    await seed(db => setDoc(rateLimitDoc(db, 'admin-1'), { lastExpenseCreatedAt: Date.now() }))
    await assertSucceeds(setDoc(expenseDoc(adminDb('admin-1'), 'e1'), expenseBy('admin-1')))
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

// 🆕 دعوات الرحلة (روابط دخول بنقرة واحدة) — نفس نمط tripSecrets تماماً: لا
// وصول من العميل تحت أي ظرف. الإنشاء/الإبطال/الاستهلاك كلها عبر Admin SDK داخل
// manageInvite/joinViaInvite (functions/index.js)، وهي تتجاوز هذه القواعد
// بالكامل — الاختبارات هنا تثبّت فقط أن القاعدة نفسها تمنع الوصول المباشر.
describe('حماية tripInvites — لا وصول من العميل تحت أي ظرف', () => {
  beforeEach(async () => {
    await seed(db => setDoc(tripInvitesDoc(db), { tripId: TRIP_ID, createdAt: Date.now(), createdByUid: 'admin-1' }))
  })

  it('المسؤول نفسه ممنوع من قراءة tripInvites', async () => {
    await assertFails(getDoc(tripInvitesDoc(adminDb())))
  })

  it('عضو الرحلة ممنوع من قراءة tripInvites', async () => {
    await assertFails(getDoc(tripInvitesDoc(memberDb())))
  })

  it('لا أحد يستطيع الكتابة على tripInvites مباشرة — حتى المسؤول', async () => {
    await assertFails(setDoc(tripInvitesDoc(adminDb(), 'inv-other'), { tripId: TRIP_ID, createdAt: Date.now(), createdByUid: 'admin-1' }))
  })

  it('لا أحد يستطيع حذف دعوة مباشرة — حتى المسؤول', async () => {
    await assertFails(deleteDoc(tripInvitesDoc(adminDb())))
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

  // 🆕 المرحلة ٣ — منظّم الرحلة: تحديث لا إنشاء، ولرحلته وحدها.
  describe('منظّم الرحلة (المرحلة ٣)', () => {
    it('منظّم الرحلة يستطيع تحديث إعداداتها ببيانات صالحة', async () => {
      await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
      await seedOrganizer('organizer-1')
      await assertSucceeds(setDoc(tripConfigDoc(organizerDb()), { name: 'اسم جديد' }, { merge: true }))
    })

    // ⚠️ الحالة السالبة الحاكمة: منظّم بلا سجلّ دور — أو دوره 'member' — يبقى
    // كعضو عادي، لا كل من لديه claim العضوية في هذه الرحلة.
    it('عضو الرحلة العادي (بلا سطر دور منظّم) لا يستطيع التحديث', async () => {
      await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
      await assertFails(setDoc(tripConfigDoc(organizerDb()), { name: 'اسم جديد' }, { merge: true }))
    })

    it('منظّم رحلة أخرى لا يستطيع تحديث هذه الرحلة', async () => {
      await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
      await seedOrganizer('organizer-1', OTHER_TRIP_ID)
      await assertFails(setDoc(tripConfigDoc(organizerDb()), { name: 'اسم جديد' }, { merge: true }))
    })

    // 🆕 الفرق الحاسم بين المرحلتين: منظّم يحدّث، لا يُنشئ — الإنشاء يبقى
    // للمسؤول العالمي وحده (docs/PLAN-member-management.md: "دون: إنشاء رحلات").
    it('منظّم الرحلة لا يستطيع إنشاء رحلة جديدة (مستند غير موجود أصلاً)', async () => {
      await seedOrganizer('organizer-1', 'trip-brand-new')
      await assertFails(
        setDoc(tripConfigDoc(organizerDb(), 'trip-brand-new'), { name: 'رحلة جديدة' }),
      )
    })
  })

  // ⚠️ يبقى الحذف ممنوعاً على العميل حتى بعد إضافة «حذف رحلة» للواجهة: الحذف
  // يمرّ حصراً عبر manageTrip (Cloud Function بصلاحيات Admin SDK تتجاوز القواعد)،
  // وهناك يُفرض شرط أن تكون الرحلة فارغة. لو سُمح للعميل بالحذف مباشرةً لأمكن
  // تجاوز ذلك الشرط بالكامل وتيتيم بيانات artifacts/{tripId}.
  it('لا أحد يستطيع حذف مستند الرحلة من العميل — حتى المسؤول', async () => {
    await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة تجريبية' }))
    await assertFails(deleteDoc(tripConfigDoc(adminDb())))
  })
})

// 🆕 السجلّ فهرس إداري لا مصدر صلاحية: تكتبه الدوال بـ Admin SDK وحدها، ويقرأه
// المسؤول وحده. وهو يحمل «متى انضم» و«من هو»، ويُتّخذ عليه قرار إزالة عضو — فأي
// كتابة من عميل تعني تزوير المُدخَل الذي يُبنى عليه ذلك القرار.
describe('سجلّ عضوية الرحلة — trips/{tripId}/members', () => {
  beforeEach(async () => {
    await seed(db => setDoc(tripMemberDoc(db, 'member-1'), { joinedAt: 1_700_000_000_000 }))
  })

  it('المسؤول يقرأ السجلّ — وهو الغرض كله: معرفة من في الرحلة', async () => {
    await assertSucceeds(getDocs(tripMembersCol(adminDb())))
    await assertSucceeds(getDoc(tripMemberDoc(adminDb(), 'member-1')))
  })

  // ⚠️ حتى سطر العضو نفسه: القرار مبدئياً «المسؤول وحده». السماح للعضو بقراءة
  // سطره إضافة غير كاسرة متى لزمت، لكن الافتراضي يبقى الأضيق.
  it('عضو الرحلة لا يقرأ السجلّ ولا حتى سطره هو', async () => {
    await assertFails(getDocs(tripMembersCol(memberDb())))
    await assertFails(getDoc(tripMemberDoc(memberDb('member-1'), 'member-1')))
  })

  it('عضو رحلة أخرى ومجهول: لا شيء', async () => {
    await assertFails(getDocs(tripMembersCol(otherTripMemberDb())))
    await assertFails(getDocs(tripMembersCol(anonDb())))
  })

  it('لا كتابة من أي عميل — بما فيه المسؤول ومَن السطرُ سطرُه', async () => {
    await assertFails(setDoc(tripMemberDoc(adminDb(), 'member-2'), { joinedAt: Date.now() }))
    await assertFails(setDoc(tripMemberDoc(memberDb('member-1'), 'member-1'), { joinedAt: 1 }))
    await assertFails(updateDoc(tripMemberDoc(adminDb(), 'member-1'), { joinedAt: 1 }))
    await assertFails(deleteDoc(tripMemberDoc(adminDb(), 'member-1')))
  })

  // 🆕 المرحلة ٣ — منظّم الرحلة يحتاج قراءة السجلّ ليعرف من يُزيل، لكن هذا لا
  // يمنحه كتابة عليه (يبقى «لا كتابة من أي عميل» أعلاه صحيحاً له أيضاً — نفس
  // الدور محكوم بنفس السطر الذي منحه القراءة).
  describe('منظّم الرحلة (المرحلة ٣)', () => {
    it('منظّم الرحلة يقرأ السجلّ كاملاً', async () => {
      await seedOrganizer('organizer-1')
      await assertSucceeds(getDocs(tripMembersCol(organizerDb())))
      await assertSucceeds(getDoc(tripMemberDoc(organizerDb(), 'member-1')))
    })

    it('منظّم رحلة أخرى لا يقرأ سجلّ هذه الرحلة', async () => {
      await seedOrganizer('organizer-1', OTHER_TRIP_ID)
      await assertFails(getDocs(tripMembersCol(organizerDb())))
    })

    it('حتى المنظّم لا يكتب على السجلّ — دوره نفسه غير قابل للتعديل من العميل', async () => {
      await seedOrganizer('organizer-1')
      await assertFails(setDoc(tripMemberDoc(organizerDb(), 'member-1'), { role: 'organizer', joinedAt: 1 }))
      await assertFails(updateDoc(tripMemberDoc(organizerDb(), 'member-1'), { role: 'member' }))
    })
  })

  // ⚠️ الحالة التي تنكسر بصمت لو نُسي match المتداخل: قواعد المستند الأب لا تسري
  // على مجموعاته الفرعية في Firestore. فلو حُذفت كتلة members لسقط المسار إلى
  // «مرفوض افتراضياً» — ويبدو ذلك آمناً، لكنه يعطّل قراءة المسؤول بلا أي إشارة.
  it('عضو الرحلة يقرأ مستند الرحلة نفسه لكن لا يرث ذلك على السجلّ', async () => {
    await seed(db => setDoc(tripConfigDoc(db), { name: 'رحلة' }))
    await assertSucceeds(getDoc(tripConfigDoc(memberDb())))
    await assertFails(getDoc(tripMemberDoc(memberDb(), 'member-1')))
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
