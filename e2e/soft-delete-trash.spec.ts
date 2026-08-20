// 🔴 يتحقق من ضمان "لا حذف حقيقي أبداً" على مستوى الواجهة والقواعد معاً
// (انظر Contributing Guidelines #5 وtests/firestore-rules): حذف مصروف ينقله
// لسلة المهملات لا يمحوه، وطريقا الاستعادة كلاهما فعليان — زر "تراجع" الفوري
// في التنبيه، وسلة المهملات لاحقاً لو لم يُستخدم "تراجع" في وقته.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense, expenseCard } from './utils/flows'

const CREDS = {
  tripId: 'e2e-soft-delete',
  memberEmail: 'e2e-member-trash@test.local', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-trash@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('حذف مصروف ثم التراجع الفوري يعيده، وحذفه مجدداً ثم استعادته من سلة المهملات يعيده أيضاً', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)
  await addTraveler(page, 'ريم العنزي', '400')
  await addExpense(page, { amount: '120', description: 'تذاكر متحف' })

  const card = expenseCard(page, 'تذاكر متحف')
  await expect(card).toBeVisible()

  // ── الحذف الأول + التراجع الفوري ─────────────────────────────────────────
  await card.hover()
  await card.getByRole('button', { name: 'حذف المصروف' }).click()
  await expect(page.getByRole('heading', { name: 'تأكيد الحذف?' })).toBeVisible()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()

  await expect(page.getByText('تم نقل المصروف إلى سلة المهملات')).toBeVisible()
  await expect(expenseCard(page, 'تذاكر متحف')).not.toBeVisible()

  // force: تنبيه النجاح يحمل animate-bounce (حركة لا نهائية في Toast.tsx)، وPlaywright
  // يرفض النقر على عنصر لا «يستقر» بين إطارات الحركة فيظل يعيد المحاولة حتى يختفي
  // التنبيه بعد 5 ثوانٍ. المستخدم الحقيقي ينقره دون مشكلة — القيد أداتي لا تطبيقي.
  await page.getByRole('button', { name: 'تراجع' }).click({ force: true })
  await expect(expenseCard(page, 'تذاكر متحف')).toBeVisible()

  // ── الحذف الثاني + الاستعادة من سلة المهملات ────────────────────────────
  const cardAgain = expenseCard(page, 'تذاكر متحف')
  await cardAgain.hover()
  await cardAgain.getByRole('button', { name: 'حذف المصروف' }).click()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()
  await expect(expenseCard(page, 'تذاكر متحف')).not.toBeVisible()

  await page.getByRole('button', { name: 'سلة المهملات' }).click()
  await expect(page.getByRole('button', { name: /المصاريف المحذوفة \(1\)/ })).toBeVisible()
  await expect(page.getByText('تذاكر متحف')).toBeVisible()

  await page.getByRole('button', { name: 'استعادة' }).click()
  await expect(page.getByRole('button', { name: /المصاريف المحذوفة \(0\)/ })).toBeVisible()

  await page.getByRole('button', { name: 'إغلاق سلة المهملات' }).click()
  await expect(expenseCard(page, 'تذاكر متحف')).toBeVisible()
})
