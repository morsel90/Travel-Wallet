// 🔴 المسار السلبي لبوابة الرحلة: رمز خاطئ يُرفض برسالة واضحة ولا يمنح وصولاً،
// والرمز الصحيح بعده ينجح فوراً — دون الحاجة لتسجيل دخول مسؤول (عضو عادي).
import { test, expect } from '@playwright/test'
import { seedTrip, clearPinRateLimits } from './utils/seed'

const CREDS = {
  tripId: 'e2e-wrong-pin',
  pin: '024680',
  adminEmail: 'e2e-admin-wrongpin@test.local', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('رمز خاطئ يُرفض برسالة واضحة، والرمز الصحيح يمنح الوصول بعدها', async ({ page }) => {
  // هذا الاختبار وحده يعتمد على *نص* رسالة الخطأ، فيجب أن يبدأ بعدّاد محاولات
  // نظيف — وإلا جاءته رسالة تجاوز الحدّ من محاولات اختبارات أخرى تشاركه المفتاح.
  await clearPinRateLimits()

  await page.goto(`/?trip=${CREDS.tripId}`)

  const pinInput = page.getByPlaceholder('رمز الرحلة')
  await pinInput.fill('000000')
  await page.getByRole('button', { name: 'متابعة' }).click()

  await expect(page.getByText('رمز الرحلة غير صحيح، حاول مرة أخرى.')).toBeVisible()
  // ما زلنا خلف البوابة — لا Header ولا أي محتوى من التطبيق
  await expect(page.getByRole('button', { name: 'وضع المسؤول' })).not.toBeVisible()

  await pinInput.fill(CREDS.pin)
  await page.getByRole('button', { name: 'متابعة' }).click()

  // تجاوزنا البوابة كعضو عادي (بلا تسجيل دخول مسؤول) — الهيدر ظاهر الآن
  await expect(page.getByRole('button', { name: 'وضع المسؤول' })).toBeVisible()
  await expect(page.getByText('رمز الرحلة غير صحيح، حاول مرة أخرى.')).not.toBeVisible()
})
