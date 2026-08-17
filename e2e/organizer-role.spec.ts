// 🔴 المرحلة ٣ (docs/PLAN-member-management.md): دور «منظّم الرحلة» — يعبر
// جلستين منفصلتين حقيقيتين (عضو + مسؤول)، وهذا بالضبط ما تكشفه هذه الطبقة ولا
// يكشفه أي اختبار وحدة أو قواعد بمفرده: هل الواجهة تُظهر/تُخفي زرّ الإدارة عند
// اللحظة الصحيحة بعد أن يمنح المسؤول الدور من جلسة أخرى تماماً؟
//
// الحالة السالبة المقابلة (منظّم لا يزيل منظّماً آخر ولا المسؤول، ولا يعيّن
// أحداً) مُختبَرة بشكل مباشر وأدقّ ضد المحاكي الحقيقي عبر استدعاء
// manageMember.run() مباشرة (نفس أسلوب restoreTrip الموثّق في CLAUDE.md) — لا
// تكراراً هنا عبر عناصر واجهة متطابقة الشكل يصعب تمييزها بثقة (كل الأعضاء
// المجهولين يُعرَضون بنفس النص "عضو بجلسة مجهولة").
import { test, expect } from '@playwright/test'
import { getFirestore } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { seedTrip, clearPinRateLimits, E2E_PROJECT_ID } from './utils/seed'
import { openTripAsAdmin, openTripAsMember } from './utils/flows'

function adminApp() {
  return getApps().find(a => a.name === 'e2e-seed')
    ?? initializeApp({ projectId: E2E_PROJECT_ID }, 'e2e-seed')
}

/**
 * ⚠️ openTripAsAdmin يمرّ أولاً بجلسة مجهولة (إدخال الرمز) قبل تسجيل الدخول
 * بالبريد/كلمة المرور — فيترك تلك الجلسة المؤقتة سطر عضوية يتيماً أيضاً.
 * السطران يظهران متطابقَي النص في الواجهة («عضو بجلسة مجهولة»)، فلا سبيل
 * موثوق للتمييز بينهما من DOM وحده. الأقدم انضماماً هو العضو الحقيقي دائماً،
 * لأن هذا الاختبار يُنضمّه (openTripAsMember) قبل تشغيل openTripAsAdmin.
 */
async function realMemberUid(tripId: string): Promise<string> {
  const db = getFirestore(adminApp())
  const snap = await db.collection('trips').doc(tripId).collection('members').orderBy('joinedAt', 'asc').get()
  return snap.docs[0].id
}

const CREDS = {
  tripId: 'e2e-organizer-role',
  pin: '990011',
  adminEmail: 'e2e-organizer-role@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
  await clearPinRateLimits()
})

test('منظّم الرحلة: يُعيَّن من المسؤول، يرى لوحة محدودة، ويعدّل بيانات الرحلة فعلياً', async ({ browser }) => {
  // ── عضو عادي ينضم أولاً — سطر عضويته هو ما سيُعيَّن منظّماً لاحقاً ──────────
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await openTripAsMember(memberPage, CREDS.tripId, CREDS.pin)
  // ⚠️ openTripAsMember لا ينتظر اكتمال verifyTripPin فعلياً (فقط يضغط
  // "متابعة") — بدون هذا الانتظار الصريح هنا، تبدأ جلسة المسؤول أدناه انضمامها
  // المؤقت الخاص بها بينما طلب هذا العضو ما يزال معلَّقاً، فلا يعود ترتيب
  // joinedAt بين السطرين مضموناً (realMemberUid يعتمد عليه).
  await expect(memberPage.getByText('أرصدة المسافرين')).toBeVisible()
  await expect(memberPage.getByRole('button', { name: /إدارة الرحلة/ })).not.toBeVisible()

  // ── المسؤول، من جلسة أخرى تماماً، يعيّنه منظّماً عبر تبويب الأعضاء ────────
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await openTripAsAdmin(adminPage, CREDS)

  // ⚠️ قائمة "إدارة الرحلات" تعرض كل رحلات المشروع لأي مسؤول — لا رحلات هذا
  // الحساب وحده (trips/ لا تحمل حقل مالك؛ isAdmin() يمنح رؤية الكل). عند تشغيل
  // الحزمة كاملة توجد رحلات ملفات اختبار أخرى أيضاً، فنحدّد رحلتنا بمعرّفها لا
  // بافتراض أنها الوحيدة في القائمة.
  await adminPage.getByRole('button', { name: 'إدارة الرحلات' }).click()
  // غلاف صفّ الرحلة الواحدة في TripAdminView.tsx — نحصر البحث به مع نص معرّف
  // رحلتنا كي لا نلتقط "تعديل" رحلة أخرى ظاهرة في نفس القائمة.
  const tripRow = adminPage.locator('div.bg-white.rounded-2xl.shadow-sm.border.border-slate-200.p-4')
    .filter({ hasText: CREDS.tripId })
  await tripRow.getByRole('button', { name: 'تعديل' }).click()
  await adminPage.getByRole('button', { name: 'الأعضاء' }).click()

  // ⚠️ سطران يظهران هنا لا واحد (انظر تعليق realMemberUid أعلاه) — نحدّد سطر
  // العضو الحقيقي بمعرّفه الفعلي من Firestore مباشرة، لا بموضعه في القائمة.
  const memberUid = await realMemberUid(CREDS.tripId)
  await expect(adminPage.getByText('عضو بجلسة مجهولة')).toHaveCount(2)
  // كل سطر عضو مغلَّف بـ div.rounded-xl.border.p-3 (TripDetailPanel.tsx) —
  // نحصر البحث بهذا الغلاف كي لا نلتقط عناصر متداخلة أخرى تحوي نفس النص.
  const memberRow = adminPage.locator('div.rounded-xl.border.p-3').filter({ hasText: memberUid })
  await memberRow.getByRole('button', { name: 'تعيين منظّماً' }).click()
  await expect(adminPage.getByText('منظّم', { exact: true })).toBeVisible()

  // ── العضو، بعد إعادة تحميل، يرى الآن زرّ إدارة رحلته ────────────────────
  await memberPage.reload()
  await expect(memberPage.getByRole('button', { name: 'إدارة الرحلة' })).toBeVisible()
  await memberPage.getByRole('button', { name: 'إدارة الرحلة' }).click()

  // ⚠️ الحالة السالبة: تبويبات المسؤول العالمي غائبة تماماً، لا مجرّد معطّلة.
  await expect(memberPage.getByRole('button', { name: 'رمز الدخول' })).not.toBeVisible()
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
  await expect(memberPage.getByRole('button', { name: 'إدارة الرحلة' })).toBeVisible()
  await memberPage.getByRole('button', { name: 'إدارة الرحلة' }).click()
  await expect(memberPage.getByLabel('اسم الرحلة')).toHaveValue('رحلة عدّلها المنظّم')
})
