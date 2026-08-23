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

async function expectAmountFieldInViewport(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTitle('إضافة تفاصيل').click()
  const amountInput = page.getByLabel('المبلغ')
  await expect(amountInput).toBeVisible()

  // ⚠️ حركة الدخول (spring: damping 30, stiffness 300 في Modal.tsx) تحتاج وقتاً
  // لتستقرّ — فحص الموضع فوراً بعد toBeVisible() يلتقط إطاراً منتصف الحركة
  // (النافذة لا تزال تنزلق من y:100% نحو y:0)، لا موضعها النهائي. toBeVisible()
  // وحدها لا تنتظر استقرار الحركة، فقط أن العنصر ليس hidden/display:none.
  await page.waitForTimeout(600)

  const isInViewport = await amountInput.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  })
  expect(isInViewport).toBe(true)
  await page.getByRole('button', { name: 'إغلاق النموذج' }).click()
}

// ⚠️ اختباران، لا واحد — نقطتا تمرير مختلفتان عمداً: التمرير الطويل جداً وحده
// كان يُخفي انحداراً حقيقياً ثانياً (PullToRefresh.tsx: transform: translateY(0px)
// عند السكون يُنشئ containing block جديداً لأي position:fixed سليل، فتُحسَب
// النافذة نسبةً لصندوق الصفحة الطويل كاملاً لا نسبةً لإطار العرض الفعلي — تصادف
// أن التمرير حتى القاع كان يضع النافذة الموضوعة خطأً داخل نطاق الرؤية بالمصادفة
// رغم الخلل، فمرّ الاختبار الأول بسبب خاطئ لا صحيح). قمّة الصفحة تكشف هذا النوع
// من الأخطاء تحديداً: بلا القاعدة الصحيحة (position:fixed نسبةً لإطار العرض
// فعلاً)، ستكون النافذة بعيدة تماماً عن نطاق الرؤية عند القمة.
test('نموذج المصروف يظهر داخل نطاق الرؤية بعد التوسّع من SmartInputBar، عند قمة الصفحة', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openTripAsMember(page, CREDS)
  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()
  await expectAmountFieldInViewport(page)
})

test('نموذج المصروف يظهر داخل نطاق الرؤية بعد التوسّع من SmartInputBar، بعد تمرير طويل لأسفل', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openTripAsMember(page, CREDS)
  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()

  // تمرير طويل لأسفل — يحاكي مستخدماً يستعرض قائمة مصاريف طويلة قبل أن يفتح النموذج.
  await page.mouse.wheel(0, 6000)
  await page.waitForTimeout(300)

  await expectAmountFieldInViewport(page)
})
