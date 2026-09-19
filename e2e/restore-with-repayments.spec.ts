// 🔴 الاستعادة تُعيد قيود السداد — وإلا عادت الرحلة بديونٍ سُدّدت فعلاً.
//
// لم يكن أيّ اختبار E2E يمرّ بـ restoreTrip الحقيقية. والاستعادة بالضبط هي
// المكان الذي يُنسى فيه حقلٌ جديد بصمت: الملف يُقبل، والرحلة تُبنى، والأرقام
// تبدو معقولة — والسداد غائب، فيظهر محمد مديناً بمبلغ حوّله قبل أسبوع.
//
// الملف هنا مكتوب يدوياً بالشكل الذي يُنتجه buildTripBackup (مع repayments)،
// ويمرّ بالنموذج نفسه الذي يستخدمه المسؤول: رحلة جديدة ← استعادة ← ملف JSON.
import { test, expect } from '@playwright/test'
import { seedBareAdmin, adminFirestore } from './utils/seed'
import { signInWithEmail } from './utils/flows'

const CREDS = { email: 'e2e-restore-repay-admin@test.local', password: 'E2eTestPass!1' }
const TARGET_TRIP_ID = 'e2e-restored-with-repayment'

// سيناريو Bh26: أحمد دفع 200 من جيبه عن الاثنين، ومحمد سدّد له 100 → مسوّاة.
const backup = {
  schemaVersion: 1,
  exportedAt: '2026-09-19T10:00:00.000Z',
  tripId: 'e2e-source-trip',
  trip: { name: 'رحلة مستعادة', itinerary: [], status: 'completed' },
  travelers: [
    { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0, deletedAt: null },
    { id: 2, name: 'محمد', shortName: 'محمد', deposited: 0, deletedAt: null },
  ],
  expenses: [{
    id: 'e1', date: '2026-09-18', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR',
    exchangeRate: 1, participants: [1, 2], paidBy: 1, category: 'طعام وشراب', createdAt: 1, deletedAt: null,
  }],
  depositLogs: [],
  travelerNames: [{ shortName: 'أحمد', travelerId: 1 }, { shortName: 'محمد', travelerId: 2 }],
  repayments: [{
    id: 'r1', fromId: 2, toId: 1, amount: 100, date: '2026-09-18', createdAt: 2, createdByUid: 'u1', deletedAt: null,
  }],
}

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('نسخة فيها سداد تُستعاد برحلة مسوّاة — القيد نفسه عاد بطرفَيه ومبلغه', async ({ page }) => {
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  await page.getByRole('button', { name: 'رحلة جديدة', exact: true }).click()
  await page.getByRole('button', { name: /استعادة من نسخة احتياطية/ }).click()
  await page.locator('#restore-file').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  })
  await page.getByLabel('معرّف الرحلة').fill(TARGET_TRIP_ID)
  await page.getByRole('button', { name: 'استعادة الرحلة' }).click()

  // ⚠️ القيد في Firestore لا مجرّد رسالة نجاح: الاستعادة تنجح شكلياً حتى لو
  // أسقطت الحقل — وهذا بالضبط ما يحرسه هذا الاختبار.
  const repayment = adminFirestore().collection('artifacts').doc(TARGET_TRIP_ID)
    .collection('public').doc('data').collection('repayments').doc('r1')
  await expect.poll(async () => (await repayment.get()).data(), { timeout: 20_000 })
    .toMatchObject({ fromId: 2, toId: 1, amount: 100, deletedAt: null })

  // والرحلة المستعادة تقول ما يقوله الواقع: لا دين بين الاثنين.
  await page.goto(`/?trip=${TARGET_TRIP_ID}`)
  await expect(page.locator('#settlements-section')).toContainText('الحسابات مصفّاة')
  await expect(page.locator('#settlements-section')).toContainText('السداد المسجّل (1)')
})
