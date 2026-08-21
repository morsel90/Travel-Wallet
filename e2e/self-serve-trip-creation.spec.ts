// 🔴 نموذج واتساب + مصدر موحّد لبيانات البنك: أي حساب حقيقي مسجّل دخوله — لا
// المسؤول فقط — يستطيع إنشاء رحلة جديدة بنفسه ويصبح منظّمها تلقائياً. انظر
// السياق الكامل في functions/index.js (manageTrip mode: 'create')،
// firestore.rules (users/{uid}: organizesSharedTrip)، وdocs/DECISIONS.md.
//
// هذا اختبار انحدار للتغيير المعماري نفسه: قبل هذه الميزة كان الإنشاء حصراً
// للمسؤول، وTripPicker لم يعرض أي مسار انضمام ذاتي على الإطلاق. الحساب هنا
// يبدأ من نقطة الصفر الحقيقية — بلا أي عضوية ممنوحة مسبقاً كاختصار
// (seedBareUser، لا seedTrip).
//
// 🆕 لا حقول بنك في نموذج الإنشاء بعد اليوم — بيانات البنك مصدرها الوحيد
// بروفايل المنظّم، تُقرأ حيّة في بطاقة التحويل. هذا الاختبار يملأ البروفايل
// *قبل* الإنشاء (وهذا هو المسار الحقيقي: TripPicker هي نقطة الدخول الوحيدة
// لتعديل البروفايل لعضو بلا أي رحلة بعد — Header/AccountMenu لا يُعرَضان قبل
// الانضمام لرحلة)، ثم يعدّله *بعد* الإنشاء للتحقّق من أن التعديل ينعكس فوراً
// على الرحلة بلا أي حفظ على مستند الرحلة نفسه — جوهر الميزة.
import { test, expect } from '@playwright/test'
import { seedBareUser } from './utils/seed'
import { signInWithEmail } from './utils/flows'

const CREDS = {
  email: 'e2e-self-serve-creator@test.local',
  password: 'E2eTestPass!1',
}
const TRIP_ID = 'e2e-self-serve-trip'
const TRIP_NAME = 'رحلة أنشأها عضو بنفسه'
const PROFILE_NAME = 'عبدالله المنظّم'

test.beforeAll(async () => {
  await seedBareUser(CREDS.email, CREDS.password)
})

test('عضو بلا أي رحلة سابقة يملأ بروفايله، يُنشئ رحلته الخاصة، وبيانات بنكه تظهر فيها حيّة', async ({ page }) => {
  // ── فتح التطبيق مجرّداً — لا `?trip=` ولا أي عضوية سابقة ─────────────────
  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)

  // بلا أي رحلة، «رحلاتي» تعرض حالة "لم تنضم بعد" مع دعوة للإنشاء الذاتي —
  // لا مطالبة برابط دعوة فقط كما كان الحال قبل هذه الميزة.
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()
  await expect(page.getByText('لم تنضم لأي رحلة بعد')).toBeVisible()

  // ── يملأ بروفايله *قبل* إنشاء أي رحلة — عبر زرّ «بروفايلي» في TripPicker
  // نفسها، النقطة الوحيدة المتاحة له الآن (لا Header بعد). يملأ اسمه أيضاً —
  // حساب بريد/كلمة مرور بلا اسم عرض مضبوط على Auth نفسه، فبروفايل التطبيق هو
  // المصدر الوحيد لاسم يظهر به كمسافر (انظر getProfileDisplayName في
  // functions/index.js). ─────────────────────────────────────────────────
  await page.getByRole('button', { name: 'بروفايلي' }).click()
  await page.getByLabel('اسمك').fill(PROFILE_NAME)
  await page.getByLabel('اسم البنك').fill('بنك الاختبار')
  await page.getByLabel('اسم المستفيد').fill('منشئ الرحلة')
  await page.getByLabel('رقم الآيبان (IBAN)').fill('SA0000000000000000000000')
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByRole('heading', { name: 'بروفايلي' })).not.toBeVisible()

  // ── ينشئ رحلة — لا حقول بنك في هذا النموذج بعد اليوم ─────────────────────
  await page.getByRole('button', { name: 'إنشاء رحلة جديدة' }).click()
  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill(TRIP_NAME)
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()

  // النجاح ينقله مباشرة لرحلته الجديدة — بلا خطوة إضافية للضغط عليها من القائمة.
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()

  // بطاقة التحويل تعرض بيانات بنكه — حيّة من بروفايله، لم تُنسَخ يدوياً عند
  // الإنشاء (لا حقل يتيح ذلك أصلاً الآن).
  await expect(page.getByText('بنك الاختبار')).toBeVisible()
  await expect(page.getByText('منشئ الرحلة')).toBeVisible()

  // ⚠️ ملف المسافر المُزوَّد تلقائياً يحمل اسم بروفايله لا الاسم الافتراضي
  // «مسافر جديد» — حساب بريد/كلمة مرور لا يملك اسم عرض على Auth نفسه، فلولا
  // قراءة getProfileDisplayName لسقط للاسم الافتراضي رغم أن البروفايل مُسمّى.
  await expect(page.getByText(PROFILE_NAME)).toBeVisible()
  await expect(page.getByText('مسافر جديد')).not.toBeVisible()

  // ── يظهر كمنظّم فوراً: زرّ إدارة الرحلة ظاهر بلا أي تدخّل من مسؤول ────────
  await expect(page.getByRole('button', { name: 'إدارة الرحلة' })).toBeVisible()
  await page.getByRole('button', { name: 'إدارة الرحلة' }).click()

  // ⚠️ تحقّق سلبي حقيقي (القاعدة ١٨): تبويبات المسؤول العالمي غائبة تماماً من
  // الـ DOM، لا مجرّد معطّلة أو غير ظاهرة بالخطأ.
  await expect(page.getByRole('button', { name: 'حذف الرحلة' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'نسخة احتياطية' })).not.toBeVisible()
  // ولا حقول بنك على الإطلاق داخل لوحة إدارة الرحلة — حُذفت من هذا التبويب.
  await expect(page.getByLabel('اسم البنك')).not.toBeVisible()

  // ── يعدّل اسم رحلته فعلاً — نفس صلاحية منظّم عُيِّن يدوياً ────────────────
  const nameInput = page.getByLabel('اسم الرحلة')
  await nameInput.fill('اسم عدّله المنظّم بعد الإنشاء')
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click()
  await expect(page.getByText('تم حفظ اسم الرحلة')).toBeVisible()
  await page.getByRole('button', { name: 'إغلاق إدارة الرحلات' }).click()

  // ── جوهر الميزة: يعدّل بروفايله (لا الرحلة) — عبر AccountMenu المتاحة الآن
  // بعد الانضمام لرحلة — والتغيير ينعكس على بطاقة التحويل فوراً، بلا أي حفظ
  // على مستند الرحلة نفسها. ──────────────────────────────────────────────
  await page.getByRole('button', { name: 'حسابي', exact: true }).click()
  await page.getByRole('menuitem', { name: 'بروفايلي' }).click()
  await page.getByLabel('اسم البنك').fill('بنك جديد بعد التعديل')
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByRole('heading', { name: 'بروفايلي' })).not.toBeVisible()

  await expect(page.getByText('بنك جديد بعد التعديل')).toBeVisible()
  await expect(page.getByText('بنك الاختبار')).not.toBeVisible()
})
