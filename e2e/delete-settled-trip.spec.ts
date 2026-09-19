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
import { seedBareAdmin, adminFirestore } from './utils/seed'
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
 * رحلة منتهية بمسافرَين: أحمد أودع 200، ومحمد لا شيء، وعشاء 200 من الصندوق
 * على الاثنين (100 لكل منهما) — فأحمد له 100 ومحمد عليه 100. `settled` تضيف ما
 * يكتبه recordSettlement حرفياً: محمد يُودَع له 100 ويُخصم من أحمد 100، فتصير
 * الأرصدة صفراً **والمودَع لا ينزل تحت الصفر** (القواعد تشترطه — انظر الحارس
 * في recordSettlement).
 */
async function seedCompletedTrip(tripId: string, settled: boolean): Promise<void> {
  await adminFirestore().collection('trips').doc(tripId).set({
    name: `رحلة ${tripId}`, status: 'completed', statusChangedAt: Date.now(), itinerary: [],
  })
  const root = dataRoot(tripId)
  await root.collection('travelers').doc('1').set({
    id: 1, name: 'أحمد', shortName: 'أحمد', deposited: settled ? 100 : 200, deletedAt: null,
  })
  await root.collection('travelers').doc('2').set({
    id: 2, name: 'محمد', shortName: 'محمد', deposited: settled ? 100 : 0, deletedAt: null,
  })
  await root.collection('expenses').doc('e1').set({
    date: '2026-09-18', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR',
    exchangeRate: 1, participants: [1, 2], paidBy: 'fund', category: 'طعام وشراب', createdAt: Date.now(), deletedAt: null,
  })
  if (settled) {
    // سطر تدقيق واحد يكفي ليكون في الرحلة «سجلّ إيداع» — أقوى ما كان يمنع الحذف.
    await root.collection('travelers').doc('2').collection('depositLogs').doc('l1').set({
      travelerId: 2, previousDeposited: 0, newDeposited: 100, delta: 100, mode: 'add',
      reason: 'تحويل إلى أحمد', changedByEmail: '', changedByUid: 'seed', createdAt: Date.now(),
    })
  }
}

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('رحلة منتهية ومسوّاة — فيها مصروف وسجلّ إيداع — تُحذف فوراً وتُحذف بياناتها فعلاً', async ({ page }) => {
  await seedCompletedTrip(SETTLED_TRIP_ID, true)

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
  expect((await dataRoot(SETTLED_TRIP_ID).collection('travelers').doc('2').collection('depositLogs').doc('l1').get()).exists).toBe(false)
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
