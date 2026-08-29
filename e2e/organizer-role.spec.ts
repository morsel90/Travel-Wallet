// 🔴 المرحلة ٣ (docs/PLAN-member-management.md): دور «منظّم الرحلة» — يعبر
// جلستين منفصلتين حقيقيتين (عضو + مسؤول)، وهذا بالضبط ما تكشفه هذه الطبقة ولا
// يكشفه أي اختبار وحدة أو قواعد بمفرده: هل الواجهة تُظهر/تُخفي زرّ التعديل عند
// اللحظة الصحيحة بعد أن يمنح المسؤول الدور من جلسة أخرى تماماً؟
//
// الحالة السالبة المقابلة (منظّم لا يزيل منظّماً آخر ولا المسؤول، ولا يعيّن
// أحداً) مُختبَرة بشكل مباشر وأدقّ ضد المحاكي الحقيقي عبر استدعاء
// manageMember.run() مباشرة (نفس أسلوب restoreTrip الموثّق في CLAUDE.md) — لا
// تكراراً هنا عبر عناصر واجهة.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, openTripAsMember, openTripDetailFromHeader } from './utils/flows'

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
  // 🆕 اسم الرحلة في الهيدر غير قابل للضغط لعضو عادي — لا يملك صلاحية admin
  // ولا isOrganizer بعد (القاعدة ١٧: لا معنى لعنصر تعديل لمن لا يملك ما يعدّله).
  await expect(memberPage.getByRole('button', { name: 'تعديل الرحلة' })).not.toBeVisible()

  // ── المسؤول، من جلسة أخرى تماماً، يعيّنه منظّماً عبر تبويب الأعضاء ────────
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await openTripAsAdmin(adminPage, CREDS)

  // 🆕 التعديل يُفتح بالضغط على اسم الرحلة في الهيدر (EditTripModal) — openTripAsAdmin
  // فتح رابط CREDS.tripId تحديداً، فهي المفتوحة حالياً بالفعل.
  await openTripDetailFromHeader(adminPage)
  // 🆕 تبويبا «الأعضاء»/«المسافرون» دُمجا في تبويب واحد اسمه «المسافرون».
  await adminPage.getByRole('button', { name: 'المسافرون' }).click()

  // سطر واحد فقط هنا — العضو الحقيقي (المسؤول لا يُنشئ سطر عضوية أصلاً، لأن
  // isAdmin() يتجاوز isMember() في firestore.rules). نحدّده ببريده مباشرة —
  // يظهر تحت اسم المسافر في العرض المدمج (هوية الحساب المرتبط).
  // كل سطر مسافر مغلَّف بـ div.rounded-xl.border.p-3 (TripDetailPanel.tsx) —
  // نحصر البحث بهذا الغلاف كي لا نلتقط عناصر متداخلة أخرى تحوي نفس النص.
  const memberRow = adminPage.locator('div.rounded-xl.border.p-3').filter({ hasText: CREDS.memberEmail })
  await memberRow.getByRole('button', { name: 'تعيين منظّماً' }).click()
  await expect(adminPage.getByText('منظّم', { exact: true })).toBeVisible()

  // ── العضو، بعد إعادة تحميل، يرى الآن اسم الرحلة قابلاً للضغط في الهيدر
  // (المرحلة ٣ منحته دور المنظّم أعلاه) ويعدّل رحلته من هناك مباشرة. ─────────
  await memberPage.reload()
  await openTripDetailFromHeader(memberPage)

  // ⚠️ الحالة السالبة: تبويبات المسؤول العالمي غائبة تماماً، لا مجرّد معطّلة.
  await expect(memberPage.getByRole('button', { name: 'حذف الرحلة' })).not.toBeVisible()
  await expect(memberPage.getByRole('button', { name: 'نسخة احتياطية' })).not.toBeVisible()

  // ── يعدّل اسم الرحلة فعلياً — هذا ما تسمح به rules الآن (isOrganizer) ─────
  const nameInput = memberPage.getByLabel('اسم الرحلة')
  await nameInput.fill('رحلة عدّلها المنظّم')
  await memberPage.getByRole('button', { name: 'حفظ التغييرات' }).click()
  await expect(memberPage.getByText('تم حفظ اسم الرحلة')).toBeVisible()

  await memberPage.reload()
  await openTripDetailFromHeader(memberPage)
  await expect(memberPage.getByLabel('اسم الرحلة')).toHaveValue('رحلة عدّلها المنظّم')
})
