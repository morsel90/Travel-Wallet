// 🔴 وضع المسؤول يجب أن يصمد عبر إعادة تحميل الصفحة — والتبديل بين الرحلات
// إعادة تحميل كاملة (TRIP_ID يُقرأ مرة واحدة عند تحميل الوحدة، utils/tripId.ts).
//
// ⚠️ اختبار انحدار لخلل حقيقي: كان signInAnonymously يُستدعى بلا شرط عند كل
// تحميل، وسلوك Firebase أن إنشاء جلسة مجهولة بينما المستخدم الحالي غير مجهول
// يُحلّها محلّه — فيُطرد المسؤول من جلسته مع كل إعادة تحميل. لم يظهر الأثر
// عملياً إلا بعد إضافة التبديل بين الرحلات، لأنه أول ما يُعيد التحميل بانتظام.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin } from './utils/flows'

const CREDS = {
  tripId: 'e2e-admin-persist-a',
  pin: '445566',
  adminEmail: 'e2e-admin-persist@test.local',
  adminPassword: 'E2eTestPass!1',
}

const SECOND_TRIP_ID = 'e2e-admin-persist-b'

test.beforeAll(async () => {
  await seedTrip(CREDS)
  // رحلة ثانية بنفس حساب المسؤول — لاختبار التبديل بينهما
  await seedTrip({ ...CREDS, tripId: SECOND_TRIP_ID, pin: '667788' })
})

test('وضع المسؤول يصمد عبر إعادة التحميل والتبديل بين الرحلات', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  // ── إعادة تحميل بسيطة لنفس الرحلة ────────────────────────────────────────
  await page.reload()
  await expect(page.getByRole('button', { name: 'إغلاق المسؤول' })).toBeVisible()

  // ── التبديل لرحلة أخرى (إعادة تحميل كاملة عبر ?trip=) ───────────────────
  await page.goto(`/?trip=${SECOND_TRIP_ID}`)
  await expect(page.getByRole('button', { name: 'إغلاق المسؤول' })).toBeVisible()
  // ولا يُطالَب برمز الرحلة الثانية إطلاقاً — المسؤول يتجاوز البوابة
  await expect(page.getByPlaceholder('رمز الرحلة')).not.toBeVisible()

  // ── العودة للرحلة الأولى ─────────────────────────────────────────────────
  await page.goto(`/?trip=${CREDS.tripId}`)
  await expect(page.getByRole('button', { name: 'إغلاق المسؤول' })).toBeVisible()
})

test('الخروج من وضع المسؤول يعيد الجلسة لعضو عادي', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  await page.getByRole('button', { name: 'إغلاق المسؤول' }).click()
  await expect(page.getByRole('button', { name: 'وضع المسؤول' })).toBeVisible()
})
