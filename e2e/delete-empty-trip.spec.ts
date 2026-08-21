// 🔴 انحدار حقيقي رُصد في الإنتاج (لا افتراضي): حذف رحلة يتطلب خلوّها من
// بيانات مالية حقيقية — لكن منذ أن صار كل إنشاء رحلة (ذاتي أو من لوحة
// الإدارة) يُزوِّد منظّمها بملف مسافر فوراً (provisionTravelerForUid في
// manageTrip)، صار كل مسافر واحد على الأقل موجوداً منذ لحظة الإنشاء دائماً.
// معاملة "أي مسافر موجود" كرفض — سلوك الحذف الأصلي — كانت تُبطل ميزة حذف
// الرحلة بالكامل على أي رحلة جديدة: مسؤول أنشأ رحلة تجريبية من لوحة الإدارة،
// حذف نفسه من قائمة المسافرين (حذفاً ليّناً، الوحيد المتاح)، ثم فوجئ برفض حذف
// الرحلة رغم أنها "فارغة" ظاهرياً. انظر functions/index.js:
// checkTripHasProtectedData وdocs/DECISIONS.md.
//
// حذف رحلة مسؤول-فقط (manageTrip mode:'delete' يرفض غير المسؤول) — لذا هذا
// الاختبار يبدأ من حساب مسؤول عالمي بلا رحلة سابقة (seedBareAdmin)، لا عضواً
// عادياً كبقية سيناريوهات الإنشاء الذاتي.
import { test, expect, type Page } from '@playwright/test'
import { seedBareAdmin } from './utils/seed'
import { signInWithEmail } from './utils/flows'

const CREDS = {
  email: 'e2e-delete-empty-trip-admin@test.local',
  password: 'E2eTestPass!1',
}
const TRIP_ID = 'e2e-delete-empty-trip'
const TRIP_NAME = 'رحلة للحذف'

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

/**
 * لوحة إدارة المسؤول تفتح دائماً على قائمة كل الرحلات (لا رحلته وحدها كما
 * للمنظّم) — والقائمة تضمّ رحلات كل ملفات الاختبار الأخرى المشتركة في نفس
 * محاكي Firestore. نحدّد صفّ رحلتنا بالضبط عبر معرّفها الفريد قبل الضغط على
 * "تعديل" لفتح تفاصيلها.
 */
async function openTripDetailAsAdmin(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(إدارة الرحلة|إدارة الرحلات)$/ }).click()
  const tripRow = page.locator('div.bg-white.rounded-2xl.shadow-sm.border.border-slate-200.p-4')
    .filter({ hasText: TRIP_ID })
  await tripRow.getByRole('button', { name: 'تعديل' }).click()
}

test('مسؤول يحذف نفسه من مسافري رحلة أنشأها، ثم يستطيع حذف الرحلة الفارغة فعلياً', async ({ page }) => {
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  // ── ينشئ رحلة من شاشة «رحلاتي» — نفس مسار الإنشاء الذاتي، متاح للمسؤول أيضاً.
  // exact: true يتجنّب تطابقاً جزئياً مع زرّ الحالة الفارغة "إنشاء رحلة جديدة"
  // (يحوي "رحلة جديدة" كجزء من نصّه). ─────────────────────────────────────
  await page.getByRole('button', { name: 'رحلة جديدة', exact: true }).click()
  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill(TRIP_NAME)
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))

  // ── محاولة حذف مبكرة: المسافر المُزوَّد تلقائياً للمنظّم (المسؤول نفسه) لا
  // يزال نشِطاً، فيُرفض الحذف — هذا السلوك يجب أن يبقى كما هو (حماية بيانات
  // حقيقية). ─────────────────────────────────────────────────────────────
  await openTripDetailAsAdmin(page)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()
  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()
  await expect(page.getByText(/لأنها تحوي مسافرين أو مصاريف/)).toBeVisible()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): الرحلة لم تُحذف فعلاً، لا تزال قابلة للإدارة.
  await expect(page.getByRole('heading', { name: TRIP_NAME })).toBeVisible()
  await page.getByRole('button', { name: 'إغلاق إدارة الرحلات' }).click()

  // ── يحذف نفسه من قائمة المسافرين — حذفاً ليّناً، الوحيد المتاح له ─────────
  await page.getByRole('button', { name: 'حذف المسافر' }).click()
  await expect(page.getByRole('heading', { name: /حذف .+؟/ })).toBeVisible()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()

  // ── إعادة المحاولة: لا مسافر نشِط ولا سجلّ إيداع بعد الآن — يجب أن تنجح ────
  await openTripDetailAsAdmin(page)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()
  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()

  await expect(page.getByText(`تم حذف الرحلة "${TRIP_ID}"`)).toBeVisible()
  // النجاح يعيد اللوحة لقائمة الرحلات (onDeleted في TripDetailPanel) — رحلتنا
  // اختفت منها فعلاً، لا مجرّد رسالة نجاح بلا أثر حقيقي.
  await expect(page.getByRole('heading', { name: 'إدارة الرحلات' })).toBeVisible()
  await expect(page.getByText(TRIP_NAME)).not.toBeVisible()
})
