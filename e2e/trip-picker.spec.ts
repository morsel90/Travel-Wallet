// 🔴 شاشة «رحلاتي»: من يفتح التطبيق بلا `?trip=` لا رحلة مقصودة لديه، فيرى
// قائمة رحلاته ويختار منها — بدل أن يُطالَب برمز الرحلة الافتراضية التي قد لا
// تعنيه إطلاقاً.
//
// ⚠️ اختبار انحدار لخطأ تصميم حقيقي: أول نسخة ربطت ظهور الشاشة بـ needsTripPin
// و!isAdmin معاً، فاختفت عن كل عضو في الرحلة الافتراضية (وهم الأغلبية) وعن
// المسؤول تماماً — أي عن كل من قد يجرّبها عملياً.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsMember } from './utils/flows'

const CREDS = {
  tripId: 'e2e-trip-picker',
  pin: '778899',
  adminEmail: 'e2e-admin-picker@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('عضو انضم لرحلة يرى قائمة رحلاته عند فتح التطبيق بلا معرّف رحلة، ويدخلها بالضغط عليها', async ({ page }) => {
  // الانضمام أولاً عبر رابط الرحلة ورمزها — هذا ما يمنح العضوية في claims التوكن
  await openTripAsMember(page, CREDS.tripId, CREDS.pin)
  await expect(page.getByRole('button', { name: 'وضع المسؤول' })).toBeVisible()

  // فتح التطبيق مجرّداً: لا `?trip=` — يجب أن تظهر «رحلاتي» لا بوابة الرمز
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()
  await expect(page.getByPlaceholder('رمز الرحلة')).not.toBeVisible()

  const tripButton = page.getByRole('button', { name: new RegExp(CREDS.tripId) })
  await expect(tripButton).toBeVisible()

  // الضغط على الرحلة يفتحها مباشرةً — بلا مطالبة بالرمز مجدداً، لأن العضوية
  // محفوظة في claims الحساب (الرمز خطوة انضمام لمرة واحدة لا بوابة متكررة)
  await tripButton.click()
  await expect(page).toHaveURL(new RegExp(`trip=${CREDS.tripId}`))
  await expect(page.getByRole('button', { name: 'وضع المسؤول' })).toBeVisible()
  await expect(page.getByPlaceholder('رمز الرحلة')).not.toBeVisible()
})
