// 🆕 سجلّ المصاريف يُقصّ إلى آخر 10 مصاريف كي لا يدفع «أرصدة المسافرين» إلى
// قاع صفحة تطول مع كل مصروف (شكوى صاحب الحساب: صعوبة الوصول لتسجيل إيداع).
// الاختبار الوحدوي لا يرى الصفوف (react-virtuoso لا يرسم في jsdom)، فالمُثبَت
// هنا هو الأثر الفعلي في المتصفح: موضع قسم المسافرين قبل «عرض الكل» وبعده.
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsMember } from './utils/flows'

const CREDS = {
  tripId: 'e2e-recent-expenses-limit',
  memberEmail: 'e2e-recent-expenses-limit@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-recent-expenses-limit-admin@test.local',
  adminPassword: 'E2eTestPass!1',
}

// ⚠️ تسلسلي لا متوازٍ: seedTrip في beforeAll يمحو الرحلة ويعيد إنشاءها، وbeforeAll
// يعمل مرة لكل عامل — فاختبار يقع على عامل آخر (fullyParallel) يمحو بيانات
// اختبار يعمل الآن. رُصد في settlement-record: «منى» اختفت بين إضافتها وأول
// مصروف. انظر long-term-rollover.spec.ts للحالة الأولى.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await seedTrip(CREDS)
  const base = adminFirestore().collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')
  for (let i = 1; i <= 3; i++) {
    await base.collection('travelers').doc(String(i)).set({
      id: i, name: `مسافر ${i}`, shortName: `م${i}`, deposited: 1000, deletedAt: null,
    })
  }
  for (let i = 1; i <= 25; i++) {
    await base.collection('expenses').doc(String(i)).set({
      id: String(i), date: '2026-08-01', description: `مصروف رقم ${i}`,
      amount: 50, originalAmount: 50, currency: 'SAR', exchangeRate: 1,
      participants: [1, 2, 3], createdAt: Date.now() + i, category: 'أخرى', deletedAt: null,
    })
  }
})

const travelersTop = (page: import('@playwright/test').Page) =>
  page.locator('#travelers-section').evaluate(el => el.getBoundingClientRect().top + window.scrollY)

// ⚠️ لا click() مباشرة: Playwright يمرّر العنصر إلى حافة الشاشة بالضبط، فيغطّيه
// الهيدر الملتصق أعلاها أو شريط الإدخال السريع الثابت أسفلها، ويعيد المحاولة
// في الموضع نفسه حتى المهلة. المستخدم يرى الزرّ في منتصف الشاشة، فهكذا نضعه.
async function clickCentered(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
  await locator.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400) // استقرار تعويض react-virtuoso وطيّ الهيدر
  await locator.click()
}

test('السجلّ الطويل يُقصّ فيبقى المسافرون قريبين، و«عرض الكل» يعيد القائمة كاملة', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openTripAsMember(page, CREDS)
  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()

  const showAll = page.getByRole('button', { name: /عرض كل المصاريف \(25\)/ })
  await expect(showAll).toBeVisible()
  const collapsedTop = await travelersTop(page)

  await clickCentered(page, showAll)
  await expect(page.getByRole('button', { name: /عرض أقل/ })).toBeVisible()
  // 15 صفّاً إضافياً على الأقل (كل صفّ أطول من 40px بكثير).
  await expect.poll(() => travelersTop(page)).toBeGreaterThan(collapsedTop + 15 * 40)

  await clickCentered(page, page.getByRole('button', { name: /عرض أقل/ }))
  await expect(showAll).toBeVisible()
  // هامش 100px لا صفر: الهيدر الملتصق يغيّر ارتفاعه مع التمرير، وreact-virtuoso
  // يعيد قياس الصفوف — فرق عشرات البكسلات لا يعني شيئاً، أما 15 صفّاً فمئات.
  await expect.poll(() => travelersTop(page)).toBeLessThan(collapsedTop + 100)
})

test('البحث يتجاوز القصّ', async ({ page }) => {
  await openTripAsMember(page, CREDS)
  await page.getByPlaceholder('بحث بالوصف أو المشارك...').fill('مصروف')
  await expect(page.getByText('25 من 25 مصروف')).toBeVisible()
  await expect(page.getByRole('button', { name: /عرض كل المصاريف/ })).toHaveCount(0)
})
