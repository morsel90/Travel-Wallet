// 🔴 يوم بداية الشهر (cycleStartDay): الشهر من الراتب إلى الراتب.
//
// بيوم 27 يمتد «سبتمبر» من 27 أغسطس إلى 26 سبتمبر. ما يُثبته هذا الملف ولا
// يراه اختبار وحدة: أن closeMonth — على الخادم — تكتب قيد الإغلاق بتاريخ 26
// وقيد الافتتاح بتاريخ 27، لا بآخر الشهر وأوّله التقويميين. لو كتبتهما
// بالتقويم لوقع قيد إغلاق سبتمبر داخل أكتوبر، ولما وجدت التقارير حدّ الشهر.
//
// والمسار نفسه هو الطريق القصير: شريط «انتهى الشهر» ثم التأكيد. الشهر
// المفتوح مزروع ثابتاً (سبتمبر 2026)، فهو منتهٍ في أي يوم يُشغَّل فيه الاختبار.
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsAdmin } from './utils/flows'

test.describe.configure({ mode: 'serial' })

const CREDS = {
  tripId: 'e2e-cycle-start-day',
  memberEmail: 'e2e-cycle-member@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-cycle-admin@test.local',
  adminPassword: 'E2eTestPass!1',
}

const SAAD = { id: 201, name: 'سعد', shortName: 'سعد', deposited: 100 }
const KHALED = { id: 202, name: 'خالد', shortName: 'خالد', deposited: 0 }

const dataRoot = () =>
  adminFirestore().collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')

test.beforeAll(async () => {
  await seedTrip(CREDS)
  await adminFirestore().collection('trips').doc(CREDS.tripId).set({
    tripType: 'long_term',
    currentPeriod: '2026-09',
    cycleStartDay: 27,
  }, { merge: true })

  for (const traveler of [SAAD, KHALED]) {
    await dataRoot().collection('travelers').doc(String(traveler.id)).set({ ...traveler, deletedAt: null })
    await dataRoot().collection('travelerNames').doc(traveler.shortName).set({ travelerId: traveler.id })
  }

  // 28 أغسطس — داخل «سبتمبر» بيوم 27. سعد = 100 − 20 = +80، خالد = −20.
  await dataRoot().collection('expenses').doc('e2e-cycle-expense').set({
    date: '2026-08-28',
    description: 'سكن الانتداب',
    amount: 40,
    originalAmount: 40,
    currency: 'SAR',
    exchangeRate: 1,
    participants: [SAAD.id, KHALED.id],
    createdAt: Date.now(),
    createdByUid: 'seed',
    deletedAt: null,
  })
})

test('الإغلاق من الشريط يكتب قيوده على حدّ يوم 27 لا على آخر الشهر', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  await page.getByRole('button', { name: 'إغلاق الشهر', exact: true }).click()
  await expect(page.getByText('+80.00', { exact: true })).toBeVisible()
  await expect(page.getByText('−20.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'تأكيد الإغلاق' }).click()
  await expect(page.getByText(/تم إغلاق سبتمبر 2026/)).toBeVisible({ timeout: 15_000 })

  const rollovers = await dataRoot().collection('expenses').where('category', '==', 'تسوية شهرية').get()
  const byTraveler = new Map(rollovers.docs.map(d => [d.data().participants[0], d.data()]))

  // دائن: إغلاق في آخر يوم من سبتمبر بيوم 27 = 26 سبتمبر.
  expect(byTraveler.get(SAAD.id)).toMatchObject({ date: '2026-09-26', amount: 80 })
  // مدين: افتتاح في أول يوم من أكتوبر بيوم 27 = 27 سبتمبر.
  expect(byTraveler.get(KHALED.id)).toMatchObject({ date: '2026-09-27', amount: 20 })

  const trip = (await adminFirestore().collection('trips').doc(CREDS.tripId).get()).data()!
  expect(trip).toMatchObject({ currentPeriod: '2026-10', lastClosedPeriod: '2026-09', cycleStartDay: 27 })
})
