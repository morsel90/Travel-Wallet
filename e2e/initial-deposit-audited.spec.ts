// 🔴 C1: الرصيد الابتدائي حركة مالية موثَّقة لا حقل إنشاء.
//
// قبل 2026-08-14 كان أي عضو ينشئ مسافراً برصيد ابتدائي عشوائي **بلا أي سطر
// تدقيق**، بينما تعديل نفس الحقل لاحقاً محكوم بالمسؤول ويكتب سطراً غير قابل
// للتعديل. فمن أراد إضافة مال بلا أثر لا يفتح نافذة الإيداع — يُنشئ مسافراً.
//
// ⚠️ ولماذا E2E لا اختبار وحدة: اختبار الوحدة يثبت أن العميل *ينوي* كتابة
// السطر، واختبار القواعد يثبت أن الخادم *يقبل* الدفعة. لكن أياً منهما لا يثبت
// أن الاثنين يتفقان — وهذا الاختبار وحده يشغّل الدفعة الحقيقية ضد القواعد
// الحقيقية ثم يقرأ النتيجة من الواجهة.
import { test, expect } from '@playwright/test'
import { seedTrip } from './utils/seed'
import { openTripAsAdmin, addTraveler } from './utils/flows'
import type { Page } from '@playwright/test'

// 🆕 **لا نافذة «سجل التعديلات» بعد اليوم.** كانت نافذة مستقلّة تفتحها أيقونة
// في صفّ لا يظهر إلا بالتحويم على بطاقة المسافر — أي لا يظهر على الجوال
// إطلاقاً — وكانت تعرض بيانات معروضة أصلاً في مكان آخر: `buildMergedTimeline`
// يدمج نفس `depositLogs` في «كشف الحساب التفصيلي» داخل ملف المسافر، وبنفس
// حارس الصلاحية. حُذفت النافذة، وبقي المصدر الواحد. المسار الآن هو مسار
// المستخدم الفعلي: اضغط البطاقة، ثم افتح كشف الحساب.
// ⚠️ يُعيد نطاق **الشاشة** (`#traveler-profile`) لا الصفحة كلها: النافذة
// تُخرج معها دائماً مستند طباعة مخفياً (`#print-root`) يحمل نفس النصوص، فأي
// استعلام غير مقيَّد يطابق النسختين ويسقط بـstrict mode violation.
function openStatement(page: Page, travelerName: string) {
  return (async () => {
    await page.getByText(travelerName, { exact: true }).first().click()
    await expect(page.getByRole('heading', { name: travelerName, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'كشف الحساب التفصيلي' }).click()
    return page.locator('#traveler-profile')
  })()
}

const baseCreds = {
  memberEmail: 'member-initial-deposit@example.com', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  memberPassword: 'Passw0rd!',
  adminEmail: 'admin-initial-deposit@example.com',
  adminPassword: 'Passw0rd!',
}

// ⚠️ رحلة منفصلة لكل اختبار لا رحلة مشتركة: seedTrip يهيّئ مستند الرحلة فقط،
// ولا يمسح المسافرين المُضافين في اختبار سابق على نفس المعرّف. رحلة مشتركة
// كانت ستُبقي "نورة السالم" (سطر تدقيقها الحقيقي) ظاهرة أمام الاختبار الثاني،
// فيفتح الاختبار الثاني ملفّها هي لا ملفّ "بدر الحارثي".
const creds1 = { ...baseCreds, tripId: 'e2e-initial-deposit-1' }
const creds2 = { ...baseCreds, tripId: 'e2e-initial-deposit-2' }

test.beforeAll(async () => {
  await seedTrip(creds1)
  await seedTrip(creds2)
})

test('الرصيد الابتدائي يظهر في سجلّ التعديلات بمبلغه وسببه', async ({ page }) => {
  await openTripAsAdmin(page, creds1)

  await addTraveler(page, 'نورة السالم', '3000')

  // الرصيد وصل فعلاً — الدفعة كاملة نجحت ضد القواعد الحقيقية، لا الإنشاء وحده
  const card = page.locator('text=نورة').first()
  await expect(card).toBeVisible()
  await expect(page.getByText('3000', { exact: false }).first()).toBeVisible()

  // وسطر التدقيق موجود: هذا ما لم يكن يوجد قبل C1
  const profile = await openStatement(page, 'نورة السالم')
  await expect(profile.getByText(/رصيد ابتدائي/)).toBeVisible()
  await expect(profile.getByText('3000', { exact: false }).first()).toBeVisible()
})

test('مسافر بلا رصيد ابتدائي لا يُنشئ سطراً — لا حركة، لا سجلّ', async ({ page }) => {
  await openTripAsAdmin(page, creds2)

  await addTraveler(page, 'بدر الحارثي')

  const profile = await openStatement(page, 'بدر الحارثي')
  // ⚠️ الغياب هو المقصود: السطر يوثّق حركة، ولا حركة هنا. سطرٌ بصفر كان
  // سيملأ السجلّ بضجيج يُخفي الحركات الحقيقية.
  await expect(profile.getByText(/رصيد ابتدائي/)).toHaveCount(0)
})
