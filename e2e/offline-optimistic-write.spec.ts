// 🔴 يتحقق من الضمان المعماري الأهم الموثّق في CLAUDE.md (قسم Design Decisions
// — "Optimistic updates roll back automatically"): كتابة أثناء انقطاع الاتصال
// تظهر فوراً في الواجهة بشارة "جاري الحفظ" (مشتقة من hasPendingWrites)، ثم
// تُزامَن تلقائياً وتختفي الشارة بمجرد عودة الاتصال — دون أي إجراء يدوي من
// المستخدم أو أي طابور إعادة محاولة مبني فوق طابور Firestore نفسه.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense, expenseCard } from './utils/flows'

const CREDS = {
  tripId: 'e2e-offline-write',
  pin: '998877',
  adminEmail: 'e2e-admin-offline@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('مصروف يُضاف أثناء انقطاع الاتصال يظهر فوراً كـ"معلّق" ثم يُزامَن تلقائياً عند عودة الاتصال', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)
  await addTraveler(page, 'ليان الحربي', '250')

  // ── قطع الاتصال ──────────────────────────────────────────────────────────
  await page.context().setOffline(true)
  await expect(page.getByText('أنت غير متصل بالإنترنت حالياً')).toBeVisible()

  await addExpense(page, { amount: '60', description: 'وجبة خفيفة' })

  const card = expenseCard(page, 'وجبة خفيفة')
  // يظهر فوراً في الواجهة رغم انقطاع الاتصال — تحديث متفائل من الكاش المحلي
  await expect(card).toBeVisible()
  await expect(card).toContainText('جاري الحفظ')

  // ── عودة الاتصال ─────────────────────────────────────────────────────────
  await page.context().setOffline(false)
  await expect(page.getByText('أنت غير متصل بالإنترنت حالياً')).not.toBeVisible()

  // تُزامَن الكتابة تلقائياً وتختفي شارة "جاري الحفظ" — بلا أي إجراء من المستخدم
  await expect(card.getByText('جاري الحفظ')).not.toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText('60.00')
})
