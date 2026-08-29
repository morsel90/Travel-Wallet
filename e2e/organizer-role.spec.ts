// 🔴 المرحلة ٣ (docs/PLAN-member-management.md): دور «منظّم الرحلة» — يعبر
// جلستين منفصلتين حقيقيتين (عضو + مسؤول)، وهذا بالضبط ما تكشفه هذه الطبقة ولا
// يكشفه أي اختبار وحدة أو قواعد بمفرده: هل الواجهة تُظهر/تُخفي زرّ الإدارة عند
// اللحظة الصحيحة بعد أن يمنح المسؤول الدور من جلسة أخرى تماماً؟
//
// الحالة السالبة المقابلة (منظّم لا يزيل منظّماً آخر ولا المسؤول، ولا يعيّن
// أحداً) مُختبَرة بشكل مباشر وأدقّ ضد المحاكي الحقيقي عبر استدعاء
// manageMember.run() مباشرة (نفس أسلوب restoreTrip الموثّق في CLAUDE.md) — لا
// تكراراً هنا عبر عناصر واجهة.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, openTripAsMember, openAccountMenu, openTripDetailAsAdmin } from './utils/flows'

const CREDS = {
  tripId: 'e2e-organizer-role',
  memberEmail: 'e2e-organizer-role-member@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-organizer-role@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('منظّم الرحلة: يُعيَّن من المسؤول، يرى لوحة محدودة، ويعدّل بيانات الرحلة فعلياً', async ({ browser }) => {
  // ── عضو عادي ينضم أولاً — سطر عضويته هو ما سيُعيَّن منظّماً لاحقاً ──────────
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await openTripAsMember(memberPage, CREDS)
  await expect(memberPage.getByText('أرصدة المسافرين')).toBeVisible()
  // 🆕 «رحلاتي» — نقطة الدخول الوحيدة الآن لإدارة أي رحلة (دُمجت فيها «إدارة
  // الرحلة»، انظر docs/DECISIONS.md) — لا تظهر لعضو عادي بلا صلاحية admin ولا
  // isOrganizer، وهو عضو في رحلة واحدة فقط هنا (القاعدة ١٧: لا معنى لعنصر
  // تبديل/إدارة لمن لا يملك ما يبدّله أو يديره). نفتح القائمة أولاً كي يكون
  // التحقق من غياب العنصر داخلها فعلياً، لا لمجرد أن القائمة مغلقة.
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'رحلاتي' })).not.toBeVisible()
  await memberPage.keyboard.press('Escape')

  // ── المسؤول، من جلسة أخرى تماماً، يعيّنه منظّماً عبر تبويب الأعضاء ────────
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await openTripAsAdmin(adminPage, CREDS)

  // ⚠️ «رحلاتي» تعرض كل رحلات المشروع لأي مسؤول — لا رحلات هذا الحساب وحده
  // (trips/ لا تحمل حقل مالك؛ isAdmin() يمنح رؤية الكل). عند تشغيل الحزمة
  // كاملة توجد رحلات ملفات اختبار أخرى أيضاً، فنحدّد رحلتنا بمعرّفها لا
  // بافتراض أنها الوحيدة في القائمة — openTripDetailAsAdmin تتولّى ذلك.
  await openTripDetailAsAdmin(adminPage, CREDS.tripId)
  await adminPage.getByRole('button', { name: 'الأعضاء' }).click()

  // سطر واحد فقط هنا — العضو الحقيقي (المسؤول لا يُنشئ سطر عضوية أصلاً، لأن
  // isAdmin() يتجاوز isMember() في firestore.rules). نحدّده ببريده مباشرة.
  // كل سطر عضو مغلَّف بـ div.rounded-xl.border.p-3 (TripDetailPanel.tsx) —
  // نحصر البحث بهذا الغلاف كي لا نلتقط عناصر متداخلة أخرى تحوي نفس النص.
  const memberRow = adminPage.locator('div.rounded-xl.border.p-3').filter({ hasText: CREDS.memberEmail })
  await memberRow.getByRole('button', { name: 'تعيين منظّماً' }).click()
  await expect(adminPage.getByText('منظّم', { exact: true })).toBeVisible()

  // ── العضو، بعد إعادة تحميل، يرى الآن «رحلاتي» في AccountMenu (المرحلة ٣
  // منحته دور المنظّم أعلاه) ويعدّل رحلته من هناك مباشرة — التصميم الجديد
  // بعد دمج «إدارة الرحلة» في «رحلاتي» نفسها (انظر docs/DECISIONS.md). ─────
  await memberPage.reload()
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'رحلاتي' })).toBeVisible()
  await memberPage.getByRole('menuitem', { name: 'رحلاتي' }).click()
  // رحلة واحدة فقط في قائمته — زرّ «تعديل» الوحيد الظاهر هو لرحلته هو.
  await memberPage.getByRole('button', { name: 'تعديل' }).click()

  // ⚠️ الحالة السالبة: تبويبات المسؤول العالمي غائبة تماماً، لا مجرّد معطّلة.
  await expect(memberPage.getByRole('button', { name: 'حذف الرحلة' })).not.toBeVisible()
  await expect(memberPage.getByRole('button', { name: 'نسخة احتياطية' })).not.toBeVisible()
  // 🆕 على عكس السلوك القديم (لوحة منفصلة، رحلة المنظّم مفتوحة دائماً بلا
  // قائمة): «رحلاتي» شاشة قائمة أصلاً، فزرّ الرجوع إليها ظاهر دائماً في وضع
  // التعديل — ولو كانت رحلته الوحيدة.
  await expect(memberPage.getByRole('button', { name: 'رجوع لقائمة الرحلات' })).toBeVisible()

  // ── يعدّل اسم الرحلة فعلياً — هذا ما تسمح به rules الآن (isOrganizer) ─────
  const nameInput = memberPage.getByLabel('اسم الرحلة')
  await nameInput.fill('رحلة عدّلها المنظّم')
  await memberPage.getByRole('button', { name: 'حفظ التغييرات' }).click()
  await expect(memberPage.getByText('تم حفظ اسم الرحلة')).toBeVisible()

  await memberPage.reload()
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'رحلاتي' })).toBeVisible()
  await memberPage.getByRole('menuitem', { name: 'رحلاتي' }).click()
  await memberPage.getByRole('button', { name: 'تعديل' }).click()
  await expect(memberPage.getByLabel('اسم الرحلة')).toHaveValue('رحلة عدّلها المنظّم')
})
