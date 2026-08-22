// 🔴 انحدار حقيقي رُصد من المستخدم: نموذج المصروف كان يُرسَم داخل تدفّق الصفحة
// (App.tsx) بدل نافذة ثابتة الموضع، فيظهر خارج نطاق الرؤية بعد فتحه من
// SmartInputBar إن كان المستخدم قد مرّر الصفحة لأسفل بشدة أولاً (قائمة مصاريف
// طويلة) — يضطر عندها للتمرير يدوياً بحثاً عن النموذج. أُصلح بتحويل ExpenseForm
// إلى Modal (Bottom Sheet)، وهو ما يختبره هذا الملف فعلياً — لا افتراضاً
// (القاعدة ١٨). انظر docs/DECISIONS.md.
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsMember } from './utils/flows'

const CREDS = {
  tripId: 'e2e-expense-form-scroll',
  memberEmail: 'e2e-expense-form-scroll@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-expense-form-scroll-admin@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
  // ⚠️ قائمة طويلة عمداً — إعادة إنتاج الانحدار الفعلي يحتاج صفحة أطول من
  // الشاشة بكثير، وإلا كان أي موضع (ثابت أو داخل التدفّق) سيبدو ظاهراً بالصدفة.
  const base = adminFirestore().collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')
  for (let i = 1; i <= 6; i++) {
    await base.collection('travelers').doc(String(i)).set({
      id: i, name: `مسافر ${i}`, shortName: `م${i}`, deposited: 1000, deletedAt: null,
    })
  }
  for (let i = 1; i <= 25; i++) {
    await base.collection('expenses').doc(String(i)).set({
      id: String(i), date: '2026-08-01', description: `مصروف رقم ${i}`,
      amount: 50, originalAmount: 50, currency: 'SAR', exchangeRate: 1,
      participants: [1, 2, 3, 4, 5, 6], createdAt: Date.now(), category: 'أخرى', deletedAt: null,
    })
  }
})

test('نموذج المصروف يظهر داخل نطاق الرؤية بعد التوسّع من SmartInputBar، حتى بعد تمرير طويل لأسفل', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openTripAsMember(page, CREDS)
  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()

  // تمرير طويل لأسفل — يحاكي مستخدماً يستعرض قائمة مصاريف طويلة قبل أن يفتح النموذج.
  await page.mouse.wheel(0, 6000)
  await page.waitForTimeout(300)

  await page.getByTitle('إضافة تفاصيل').click()

  // الفحص الحقيقي (لا وجود العنصر في DOM فقط): حقل "المبلغ" داخل نطاق الرؤية فعلياً.
  const amountInput = page.getByLabel('المبلغ')
  await expect(amountInput).toBeVisible()
  const isInViewport = await amountInput.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  })
  expect(isInViewport).toBe(true)
})
