// 🔴 استعادة رحلة طويلة المدى: تعود كما كانت لا رحلةً عادية.
//
// كانت النسخة الاحتياطية لا تحمل حقول الأشهر، فتُستعاد رحلة الانتداب قياسية:
// تختفي «هذا الشهر»، ويضيع آخر إغلاق — وهو ما يمنع إغلاق شهر مغلق مرة ثانية.
// الحالة السالبة جزء من الاختبار لا إضافة عليه: نسخة بآخر إغلاق لا يسبق الشهر
// المفتوح تُرفض كاملة، لأن نصف الحقول أخطر من غيابها.
import { test, expect } from '@playwright/test'
import { seedBareAdmin, adminFirestore } from './utils/seed'
import { signInWithEmail } from './utils/flows'

test.describe.configure({ mode: 'serial' })

const CREDS = { email: 'e2e-restore-lt-admin@test.local', password: 'E2eTestPass!1' }

const backup = (trip: Record<string, unknown>) => ({
  schemaVersion: 1,
  exportedAt: '2026-09-29T10:00:00.000Z',
  tripId: 'e2e-lt-source',
  trip: { name: 'انتداب مستعاد', itinerary: [], status: 'active', ...trip },
  travelers: [{ id: 1, name: 'سعد', shortName: 'سعد', deposited: 100, deletedAt: null }],
  expenses: [],
  depositLogs: [],
  travelerNames: [{ shortName: 'سعد', travelerId: 1 }],
  repayments: [],
})

const LONG_TERM = {
  tripType: 'long_term', currentPeriod: '2026-10', lastClosedPeriod: '2026-09',
  lastClosedAt: 1_790_000_000_000, cycleStartDay: 27,
}

async function restore(page: import('@playwright/test').Page, file: object, tripId: string) {
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)
  await page.getByRole('button', { name: 'رحلة جديدة', exact: true }).click()
  await page.getByRole('button', { name: /استعادة من نسخة احتياطية/ }).click()
  await page.locator('#restore-file').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
  })
  await page.getByLabel('معرّف الرحلة').fill(tripId)
  await page.getByRole('button', { name: 'استعادة الرحلة' }).click()
}

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('رحلة طويلة تُستعاد بنوعها وشهرها المفتوح وآخر إغلاق ويوم البداية', async ({ page }) => {
  await restore(page, backup(LONG_TERM), 'e2e-restored-long-term')

  const trip = adminFirestore().collection('trips').doc('e2e-restored-long-term')
  await expect.poll(async () => (await trip.get()).data(), { timeout: 20_000 }).toMatchObject(LONG_TERM)
})

test('نسخة بآخر إغلاق لا يسبق الشهر المفتوح تُرفض ولا تُكتب منها رحلة', async ({ page }) => {
  await restore(page, backup({ ...LONG_TERM, lastClosedPeriod: '2026-10' }), 'e2e-restored-long-term-bad')

  await expect(page.getByText('آخر شهر مغلق داخل النسخة غير صالح.')).toBeVisible({ timeout: 20_000 })
  expect((await adminFirestore().collection('trips').doc('e2e-restored-long-term-bad').get()).exists).toBe(false)
})
