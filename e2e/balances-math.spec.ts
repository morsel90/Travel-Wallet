// 🔴 يتحقق أن حساب الأرصدة والتسويات صحيح فعلياً عبر الواجهة الحقيقية (إدخال
// مصروفين بمشاركين مختلفين لكل منهما) — لا عبر استدعاء دوال utils/calculations
// مباشرة كما تفعل اختبارات الوحدة (calculations.test.ts). هذا يضمن أن اختيار/
// إلغاء اختيار المشاركين في النموذج يصل فعلياً لنفس الأرقام التي تنتجها الدوال
// النقية، لا أن يُصادف توافقاً في اختبار الوحدة وحده.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense } from './utils/flows'

const CREDS = {
  tripId: 'e2e-balances-math',
  pin: '112233',
  adminEmail: 'e2e-admin-balances@test.local',
  adminPassword: 'E2eTestPass!1',
}

// منى (600) وخالد (300) وفيصل (0) — مصروف أول يشمل الثلاثة، ومصروف ثانٍ
// يستثني فيصل عمداً، لينتج له رصيد سالب يتطلّب تسوية فعلية.
test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('حساب الأرصدة والتسوية صحيح عبر عدة مصاريف بمشاركين مختلفين', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  await addTraveler(page, 'منى الدوسري', '600')
  await addTraveler(page, 'خالد العتيبي', '300')
  await addTraveler(page, 'فيصل الشمري', '0')

  // مصروف 1: 300 على الثلاثة (افتراضياً كلهم محددون) → 100 لكل شخص
  await addExpense(page, { amount: '300', description: 'إيجار سيارة' })

  // مصروف 2: 90 على منى وخالد فقط (استبعاد فيصل) → 45 لكل منهما
  await addExpense(page, { amount: '90', description: 'وقود', deselectParticipants: ['فيصل'] })

  const monaCard  = page.locator('div.group').filter({ hasText: 'منى الدوسري' })
  const khaledCard = page.locator('div.group').filter({ hasText: 'خالد العتيبي' })
  const faisalCard = page.locator('div.group').filter({ hasText: 'فيصل الشمري' })

  // منى: 600 - (100+45) = 455 | خالد: 300 - (100+45) = 155 | فيصل: 0 - 100 = -100
  await expect(monaCard.getByText('455.00', { exact: true })).toBeVisible()
  await expect(khaledCard.getByText('155.00', { exact: true })).toBeVisible()
  await expect(faisalCard.getByText('-100.00', { exact: true })).toBeVisible()

  // التسوية: فيصل (أكبر مدين) يدفع لمنى (أكبر دائن) 100 بالضبط
  const settlementsPanel = page.locator('section', { hasText: 'ملخص وإحصائيات الرحلة' })
  await expect(settlementsPanel).toContainText('فيصل')
  await expect(settlementsPanel).toContainText('منى')
  await expect(settlementsPanel).toContainText('100.00')
})
