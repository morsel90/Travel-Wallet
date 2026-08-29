// 🔴 المرحلة ٢ من دورة حياة الرحلة التلقائية (docs/DECISIONS.md): رحلة مؤرشفة
// منذ أكثر من مدة السماح (90 يوماً) يصبح حذفها النهائي متاحاً — حتى لو كانت
// تحوي بيانات مالية حقيقية (مسافرين نشِطين بإيداعات فعلية)، وهي البيانات
// نفسها التي checkTripHasProtectedData ترفض حذف رحلة أصغر سناً بسببها (انظر
// delete-empty-trip.spec.ts). الحذف نفسه يبقى بفعل بشري دائماً — لا شيء
// تلقائي هنا — لكن artifacts/{tripId} يُحذف فعلياً هذه المرة (لا يُترَك
// يتيماً كما في المسار العادي) لأن الغاية إزالة بيانات حقيقية، لا مجرّد
// إخفاء الرحلة. انظر functions/index.js: isEligibleForAgePurgeJs.
import { test, expect } from '@playwright/test'
import { seedBareAdmin, adminFirestore } from './utils/seed'
import { signInWithEmail, openTripDetailAsAdmin } from './utils/flows'

const CREDS = {
  email: 'e2e-purge-old-archived-admin@test.local',
  password: 'E2eTestPass!1',
}
const OLD_TRIP_ID = 'e2e-purge-old-archived'
const RECENT_TRIP_ID = 'e2e-recent-archived'
const DAY_MS = 24 * 60 * 60 * 1000

async function seedArchivedTripWithRealData(tripId: string, name: string, archivedDaysAgo: number): Promise<void> {
  const db = adminFirestore()
  const now = Date.now()

  await db.collection('trips').doc(tripId).set({
    name,
    status: 'archived',
    statusChangedAt: now - archivedDaysAgo * DAY_MS,
    itinerary: [],
  })

  // مسافر نشِط بإيداع حقيقي — بيانات مالية حقيقية، لا مستنداً بالسلة أو فارغاً.
  await db.collection('artifacts').doc(tripId).collection('public').doc('data')
    .collection('travelers').doc('1')
    .set({ id: 1, name: 'مسافر حقيقي', shortName: 'مسافر', deposited: 500, deletedAt: null })
}

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('مسؤول يحذف رحلة مؤرشفة منذ أكثر من 90 يوماً رغم بيانات مالية حقيقية — تُحذف البيانات فعلياً لا يتيمة', async ({ page }) => {
  await seedArchivedTripWithRealData(OLD_TRIP_ID, 'رحلة قديمة مؤرشفة', 100)

  await page.goto(`/?trip=${OLD_TRIP_ID}`)
  await signInWithEmail(page, CREDS.email, CREDS.password)

  await openTripDetailAsAdmin(page, OLD_TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()

  // الرسالة الاستثنائية تظهر — الاستثناء واضح للمسؤول قبل أن يضغط، لا مفاجأة بعد الحذف.
  await expect(page.getByText(/مؤرشفة منذ أكثر من 90 يوماً/)).toBeVisible()

  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(OLD_TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()

  await expect(page.getByText(`تم حذف الرحلة "${OLD_TRIP_ID}"`)).toBeVisible()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): artifacts/{tripId} حُذف فعلياً — المسافر
  // النشِط ببيانات مالية حقيقية لم يُترَك يتيماً في Firestore.
  const db = adminFirestore()
  const travelerSnap = await db.collection('artifacts').doc(OLD_TRIP_ID)
    .collection('public').doc('data').collection('travelers').doc('1').get()
  expect(travelerSnap.exists).toBe(false)
})

test('رحلة مؤرشفة حديثاً (أقل من 90 يوماً) ببيانات مالية حقيقية تبقى محمية كالمعتاد', async ({ page }) => {
  await seedArchivedTripWithRealData(RECENT_TRIP_ID, 'رحلة مؤرشفة حديثاً', 10)

  await page.goto(`/?trip=${RECENT_TRIP_ID}`)
  await signInWithEmail(page, CREDS.email, CREDS.password)

  await openTripDetailAsAdmin(page, RECENT_TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()

  // لا استثناء لرحلة لم تبلغ مدة السماح بعد.
  await expect(page.getByText(/مؤرشفة منذ أكثر من 90 يوماً/)).not.toBeVisible()

  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(RECENT_TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()

  // الرفض المعتاد — نفس حماية delete-empty-trip.spec.ts، غير مُتجاوَزة هنا.
  await expect(page.getByText(/لأنها تحوي مسافرين أو مصاريف/)).toBeVisible()
})
