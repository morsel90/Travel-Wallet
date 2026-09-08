// 🆕 خلوص الشريط السفلي الثابت (SmartInputBar) من آخر محتوى الصفحة.
//
// ⚠️ العطل الذي أنشأ هذا الملف: حشو أسفل الصفحة كان `pb-20 md:pb-8` — أي أنه
// ينكمش من 80px إلى 32px عند عرض md فأكبر، بينما شريط الإدخال يبقى ثابتاً
// أسفل الشاشة عند **كل** عرض. النتيجة على 768×1024: آخر بطاقة مسافر تختفي
// 22 بكسل خلف الشريط. عطل قديم سابق لإعادة تصميم الشاشة (قِيس على الفرع
// الأساسي أيضاً)، ظهر أثناء معاينتها.
//
// ⚠️ أربعة عروض لا واحد: العطل كان محصوراً بنقطة انكسار واحدة (md)، فاختبار
// الجوال وحده كان سيبقى أخضر إلى الأبد. القاعدة ١٨.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense } from './utils/flows'

// ⚠️ رحلة (وحساب) لكل عرض على حدة: Playwright يوزّع هذه الاختبارات على عمّال
// متوازين، ومشاركتها رحلةً واحدة تجعل كلاً منها يضيف مسافراً/مصروفاً إلى نفس
// البيانات — فيتغيّر ارتفاع الصفحة تحت أقدام الآخر ويفشل القياس بلا سبب حقيقي.
const credsFor = (name: string) => ({
  tripId: `e2e-bottom-bar-${name}`,
  memberEmail: `e2e-member-bar-${name}@test.local`,
  memberPassword: 'E2eTestPass!1',
  adminEmail: `e2e-admin-bar-${name}@test.local`,
  adminPassword: 'E2eTestPass!1',
})

for (const vp of [{ width: 390, height: 844, name: 'mobile-390x844' },
                  { width: 360, height: 640, name: 'small-360x640' },
                  { width: 768, height: 1024, name: 'tablet-768x1024' },
                  { width: 1280, height: 800, name: 'desktop-1280x800' }]) {
  test(`آخر محتوى الصفحة لا يختفي خلف شريط الإدخال — ${vp.name}`, async ({ page }) => {
    const creds = credsFor(String(vp.width))
    await seedTrip(creds)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await openTripAsAdmin(page, creds)
    await addTraveler(page, `م${vp.width}`, '500')
    await addExpense(page, { amount: '120', description: `مصروف ${vp.width}` })
    await page.getByRole('button', { name: 'إغلاق شريط الترحيب' }).click().catch(() => {})
    // التمرير حتى القاع فعلاً: ارتفاع الصفحة يتغيّر بعد استقرار القائمة
    // الافتراضية، فنداء واحد قد يتوقّف قبل الحدّ الحقيقي.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(300)
    }

    const m = await page.evaluate(() => {
      const bar = document.querySelector('div.fixed.z-40') as HTMLElement | null
      const main = document.querySelector('main') as HTMLElement
      const last = main.lastElementChild as HTMLElement
      const barR = bar?.getBoundingClientRect()
      return {
        found: !!bar,
        barTop: barR ? Math.round(barR.top) : null,
        lastContentBottom: Math.round(last.getBoundingClientRect().bottom),
        scrollY: Math.round(window.scrollY),
        maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      }
    })
    const gap = m.barTop !== null ? m.barTop - m.lastContentBottom : null
    expect(m.found, 'شريط الإدخال السريع معروض').toBe(true)
    expect(m.scrollY, 'وصلنا قاع الصفحة فعلاً — وإلا فالقياس بلا معنى').toBe(m.maxScroll)
    expect(gap!, 'آخر محتوى الصفحة لا يختفي خلف الشريط الثابت').toBeGreaterThanOrEqual(0)
  })
}
