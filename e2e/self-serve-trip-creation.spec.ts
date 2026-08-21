// 🔴 نموذج واتساب: أي حساب حقيقي مسجّل دخوله — لا المسؤول فقط — يستطيع إنشاء
// رحلة جديدة بنفسه ويصبح منظّمها تلقائياً. انظر السياق الكامل في
// functions/index.js (manageTrip mode: 'create') وfirestore.rules (users/{uid}).
//
// هذا اختبار انحدار للتغيير المعماري نفسه: قبل هذه الميزة كان الإنشاء حصراً
// للمسؤول (firestore.rules: "الإنشاء يبقى للمسؤول العالمي حصراً")، وTripPicker
// لم يعرض أي مسار انضمام ذاتي على الإطلاق. الحساب هنا يبدأ من نقطة الصفر
// الحقيقية — بلا أي عضوية ممنوحة مسبقاً كاختصار (seedBareUser، لا seedTrip).
import { test, expect } from '@playwright/test'
import { seedBareUser } from './utils/seed'
import { signInWithEmail } from './utils/flows'

const CREDS = {
  email: 'e2e-self-serve-creator@test.local',
  password: 'E2eTestPass!1',
}
const TRIP_ID = 'e2e-self-serve-trip'
const TRIP_NAME = 'رحلة أنشأها عضو بنفسه'

test.beforeAll(async () => {
  await seedBareUser(CREDS.email, CREDS.password)
})

test('عضو بلا أي رحلة سابقة يُنشئ رحلته الخاصة من «رحلاتي» ويصبح منظّمها فوراً', async ({ page }) => {
  // ── فتح التطبيق مجرّداً — لا `?trip=` ولا أي عضوية سابقة ─────────────────
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  // بلا أي رحلة، «رحلاتي» تعرض حالة "لم تنضم بعد" مع دعوة للإنشاء الذاتي —
  // لا مطالبة برابط دعوة فقط كما كان الحال قبل هذه الميزة.
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()
  await expect(page.getByText('لم تنضم لأي رحلة بعد')).toBeVisible()

  await page.getByRole('button', { name: 'إنشاء رحلة جديدة' }).click()

  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill(TRIP_NAME)
  await page.getByLabel('اسم البنك').fill('بنك الاختبار')
  await page.getByLabel('اسم المستفيد').fill('منشئ الرحلة')
  await page.getByLabel('رقم الآيبان (IBAN)').fill('SA0000000000000000000000')
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()

  // النجاح ينقله مباشرة لرحلته الجديدة — بلا خطوة إضافية للضغط عليها من القائمة.
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()

  // ── يظهر كمنظّم فوراً: زرّ إدارة الرحلة ظاهر بلا أي تدخّل من مسؤول ────────
  await expect(page.getByRole('button', { name: 'إدارة الرحلة' })).toBeVisible()
  await page.getByRole('button', { name: 'إدارة الرحلة' }).click()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): تبويبات المسؤول العالمي غائبة تماماً من
  // الـ DOM، لا مجرّد معطّلة أو غير ظاهرة بالخطأ — نفس ما يتحقق منه
  // organizer-role.spec.ts لمنظّم عُيِّن يدوياً من مسؤول.
  await expect(page.getByRole('button', { name: 'حذف الرحلة' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'نسخة احتياطية' })).not.toBeVisible()

  // بيانات البنك التي أدخلها عند الإنشاء وصلت فعلاً إلى مستند الرحلة — لا
  // فُقدت بين نموذج الإنشاء والكتابة الخادمية في manageTrip.
  await expect(page.getByLabel('اسم البنك')).toHaveValue('بنك الاختبار')
  await expect(page.getByLabel('اسم المستفيد')).toHaveValue('منشئ الرحلة')

  // ── يعدّل بيانات رحلته فعلاً — نفس صلاحية منظّم عُيِّن يدوياً ─────────────
  const nameInput = page.getByLabel('اسم الرحلة')
  await nameInput.fill('اسم عدّله المنظّم بعد الإنشاء')
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click()
  await expect(page.getByText('تم حفظ اسم الرحلة')).toBeVisible()
})
