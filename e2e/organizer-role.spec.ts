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
import { openTripAsAdmin, openTripAsMember, openAccountMenu } from './utils/flows'

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
  // 🆕 «إدارة الرحلة» انتقلت إلى AccountMenu (الهيدر) — بعد إزالة زرّها
  // المكرَّر من ExpensesPanel (انظر docs/DECISIONS.md). نفتح القائمة أولاً كي
  // يكون التحقق من غياب العنصر داخلها فعلياً، لا لمجرد أن القائمة مغلقة.
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'إدارة الرحلة' })).not.toBeVisible()
  await memberPage.keyboard.press('Escape')

  // ── المسؤول، من جلسة أخرى تماماً، يعيّنه منظّماً عبر تبويب الأعضاء ────────
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await openTripAsAdmin(adminPage, CREDS)

  // ⚠️ قائمة "لوحة الإدارة" تعرض كل رحلات المشروع لأي مسؤول — لا رحلات هذا
  // الحساب وحده (trips/ لا تحمل حقل مالك؛ isAdmin() يمنح رؤية الكل). عند تشغيل
  // الحزمة كاملة توجد رحلات ملفات اختبار أخرى أيضاً، فنحدّد رحلتنا بمعرّفها لا
  // بافتراض أنها الوحيدة في القائمة.
  await openAccountMenu(adminPage)
  await adminPage.getByRole('menuitem', { name: 'لوحة الإدارة' }).click()
  // غلاف صفّ الرحلة الواحدة في TripAdminView.tsx — نحصر البحث به مع نص معرّف
  // رحلتنا كي لا نلتقط "تعديل" رحلة أخرى ظاهرة في نفس القائمة.
  const tripRow = adminPage.locator('div.bg-white.rounded-2xl.shadow-sm.border.border-slate-200.p-4')
    .filter({ hasText: CREDS.tripId })
  await tripRow.getByRole('button', { name: 'تعديل' }).click()
  await adminPage.getByRole('button', { name: 'الأعضاء' }).click()

  // سطر واحد فقط هنا — العضو الحقيقي (المسؤول لا يُنشئ سطر عضوية أصلاً، لأن
  // isAdmin() يتجاوز isMember() في firestore.rules). نحدّده ببريده مباشرة.
  // كل سطر عضو مغلَّف بـ div.rounded-xl.border.p-3 (TripDetailPanel.tsx) —
  // نحصر البحث بهذا الغلاف كي لا نلتقط عناصر متداخلة أخرى تحوي نفس النص.
  const memberRow = adminPage.locator('div.rounded-xl.border.p-3').filter({ hasText: CREDS.memberEmail })
  await memberRow.getByRole('button', { name: 'تعيين منظّماً' }).click()
  await expect(adminPage.getByText('منظّم', { exact: true })).toBeVisible()

  // ── العضو، بعد إعادة تحميل، يرى الآن عنصر إدارة رحلته في AccountMenu ─────
  await memberPage.reload()
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'إدارة الرحلة' })).toBeVisible()
  await memberPage.getByRole('menuitem', { name: 'إدارة الرحلة' }).click()

  // ⚠️ الحالة السالبة: تبويبات المسؤول العالمي غائبة تماماً، لا مجرّد معطّلة.
  await expect(memberPage.getByRole('button', { name: 'حذف الرحلة' })).not.toBeVisible()
  await expect(memberPage.getByRole('button', { name: 'نسخة احتياطية' })).not.toBeVisible()
  // ولا يرى قائمة رحلات أخرى — رحلته وحدها مفتوحة مباشرة، بلا زر رجوع لقائمة.
  await expect(memberPage.getByRole('button', { name: 'رجوع لقائمة الرحلات' })).not.toBeVisible()

  // ── يعدّل اسم الرحلة فعلياً — هذا ما تسمح به rules الآن (isOrganizer) ─────
  const nameInput = memberPage.getByLabel('اسم الرحلة')
  await nameInput.fill('رحلة عدّلها المنظّم')
  await memberPage.getByRole('button', { name: 'حفظ التغييرات' }).click()
  await expect(memberPage.getByText('تم حفظ اسم الرحلة')).toBeVisible()

  await memberPage.reload()
  await openAccountMenu(memberPage)
  await expect(memberPage.getByRole('menuitem', { name: 'إدارة الرحلة' })).toBeVisible()
  await memberPage.getByRole('menuitem', { name: 'إدارة الرحلة' }).click()
  await expect(memberPage.getByLabel('اسم الرحلة')).toHaveValue('رحلة عدّلها المنظّم')
})
