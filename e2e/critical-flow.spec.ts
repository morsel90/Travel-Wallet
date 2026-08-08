// 🔴 السيناريو الأهم: التدفق الكامل الذي يمر به مستخدم حقيقي من أول لحظة حتى
// تصدير التقرير — دخول الرحلة، التحقق من الرمز، إضافة مسافرين، تسجيل مصروف،
// تعديله، التأكد من ظهور الرصيد والتسوية بشكل صحيح، ثم فتح التقرير وتصديره.
//
// ⚠️ إضافة مسافر تتطلب وضع المسؤول (انظر التعليق في e2e/utils/flows.ts)، لذا
// الجلسة هنا تدخل كعضو عادي عبر رمز الرحلة أولاً (كما يحدث فعلياً)، ثم تسجّل
// دخول المسؤول من نفس الجلسة — تماماً كما يفعل منظّم رحلة حقيقي في أول استخدام.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense, editExpenseAmount, expenseCard } from './utils/flows'

const CREDS = {
  tripId: 'e2e-critical-flow',
  pin: '135790',
  adminEmail: 'e2e-admin-critical@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('التدفق الحرج الكامل: PIN → مسافرون → مصروف → تعديل → رصيد → تسوية → تقرير → تصدير', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  // ── إضافة مسافرين ────────────────────────────────────────────────────────
  await addTraveler(page, 'أحمد الغامدي', '1000')
  await expect(page.getByText('أحمد الغامدي')).toBeVisible()

  await addTraveler(page, 'سارة القحطاني', '100')
  await expect(page.getByText('سارة القحطاني')).toBeVisible()

  // ── تسجيل مصروف (يُقسّم بالتساوي على الاثنين افتراضياً) ────────────────────
  await addExpense(page, { amount: '400', description: 'عشاء الوصول' })
  await expect(page.getByText('عشاء الوصول')).toBeVisible()

  // ── الرصيد: 400 ÷ 2 = 200 لكل شخص ───────────────────────────────────────
  const ahmadCard = page.locator('div.group').filter({ hasText: 'أحمد الغامدي' })
  const saraCard = page.locator('div.group').filter({ hasText: 'سارة القحطاني' })
  await expect(ahmadCard.getByText('800.00', { exact: true })).toBeVisible()  // 1000 - 200
  await expect(saraCard.getByText('-100.00', { exact: true })).toBeVisible()  // 100 - 200

  // ── التسوية: سارة مدينة لأحمد بمقدار 100 ────────────────────────────────
  const settlementsPanel = page.locator('section', { hasText: 'ملخص وإحصائيات الرحلة' })
  await expect(settlementsPanel).toContainText('أحمد')
  await expect(settlementsPanel).toContainText('سارة')
  await expect(settlementsPanel).toContainText('100.00')

  // ── تعديل المصروف: 400 → 600 (300 لكل شخص) ──────────────────────────────
  await editExpenseAmount(page, 'عشاء الوصول', '600')
  await expect(expenseCard(page, 'عشاء الوصول')).toContainText('600.00')

  await expect(ahmadCard.getByText('700.00', { exact: true })).toBeVisible()  // 1000 - 300
  await expect(saraCard.getByText('-200.00', { exact: true })).toBeVisible()  // 100 - 300
  await expect(settlementsPanel).toContainText('200.00')

  // ── التقرير ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'التقارير' }).click()
  await expect(page.getByRole('heading', { name: 'تقارير الرحلة' })).toBeVisible()

  // ── التصدير (Excel) — تنزيل حقيقي عبر Blob + <a download> ──────────────
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^تقرير_الرحلة_.*\.xlsx$/)
})
