// 🔴 انحدار حقيقي رصده المستخدم على آيفون حقيقي: بعد توسيع قسم "خيارات
// التقسيم" في ExpenseForm (بطاقات مسافرين + تخصيص حصص)، تعذّر التمرير لأسفل
// لرؤية بقية الخيارات وزر الاعتماد. السبب: Modal.tsx كان يُطبِّق drag="y"
// على لوحة النافذة كاملة (لإتاحة السحب-للإغلاق)، وهذا يتعارض مع overflow-y-auto
// لمحتواها — framer-motion يعترض أي سحب رأسي في أي مكان من اللوحة (لا فقط
// المقبض) كإيماءة "سحب النافذة"، فيمنع التمرير الطبيعي لمحتواها. أُصلح بحصر
// بدء السحب على المقبض العلوي وحده (dragListener={false} + dragControls) —
// انظر Modal.tsx وdocs/DECISIONS.md.
import { test, expect, devices } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsMember } from './utils/flows'

// ⚠️ لمسة حقيقية لا سحب فأرة — Playwright يُرسِل أحداث page.mouse كأحداث لمس
// حين تحمل السياق hasTouch: true (كما في هذا الجهاز الوهمي)، وهذا ما يجعل
// اختبار سلوك التمرير باللمس (المصدر الفعلي للانحدار المُبلَّغ) موثوقاً هنا؛
// بلا hasTouch، لن يُحرِّك أي سحب بالفأرة تمريراً حقيقياً للمحتوى إطلاقاً —
// السحب بالفأرة وحده لا يُمرِّر عنصراً بـ overflow-y-auto في المتصفح أصلاً.
// ⚠️ Pixel 5 لا iPhone 13 — الأخير يفرض محرّك WebKit (غير مثبَّت في هذه
// البيئة، Chromium فقط)، بينما أجهزة Android الوهمية في Playwright تستخدم
// Chromium افتراضياً مع نفس خصائص اللمس/المحاكاة المطلوبة هنا.
test.use({ ...devices['Pixel 5'] })

const CREDS = {
  tripId: 'e2e-modal-scroll',
  memberEmail: 'e2e-modal-scroll-member@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-modal-scroll-admin@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
  // ⚠️ 6 مسافرين — يكفي مع توسيع "تخصيص التقسيم" لدفع محتوى النافذة إلى ما
  // بعد ارتفاع الشاشة، وهو الشرط اللازم لإعادة إنتاج الانحدار أصلاً.
  const base = adminFirestore().collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')
  for (let i = 1; i <= 6; i++) {
    await base.collection('travelers').doc(String(i)).set({
      id: i, name: `مسافر ${i}`, shortName: `م${i}`, deposited: 100, deletedAt: null,
    })
  }
})

test('يمكن تمرير محتوى النافذة عند تجاوزه الشاشة — سحب المحتوى لا يُفسَّر كسحب لإغلاق النافذة', async ({ page }) => {
  await openTripAsMember(page, CREDS)
  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()

  await page.getByTitle('إضافة تفاصيل').click()
  const dialog = page.getByRole('dialog', { name: 'تفاصيل المصروف' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(600) // استقرار حركة الدخول (spring) — انظر flows.ts
  await page.getByLabel('المبلغ').fill('50')
  await page.getByLabel('الوصف').fill('اختبار')

  await page.getByRole('button', { name: 'خيارات التقسيم', exact: true }).click()
  await expect(page.getByRole('button', { name: 'تخصيص التقسيم بنسب مختلفة؟' })).toBeVisible()
  await page.getByRole('button', { name: 'تخصيص التقسيم بنسب مختلفة؟' }).click()

  // ⚠️ زر "اعتماد المصروف" sticky bottom-0 عمداً (يبقى ظاهراً دائماً)، فلا
  // يصلح مؤشراً على تجاوز المحتوى للشاشة — القياس المباشر لـ scrollHeight
  // مقابل clientHeight للوحة نفسها هو الدليل الحقيقي على وجود ما يستحق التمرير.
  const { scrollHeight, clientHeight, scrollTopBefore } = await dialog.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTopBefore: el.scrollTop,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight) // يتجاوز المحتوى ارتفاع اللوحة فعلاً — يثبت أن الشرط تحقّق
  expect(scrollTopBefore).toBe(0)

  // ⚠️ السحب يبدأ من نقطة داخل المحتوى (منتصف بطاقات المسافرين) — لا من
  // المقبض أعلى النافذة — بالضبط الإيماءة التي كانت تُغلق/تُحرّك اللوحة بدل
  // تمرير محتواها قبل الإصلاح. أحداث لمس أولية عبر CDP مباشرة (لا page.mouse
  // المُترجَمة) — أوثق تمثيلاً لسحب إصبع حقيقي مما تنجح معه محاكاة Chromium
  // لتمرير عنصر overflow-y-auto فعلياً.
  const dialogBox = await dialog.boundingBox()
  const startX = dialogBox!.x + dialogBox!.width / 2
  const startY = dialogBox!.y + 300
  const cdp = await page.context().newCDPSession(page)
  const touchPoint = (x: number, y: number) => [{ x, y, radiusX: 5, radiusY: 5, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(startX, startY) })
  for (let i = 1; i <= 10; i++) {
    const y = startY - (400 * i) / 10
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(startX, y) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  // النافذة نفسها لم تُغلَق ولم تتحرّك كسحب-للرفض — لا تزال مفتوحة.
  await expect(dialog).toBeVisible()

  // والأهم: المحتوى تمرَّر فعلاً (scrollTop تحرّك) لا اللوحة نفسها.
  const scrollTopAfter = await dialog.evaluate((el) => el.scrollTop)
  expect(scrollTopAfter).toBeGreaterThan(0)
})
