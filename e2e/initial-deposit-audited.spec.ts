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

const creds = {
  tripId: 'e2e-initial-deposit',
  pin: '246810',
  adminEmail: 'admin-initial-deposit@example.com',
  adminPassword: 'Passw0rd!',
}

test.beforeEach(async () => {
  await seedTrip(creds)
})

test('الرصيد الابتدائي يظهر في سجلّ التعديلات بمبلغه وسببه', async ({ page }) => {
  await openTripAsAdmin(page, creds)

  await addTraveler(page, 'نورة السالم', '3000')

  // الرصيد وصل فعلاً — الدفعة كاملة نجحت ضد القواعد الحقيقية، لا الإنشاء وحده
  const card = page.locator('text=نورة').first()
  await expect(card).toBeVisible()
  await expect(page.getByText('3000', { exact: false }).first()).toBeVisible()

  // وسطر التدقيق موجود: هذا ما لم يكن يوجد قبل C1
  await page.getByTitle('سجل التعديلات').first().click()
  await expect(page.getByText(/سجل تعديلات رصيد/)).toBeVisible()
  await expect(page.getByText(/رصيد ابتدائي/)).toBeVisible()
  await expect(page.getByText('3000', { exact: false }).first()).toBeVisible()
})

test('مسافر بلا رصيد ابتدائي لا يُنشئ سطراً — لا حركة، لا سجلّ', async ({ page }) => {
  await openTripAsAdmin(page, creds)

  await addTraveler(page, 'بدر الحارثي')

  await page.getByTitle('سجل التعديلات').first().click()
  await expect(page.getByText(/سجل تعديلات رصيد/)).toBeVisible()
  // ⚠️ الغياب هو المقصود: السطر يوثّق حركة، ولا حركة هنا. سطرٌ بصفر كان
  // سيملأ السجلّ بضجيج يُخفي الحركات الحقيقية.
  await expect(page.getByText(/رصيد ابتدائي/)).toHaveCount(0)
})
