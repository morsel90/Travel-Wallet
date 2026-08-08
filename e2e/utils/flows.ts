// 🔴 خطوات مشتركة بين عدة سيناريوهات E2E — استُخرجت لتفادي تكرار نفس تسلسل
// النقرات في كل ملف. كل دالة هنا تتبع نفس المسار الذي يسلكه مستخدم حقيقي عبر
// الواجهة (لا اختصارات عبر localStorage/إدخال مباشر في Firestore).
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface TripCreds {
  tripId: string
  pin: string
  adminEmail: string
  adminPassword: string
}

/**
 * يفتح رابط الرحلة، يتجاوز بوابة رمز الرحلة (TripGate)، ثم يسجّل دخول المسؤول.
 *
 * ⚠️ هذا هو المسار الوحيد الفعلي لإضافة مسافر عبر الواجهة: زر "إضافة مسافر"
 * لا يظهر إطلاقاً لعضو غير مسؤول (انظر App.tsx وTravelerSection.tsx) — رغم أن
 * قواعد Firestore نفسها تسمح لعضو عادي بإنشاء مسافر. اكتشفنا هذا أثناء كتابة
 * هذا الاختبار بالذات؛ موثّق أيضاً في ملخّص الجلسة كملاحظة UX منفصلة.
 */
export async function openTripAsAdmin(page: Page, creds: TripCreds): Promise<void> {
  await page.goto(`/?trip=${creds.tripId}`)

  await page.getByPlaceholder('رمز الرحلة').fill(creds.pin)
  await page.getByRole('button', { name: 'متابعة' }).click()

  await page.getByRole('button', { name: 'وضع المسؤول' }).click()
  await page.getByPlaceholder('البريد الإلكتروني').fill(creds.adminEmail)
  await page.getByPlaceholder('كلمة المرور').fill(creds.adminPassword)
  await page.getByRole('button', { name: 'دخول' }).click()

  await expect(page.getByRole('button', { name: 'إغلاق المسؤول' })).toBeVisible()
}

/** يفتح رابط الرحلة ويتحقق من رمزها فقط — بلا تسجيل دخول مسؤول (مسار العضو العادي). */
export async function openTripAsMember(page: Page, tripId: string, pin: string): Promise<void> {
  await page.goto(`/?trip=${tripId}`)
  await page.getByPlaceholder('رمز الرحلة').fill(pin)
  await page.getByRole('button', { name: 'متابعة' }).click()
}

/** يضيف مسافراً عبر النموذج — يتطلب وضع المسؤول مفعّلاً مسبقاً (openTripAsAdmin). */
export async function addTraveler(page: Page, name: string, deposit?: string): Promise<void> {
  await page.getByRole('button', { name: /إضافة (أول مسافر|مسافر جديد)/ }).click()
  await page.getByPlaceholder('مثال: سعد الغامدي').fill(name)
  if (deposit) await page.getByPlaceholder('0.00').first().fill(deposit)
  await page.getByRole('button', { name: 'اعتماد المسافر الجديد' }).click()
}

export interface AddExpenseOptions {
  amount: string
  description: string
  /** أسماء مختصرة يُلغى تحديدها — النموذج يبدأ بكل المسافرين محدَّدين افتراضياً. */
  deselectParticipants?: string[]
}

/** يفتح نموذج المصروف الكامل عبر زر "إضافة تفاصيل" في الشريط السفلي ويُدخل مصروفاً. */
export async function addExpense(page: Page, opts: AddExpenseOptions): Promise<void> {
  await page.getByTitle('إضافة تفاصيل').click()
  await page.getByLabel('المبلغ').fill(opts.amount)
  await page.getByLabel('الوصف').fill(opts.description)
  for (const name of opts.deselectParticipants ?? []) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: 'اعتماد المصروف' }).click()
}

/** يعثر على بطاقة مصروف بوصفه الظاهر — نطاق ضيق يكفي لتمييز أزرار تعديله/حذفه عن بقية القائمة. */
export function expenseCard(page: Page, description: string) {
  return page.locator('div.group').filter({ hasText: description })
}

/** يعدّل مبلغ مصروف قائم عبر زر "تعديل المصروف" الظاهر عند تمرير الفأرة (Desktop). */
export async function editExpenseAmount(page: Page, description: string, newAmount: string): Promise<void> {
  const card = expenseCard(page, description)
  await card.hover()
  await card.getByRole('button', { name: 'تعديل المصروف' }).click()

  const amountInput = page.getByLabel('المبلغ')
  await amountInput.fill('')
  await amountInput.fill(newAmount)
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click()
}
