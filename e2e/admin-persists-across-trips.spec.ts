// 🔴 وضع المسؤول يجب أن يصمد عبر إعادة تحميل الصفحة — والتبديل بين الرحلات
// إعادة تحميل كاملة (TRIP_ID يُقرأ مرة واحدة عند تحميل الوحدة، utils/tripId.ts).
//
// ⚠️ سجل تاريخي: كان هذا اختبار انحدار لخلل حقيقي — signInAnonymously كان
// يُستدعى بلا شرط عند كل تحميل، وسلوك Firebase أن إنشاء جلسة مجهولة بينما
// المستخدم الحالي غير مجهول يُحلّها محلّه، فيُطرد المسؤول من جلسته مع كل إعادة
// تحميل. لم يظهر الأثر عملياً إلا بعد إضافة التبديل بين الرحلات. بعد إلغاء PIN
// والجلسات المجهولة تماماً (docs/DECISIONS.md) لم يعد signInAnonymously موجوداً
// إطلاقاً في الكود، فهذا الخلل بعينه لم يعد ممكناً بنيوياً — لكن الاختبار يبقى
// كتغطية عامة لصمود جلسة تسجيل الدخول عبر إعادة التحميل والتنقّل بين الرحلات.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, openAccountMenu } from './utils/flows'

const CREDS = {
  tripId: 'e2e-admin-persist-a',
  memberEmail: 'e2e-member-persist@test.local', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-persist@test.local',
  adminPassword: 'E2eTestPass!1',
}

const SECOND_TRIP_ID = 'e2e-admin-persist-b'

test.beforeAll(async () => {
  await seedTrip(CREDS)
  // رحلة ثانية بنفس حساب المسؤول — لاختبار التبديل بينهما
  await seedTrip({ ...CREDS, tripId: SECOND_TRIP_ID })
})

test('وضع المسؤول يصمد عبر إعادة التحميل والتبديل بين الرحلات', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  // ── إعادة تحميل بسيطة لنفس الرحلة ────────────────────────────────────────
  await page.reload()
  await openAccountMenu(page)
  await expect(page.getByRole('menuitem', { name: 'رحلاتي' })).toBeVisible()
  await page.keyboard.press('Escape')

  // ── التبديل لرحلة أخرى (إعادة تحميل كاملة عبر ?trip=) ───────────────────
  await page.goto(`/?trip=${SECOND_TRIP_ID}`)
  await openAccountMenu(page)
  await expect(page.getByRole('menuitem', { name: 'رحلاتي' })).toBeVisible()
  await page.keyboard.press('Escape')
  // ولا يُطالَب بتسجيل دخول جديد إطلاقاً — الجلسة القائمة تكفي
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()

  // ── العودة للرحلة الأولى ─────────────────────────────────────────────────
  await page.goto(`/?trip=${CREDS.tripId}`)
  await openAccountMenu(page)
  await expect(page.getByRole('menuitem', { name: 'رحلاتي' })).toBeVisible()
})

test('الخروج من وضع المسؤول يُسجّل خروجاً كاملاً ويعيد بوابة تسجيل الدخول', async ({ page }) => {
  // ⚠️ لا جلسة "عضو عادي" تظهر بعد الخروج بعد الآن: openTripAsAdmin يسجّل
  // الدخول مباشرة بحساب المسؤول نفسه عبر AuthGate (لا جلسة مجهولة تحته يعود
  // إليها signOut — انظر تعليق handleAdminSignOut في useAdminAuth.ts). الخروج
  // إذاً خروج كامل من الحساب لا مجرّد تبديل دور. 🆕 "تسجيل الخروج" عنصر مستقل
  // الآن في AccountMenu، متاح بصرف النظر عن صلاحية admin — انظر docs/DECISIONS.md.
  await openTripAsAdmin(page, CREDS)

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click()
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).toBeVisible()
})
