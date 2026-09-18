// 🔴 التحويل يُسجَّل في الدفتر فعلاً — لا تأشيراً على الشاشة.
//
// العطل الذي أوجد هذا الاختبار: «تحديد كمُحوَّل» كان يكتب في useState محلي، فكان
// السطر يُظلَّل ويُقرأ «تم التحويل ✓» والدفتر لا يعرف عنه شيئاً — يزول بإعادة
// التحميل ولا يراه جهاز آخر. ولهذا لا يكفي هنا فحص اختفاء البطاقة: الاختبار
// يُعيد تحميل الصفحة (قراءة جديدة من الخادم) ويفحص الأرصدة نفسها بعدها.
//
// ⚠️ والفحص الأهم هو الثابت المحاسبي: التحويل **ينقل** ولا يضيف — «الرصيد» في
// الهيدر (مجموع المُودَع ناقص المصروف) هو 300 قبل التحويل وبعده. لو كُتبت الحركة
// في طرف واحد — إيداع للمَدين بلا خصم من الدائن، وهو أسهل خطأ يُرتكب هنا —
// لاختفت البطاقة ولبدت أرصدة الأفراد سليمة، ولانكشف الخلل في هذا المجموع وحده.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense } from './utils/flows'

const CREDS = {
  tripId: 'e2e-settlement-record',
  memberEmail: 'e2e-member-settle@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-settle@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('تسجيل التحويل يُصفّي الرصيدَين ويبقى بعد إعادة التحميل', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  await addTraveler(page, 'منى الدوسري', '600')
  await addTraveler(page, 'فيصل الشمري', '100')

  // 400 على الاثنين → 200 لكل منهما. منى: 600−200 = +400، فيصل: 100−200 = −100.
  await addExpense(page, { amount: '400', description: 'إيجار شقة' })

  const settlementsPanel = page.locator('#settlements-section')
  const monaCard = page.locator('div.group').filter({ hasText: 'منى الدوسري' })
  const faisalCard = page.locator('div.group').filter({ hasText: 'فيصل الشمري' })

  await expect(monaCard.getByText('400.00', { exact: true })).toBeVisible()
  await expect(faisalCard.getByText('-100.00', { exact: true })).toBeVisible()
  await expect(settlementsPanel).toContainText('100.00')
  // المجموع قبل التحويل — 700 مُودَع ناقص 400 مصروف.
  await expect(page.getByText('الرصيد 300.00 ﷼')).toBeVisible()

  // ── التسجيل: نقرة تكشف التأكيد، والتأكيد وحده يكتب ───────────────────────
  await settlementsPanel.getByRole('button', { name: 'تسجيل التحويل' }).click()
  await settlementsPanel.getByRole('button', { name: /تأكيد تسجيل 100\.00/ }).click()

  // التسوية تختفي لأن الرصيدَين صارا صحيحَين — لا لأن أحداً أشّر عليها.
  await expect(settlementsPanel).toContainText('الحسابات مصفّاة')

  // ── وبعد إعادة التحميل: نفس الأرقام، من الخادم لا من حالة الصفحة ─────────
  await page.reload()
  await expect(page.locator('#settlements-section')).toContainText('الحسابات مصفّاة')

  // فيصل: أودع 100+100 = 200، ونصيبه 200 → صفر. منى: 600−100 = 500، ونصيبها 200 → 300.
  await expect(page.locator('div.group').filter({ hasText: 'فيصل الشمري' })
    .getByText('0.00', { exact: true })).toBeVisible()
  await expect(page.locator('div.group').filter({ hasText: 'منى الدوسري' })
    .getByText('300.00', { exact: true })).toBeVisible()

  // ولم يدخل الدفتر ريال واحد ولم يخرج منه: نفس المجموع قبل التحويل.
  await expect(page.getByText('الرصيد 300.00 ﷼')).toBeVisible()
})
