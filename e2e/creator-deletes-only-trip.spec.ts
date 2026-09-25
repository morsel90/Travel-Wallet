// 🔴 انحدار أُبلغ عنه من الإنتاج يوم إتاحة حذف الرحلة لمنشئها: حذف منشئٍ
// لرحلته **الوحيدة** أعاده إلى «رحلاتي» برسالة «تعذّر جلب رحلاتك — تحقّق من
// اتصالك» بلا أي مشكلة اتصال. الرحلة تبقى في claims توكنه حتى يتجدّد، فيجد
// useMyTrips مستندها غير موجود — وكان يحسب ذلك فشلاً. انظر useMyTrips.ts.
//
// الاختبار يعبر المسار نفسه بحساب عادي بلا أي رحلة أخرى — الشرط الذي يُظهر الخلل
// (وجود رحلة ثانية ناجحة كان يخفيه تماماً).
import { test, expect } from '@playwright/test'
import { seedBareUser } from './utils/seed'
import { signInWithEmail, openTripDetailFromHeader } from './utils/flows'

const CREDS = { email: 'e2e-creator-deletes-only-trip@test.local', password: 'E2eTestPass!1' }
const TRIP_ID = 'e2e-creator-only-trip'

test.beforeAll(async () => {
  await seedBareUser(CREDS.email, CREDS.password)
})

test('منشئ يحذف رحلته الوحيدة فيعود إلى «رحلاتي» فارغة — بلا رسالة خطأ اتصال', async ({ page }) => {
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  await page.getByRole('button', { name: 'إنشاء رحلة جديدة' }).click()
  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill('رحلة ستُحذف')
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))

  // المسافر المُزوَّد تلقائياً (المنشئ نفسه) يمنع الحذف ما دام نشطاً — يحذفه
  // المنشئ أولاً، وهي صلاحية صارت له (deletedAt وحده في القواعد).
  const deleteTraveler = page.getByRole('button', { name: 'حذف المسافر' })
  await deleteTraveler.first().hover()
  await deleteTraveler.first().click()
  await expect(deleteTraveler).toHaveCount(0)

  await openTripDetailFromHeader(page)
  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(TRIP_ID)
  await Promise.all([
    page.waitForURL(url => !url.searchParams.has('trip')),
    page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click(),
  ])

  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()
  await expect(page.getByText('لم تنضم لأي رحلة بعد')).toBeVisible()
  // ⚠️ الحالة الحاكمة: لا رسالة اتصال — لم يفشل شيء.
  await expect(page.getByText('تعذّر جلب رحلاتك')).toHaveCount(0)
})
