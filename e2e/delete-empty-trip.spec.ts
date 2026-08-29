// 🔴 انحدار حقيقي رُصد في الإنتاج (لا افتراضي، على مرحلتين): حذف رحلة يتطلب
// خلوّها من بيانات مالية حقيقية — لكن منذ أن صار كل إنشاء رحلة (ذاتي أو من
// لوحة الإدارة) يُزوِّد منظّمها بملف مسافر فوراً (provisionTravelerForUid في
// manageTrip)، صار كل مسافر واحد على الأقل موجوداً منذ لحظة الإنشاء دائماً.
// معاملة "أي مسافر/مصروف موجود" كرفض — سلوك الحذف الأصلي — كانت تُبطل ميزة
// حذف الرحلة بالكامل على أي رحلة جديدة:
//   ١. مسؤول حذف نفسه من قائمة المسافرين (حذفاً ليّناً، الوحيد المتاح) ففوجئ
//      برفض حذف رحلته رغم أنها "فارغة" ظاهرياً — المسافر المزوَّد تلقائياً
//      كان لا يزال يُعامَل كموجود حتى بالسلة.
//   ٢. الإصلاح الأول عالج المسافرين لكن عامل المصروفات معاملة مختلفة بلا
//      مبرر (أي مصروف — حتى بالسلة — كان يرفض دائماً)، فسجّل المستخدم مصروفاً
//      اختبارياً واحداً وحذفه، وبقي الرفض قائماً رغم أن الرحلة فارغة فعلياً.
// انظر functions/index.js: checkTripHasProtectedData وdocs/DECISIONS.md.
//
// حذف رحلة مسؤول-فقط (manageTrip mode:'delete' يرفض غير المسؤول) — لذا هذا
// الاختبار يبدأ من حساب مسؤول عالمي بلا رحلة سابقة (seedBareAdmin)، لا عضواً
// عادياً كبقية سيناريوهات الإنشاء الذاتي.
import { test, expect } from '@playwright/test'
import { seedBareAdmin } from './utils/seed'
import { signInWithEmail, addExpense, expenseCard, openTripDetailFromHeader, tripRowInPicker } from './utils/flows'

const CREDS = {
  email: 'e2e-delete-empty-trip-admin@test.local',
  password: 'E2eTestPass!1',
}
const TRIP_ID = 'e2e-delete-empty-trip'
const TRIP_NAME = 'رحلة للحذف'

test.beforeAll(async () => {
  await seedBareAdmin(CREDS.email, CREDS.password)
})

test('مسؤول يحذف مصروفاً ونفسه من مسافري رحلة أنشأها، ثم يستطيع حذف الرحلة الفارغة فعلياً', async ({ page }) => {
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  // ── ينشئ رحلة من شاشة «رحلاتي» — نفس مسار الإنشاء الذاتي، متاح للمسؤول أيضاً.
  // exact: true يتجنّب تطابقاً جزئياً مع زرّ الحالة الفارغة "إنشاء رحلة جديدة"
  // (يحوي "رحلة جديدة" كجزء من نصّه). ─────────────────────────────────────
  await page.getByRole('button', { name: 'رحلة جديدة', exact: true }).click()
  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill(TRIP_NAME)
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))

  // ── محاولة حذف مبكرة: المسافر المُزوَّد تلقائياً للمنظّم (المسؤول نفسه) لا
  // يزال نشِطاً، فيُرفض الحذف — هذا السلوك يجب أن يبقى كما هو (حماية بيانات
  // حقيقية). 🆕 التعديل يُفتح الآن بالضغط على اسم الرحلة في الهيدر (EditTripModal)
  // لا من «رحلاتي» — انظر docs/DECISIONS.md. ─────────────────────────────────
  await openTripDetailFromHeader(page)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()
  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(TRIP_ID)
  await page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click()
  await expect(page.getByText(/لأنها تحوي مسافرين أو مصاريف/)).toBeVisible()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): الرحلة لم تُحذف فعلاً، لا تزال قابلة للإدارة.
  //
  // 🆕 التحديد بهيدر المودال تحديداً: هيدر التطبيق صار يعرض اسم الرحلة المفتوحة
  // في <h1> أيضاً (ورقة الرحلة)، فاسم الرحلة وحده يطابق عنوانين. هيدر المودال
  // هو الوحيد الذي يعرض *معرّف* الرحلة تحت اسمها.
  await expect(
    page.locator('header').filter({ hasText: TRIP_ID }).getByRole('heading', { name: TRIP_NAME }),
  ).toBeVisible()
  // 🆕 إغلاق المودال بلا حذف — يعيد لنفس شاشة الرحلة (لا تنقّل، مجرّد إغلاق).
  await page.getByRole('button', { name: 'إغلاق تعديل الرحلة' }).click()

  // ── يسجّل مصروفاً اختبارياً ثم يحذفه — حذفاً ليّناً كالمعتاد. هذا وحده كان
  // كافياً (المرحلة ٢ من الانحدار) لإبقاء حذف الرحلة مرفوضاً حتى بعد تفريغ
  // قائمة المسافرين تماماً، رغم أن الرحلة فارغة فعلياً من أي بيانات نشِطة. ────
  await addExpense(page, { amount: '50', description: 'طماطم' })
  const card = expenseCard(page, 'طماطم')
  await card.hover()
  await card.getByRole('button', { name: 'حذف المصروف' }).click()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()
  await expect(expenseCard(page, 'طماطم')).not.toBeVisible()

  // ── يحذف نفسه من قائمة المسافرين — حذفاً ليّناً، الوحيد المتاح له ─────────
  await page.getByRole('button', { name: 'حذف المسافر' }).click()
  await expect(page.getByRole('heading', { name: /حذف .+؟/ })).toBeVisible()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()

  // ── إعادة المحاولة: لا مسافر نشِط ولا مصروف نشِط ولا سجلّ إيداع بعد الآن —
  // يجب أن تنجح، رغم بقاء المصروف والمسافر كمستندين في سلة المهملات. ────────
  await openTripDetailFromHeader(page)
  await page.getByRole('button', { name: 'حذف الرحلة' }).click()
  await page.getByLabel(/للتأكيد، اكتب معرّف الرحلة/).fill(TRIP_ID)

  // 🆕 حذف الرحلة *المفتوحة حالياً* يُعقبه توجيه كامل بلا `?trip=` (EditTripModal
  // onDeleted في App.tsx — معرّفها لم يعد صالحاً). ننتظر التوجيه والضغط معاً
  // بدل التحقّق من توست عابر قد يفوته سباق التنقّل (نمط Playwright الموصى به
  // لأي نقرة تُطلق تنقّلاً).
  await Promise.all([
    page.waitForURL(url => !url.searchParams.has('trip')),
    page.getByRole('button', { name: 'حذف الرحلة نهائياً' }).click(),
  ])

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): رحلتنا اختفت فعلاً من «رحلاتي» — لا
  // مجرّد توجيه ناجح بلا أثر حقيقي.
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()
  await expect(tripRowInPicker(page, TRIP_ID)).toHaveCount(0)
})
