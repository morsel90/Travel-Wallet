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
  memberEmail: 'e2e-member-picker@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-picker@test.local', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('عضو انضم لرحلة يرى قائمة رحلاته عند فتح التطبيق بلا معرّف رحلة، ويدخلها بالضغط عليها', async ({ page }) => {
  // العضوية ممنوحة مسبقاً كـ claim عبر seedTrip (نفس أثر استهلاك رابط دعوة حقيقي) —
  // تسجيل الدخول هنا عبر AuthGate وحده كافٍ لرؤيتها.
  await openTripAsMember(page, CREDS)
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()

  // فتح التطبيق مجرّداً: لا `?trip=` — يجب أن تظهر «رحلاتي» لا بوابة تسجيل الدخول
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()

  const tripButton = page.getByRole('button', { name: new RegExp(CREDS.tripId) })
  await expect(tripButton).toBeVisible()

  // الضغط على الرحلة يفتحها مباشرةً — بلا مطالبة بتسجيل دخول جديد، لأن الجلسة
  // ما زالت قائمة والعضوية محفوظة في claims الحساب
  await tripButton.click()
  await expect(page).toHaveURL(new RegExp(`trip=${CREDS.tripId}`))
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()
})
