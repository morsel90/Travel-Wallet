// 🔴 AuthGate: الحارس الوحيد المتبقي بعد إلغاء رمز الرحلة والجلسات المجهولة
// (docs/DECISIONS.md) — يغطي أربع حالات لا يغطيها أي اختبار آخر:
//   ١. زائر بلا جلسة يفتح رابط دعوة يرى بوابة تسجيل الدخول فوراً، لا شاشة
//      "جارٍ الانضمام..." معلّقة للأبد (ترتيب المسارات الحرج في App.tsx —
//      AuthGate يُفحص قبل invite.status لهذا السبب بالذات).
//   ٢. حساب جديد يُنشأ عبر البريد الإلكتروني برابط دعوة غير صالح يرى رسالة
//      خطأ واضحة، لا انضماماً صامتاً.
//   ٣. حساب موجود يسجّل دخوله عبر البريد وكلمة المرور فيصل مباشرة لرحلته.
//   ٤. حساب مسجَّل دخوله لكنه ليس عضواً في رحلة بعينها يرى شاشة "لست عضواً"،
//      لا حلقة إعادة محاولة (لا رمز رحلة يمكنه تجربته بعد الآن).
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'

const CREDS = {
  tripId: 'e2e-auth-gate',
  memberEmail: 'e2e-auth-gate-member@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-auth-gate-admin@test.local', // غير مستخدَم في هذا الملف، لكن seedTrip يتطلبه
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('زائر بلا جلسة يفتح رابط دعوة يرى بوابة تسجيل الدخول فوراً — لا شاشة انضمام معلّقة', async ({ page }) => {
  await page.goto('/?invite=e2e-nonexistent-invite-token-000000')

  await expect(page.getByRole('heading', { name: 'أهلاً بك في الرحلة' })).toBeVisible()
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).toBeVisible()
  await expect(page.getByText('جارٍ الانضمام')).not.toBeVisible()
})

test('حساب جديد عبر رابط دعوة غير صالح: يُنشئ حسابه أولاً ثم يرى رسالة الخطأ بدل انضمام صامت', async ({ page }) => {
  await page.goto('/?invite=e2e-nonexistent-invite-token-111111')
  await expect(page.getByRole('heading', { name: 'أهلاً بك في الرحلة' })).toBeVisible()

  await page.getByText('أو عبر البريد الإلكتروني').click()
  await page.getByPlaceholder('البريد الإلكتروني').fill('e2e-auth-gate-new@test.local')
  await page.getByPlaceholder('كلمة المرور').fill('E2eTestPass!1')
  await page.getByRole('button', { name: 'حساب جديد؟ أنشئ حساباً' }).click()
  await page.getByRole('button', { name: 'إنشاء حساب' }).click()

  // التوكن غير موجود — رسالة خطأ واضحة (permission-denied → describeInviteError)،
  // لا وصول مُمنوح خطأً ولا سطر عضوية أُنشئ بالخطأ.
  await expect(page.getByText('رابط الدعوة غير صالح أو أُبطل')).toBeVisible({ timeout: 10_000 })
})

test('عضو موجود يسجّل الدخول عبر البريد وكلمة المرور فيصل مباشرة لرحلته', async ({ page }) => {
  await page.goto(`/?trip=${CREDS.tripId}`)
  await expect(page.getByRole('heading', { name: 'سجّل الدخول لمتابعة' })).toBeVisible()

  await page.getByText('أو عبر البريد الإلكتروني').click()
  await page.getByPlaceholder('البريد الإلكتروني').fill(CREDS.memberEmail)
  await page.getByPlaceholder('كلمة المرور').fill(CREDS.memberPassword)
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click()

  await expect(page.getByText('أرصدة المسافرين')).toBeVisible()
})

test('حساب مسجَّل دخوله لكنه ليس عضواً في هذه الرحلة يرى شاشة "لست عضواً" لا حلقة إعادة محاولة', async ({ page }) => {
  await page.goto(`/?trip=${CREDS.tripId}`)
  await page.getByText('أو عبر البريد الإلكتروني').click()
  await page.getByPlaceholder('البريد الإلكتروني').fill('e2e-auth-gate-outsider@test.local')
  await page.getByPlaceholder('كلمة المرور').fill('E2eTestPass!1')
  await page.getByRole('button', { name: 'حساب جديد؟ أنشئ حساباً' }).click()
  await page.getByRole('button', { name: 'إنشاء حساب' }).click()

  await expect(page.getByRole('heading', { name: 'لست عضواً في هذه الرحلة' })).toBeVisible()
})
