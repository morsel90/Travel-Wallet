// 🔴 رحلة انتهت وتساوت حساباتها تُحذف فوراً — لا بعد ٩٠ يوماً من الأرشفة.
//
// البلاغ الذي أوجد هذا: رحلة يوم واحد (Bh26)، سوّى صاحبها حسابها بتحويل بنكي
// في مساء اليوم نفسه، ثم رفض التطبيق حذفها برسالة تنتهي بـ«[400]» ولا تقول
// متى يُسمح. الـ٩٠ يوماً تحمي من حذف دين لم يُدفع، ورحلة كل أرصدتها صفر لا دين
// فيها. انظر settledClosureBlock في functions/index.js.
//
// ⚠️ الاختباران معاً هما الدليل، لا الأول وحده: الثاني هو الرحلة نفسها **قبل**
// التسوية، فيثبت أن الحذف فتحته التسويةُ لا شيءٌ آخر (الحالة، أو غياب فحص).
import { test, expect } from '@playwright/test'
import { seedBareAdmin, seedBareUser, adminFirestore, adminAuth } from './utils/seed'
import { signInWithEmail, openTripDetailFromHeader } from './utils/flows'

const CREDS = {
  email: 'e2e-delete-settled-admin@test.local',
  password: 'E2eTestPass!1',
}
const SETTLED_TRIP_ID = 'e2e-delete-settled'
const UNSETTLED_TRIP_ID = 'e2e-delete-unsettled'

const dataRoot = (tripId: string) =>
  adminFirestore().collection('artifacts').doc(tripId).collection('public').doc('data')

/**
 * رحلة منتهية بمسافرَين — سيناريو Bh26 نفسه: أحمد دفع عشاء 200 **من جيبه** عن
 * الاثنين (100 لكل منهما)، ولا أحد أودع شيئاً، فأحمد له 100 ومحمد عليه 100.
 * `settled` تضيف ما يكتبه recordSettlement حرفياً: قيد سداد من محمد إلى أحمد
 * بـ100 — لا تعديلاً على «المودَع» — فتصير الأرصدة صفراً.
 */
async function seedCompletedTrip(tripId: string, settled: boolean): Promise<void> {
  await adminFirestore().collection('trips').doc(tripId).set({
    name: `رحلة ${tripId}`, status: 'completed', statusChangedAt: Date.now(), itinerary: [],
  })
  const root = dataRoot(tripId)
  await root.collection('travelers').doc('1').set({ id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0, deletedAt: null })
  await root.collection('travelers').doc('2').set({ id: 2, name: 'محمد', shortName: 'محمد', deposited: 0, deletedAt: null })
  await root.collection('expenses').doc('e1').set({
    date: '2026-09-18', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR',
    exchangeRate: 1, participants: [1, 2], paidBy: 1, category: 'طعام وشراب', createdAt: Date.now(), deletedAt: null,
  })
  if (settled) {
    await root.collection('repayments').doc('r1').set({
      fromId: 2, toId: 1, amount: 100, date: '2026-09-18', createdAt: Date.now(), createdByUid: 'seed', deletedAt: null,
    })
  }
}

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('رحلة منتهية ومسوّاة بقيد سداد — تُحذف فوراً وتُحذف بياناتها فعلاً', async ({ page }) => {
  await seedCompletedTrip(SETTLED_TRIP_ID, true)

  // 🆕 عضوٌ يحمل عضوية الرحلة (claim) بلا سطر في سجلّ الأعضاء — تماماً كحسابات
  // حقبة رمز الرحلة التي بقيت 218 منها بعد حذف travelapp-87206 — ودعوةٌ حيّة لها.
  // ومعهما عضويةٌ في رحلة أخرى يجب أن تبقى كما هي.
  const memberUid = await seedBareUser('e2e-delete-settled-member@test.local', 'E2eTestPass!1')
  await adminAuth().setCustomUserClaims(memberUid, { trips: { [SETTLED_TRIP_ID]: true, 'e2e-other-live-trip': true } })
  await adminFirestore().collection('tripInvites').doc('e2eDeleteSettledInviteToken1').set({ tripId: SETTLED_TRIP_ID, createdAt: Date.now() })

  await page.goto(`/?trip=${SETTLED_TRIP_ID}`)
  await signInWithEmail(page, CREDS.email, CREDS.password)
  await openTripDetailFromHeader(page)

  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(SETTLED_TRIP_ID)
  await Promise.all([
    page.waitForURL(url => !url.searchParams.has('trip')),
    page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click(),
  ])
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): البيانات حُذفت، لا مستند الرحلة وحده.
  // لو بقيت artifacts يتيمة لكان «الحذف» إخفاءً — ولبقي المعرّف غير قابل لإعادة الاستخدام نظيفاً.
  expect((await adminFirestore().collection('trips').doc(SETTLED_TRIP_ID).get()).exists).toBe(false)
  expect((await dataRoot(SETTLED_TRIP_ID).collection('expenses').doc('e1').get()).exists).toBe(false)
  expect((await dataRoot(SETTLED_TRIP_ID).collection('repayments').doc('r1').get()).exists).toBe(false)

  // 🆕 ولا وصول يبقى: لا عضوية في الـclaims، ولا رابط دعوة. وإلا فتحت رحلةٌ جديدة
  // بالمعرّف نفسه لكل حامل عضوية القديمة، وضمّ الرابطُ أحداً إلى رحلة غير موجودة.
  await expect.poll(async () => (await adminAuth().getUser(memberUid)).customClaims?.trips)
    .toEqual({ 'e2e-other-live-trip': true })
  expect((await adminFirestore().collection('tripInvites').doc('e2eDeleteSettledInviteToken1').get()).exists).toBe(false)

  // 🆕 ورابط الرحلة المحذوفة (أيقونة شاشة رئيسية قديمة) يقول الحقيقة بدل رحلة شبح.
  await page.goto(`/?trip=${SETTLED_TRIP_ID}`)
  await expect(page.getByText('هذه الرحلة حُذفت')).toBeVisible()
  await expect(page.getByRole('button', { name: 'رحلاتي' })).toBeVisible()
})

test('الرحلة نفسها قبل التسوية تُرفض — برسالة تسمّي المخرج، وبلا رمز HTTP في نهايتها', async ({ page }) => {
  await seedCompletedTrip(UNSETTLED_TRIP_ID, false)

  await page.goto(`/?trip=${UNSETTLED_TRIP_ID}`)
  await signInWithEmail(page, CREDS.email, CREDS.password)
  await openTripDetailFromHeader(page)

  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(UNSETTLED_TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()

  const refusal = page.getByText(/قبل تسوية حساباتها/)
  await expect(refusal).toBeVisible()
  // الرسالة تقول ماذا يفعل — لا «ممنوع» وحدها.
  await expect(refusal).toContainText('سجّل التحويلات من قسم «الأرصدة»')
  // 🐛 SDK فايربيس كان يُلحق «[400]» بكل رسالة خادم — callableMessage يُسقطه.
  await expect(refusal).not.toContainText('[400]')

  // والرحلة باقية بكل بياناتها.
  expect((await dataRoot(UNSETTLED_TRIP_ID).collection('expenses').doc('e1').get()).exists).toBe(true)
})
