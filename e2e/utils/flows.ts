// 🔴 خطوات مشتركة بين عدة سيناريوهات E2E — استُخرجت لتفادي تكرار نفس تسلسل
// النقرات في كل ملف. كل دالة هنا تتبع نفس المسار الذي يسلكه مستخدم حقيقي عبر
// الواجهة (لا اختصارات عبر localStorage/إدخال مباشر في Firestore).
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface TripCreds {
  tripId: string
  memberEmail: string
  memberPassword: string
  adminEmail: string
  adminPassword: string
}

/**
 * يسجّل الدخول عبر AuthGate بالبريد/كلمة المرور — يفتح النموذج المطوي أولاً
 * (Google هو الخيار الأول المعروض، لا نستخدمه هنا). 🆕 مُصدَّرة (لا محلية فقط)
 * لأن self-serve-trip-creation.spec.ts تحتاجها من صفحة بلا `?trip=` — بخلاف
 * openTripAsMember/openTripAsAdmin أدناه اللتين تفترضان رحلة محدَّدة سلفاً.
 */
export async function signInWithEmail(page: Page, email: string, password: string): Promise<void> {
  await page.getByText('أو عبر البريد الإلكتروني').click()
  await page.getByPlaceholder('البريد الإلكتروني').fill(email)
  await page.getByPlaceholder('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click()
  // AuthGate يزول فور نجاح الدخول — انتظاره يمنع محاولة استخدام العناصر التالية قبل استقرار التوجيه.
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()
}

/**
 * يفتح رابط الرحلة ويسجّل دخول حساب المسؤول مباشرة عبر AuthGate.
 *
 * ⚠️ لا خطوة "وضع المسؤول" منفصلة هنا بعد الآن: حساب المسؤول في seedTrip يحمل
 * admin claim من البداية، وisAdmin() في firestore.rules لا تحتاج عضوية الرحلة
 * (`isMember(appId) || isAdmin()`) — فمروره عبر AuthGate وحده كافٍ للوصول
 * المباشر بصفة مسؤول. الزر "وضع المسؤول" داخل التطبيق يبقى موجوداً لسيناريو
 * مختلف (من سجّل دخوله كعضو عادي بحسابه الشخصي ويريد التبديل لحساب المسؤول
 * العالمي المنفصل) — انظر useAdminAuth.ts — لا للمسار الذي يختبره هذا الملف.
 *
 * ⚠️ هذا هو المسار الوحيد الفعلي لإضافة مسافر عبر الواجهة: زر "إضافة مسافر"
 * لا يظهر إطلاقاً لعضو غير مسؤول (انظر App.tsx وTravelerSection.tsx) — رغم أن
 * قواعد Firestore نفسها تسمح لعضو عادي بإنشاء مسافر. اكتشفنا هذا أثناء كتابة
 * هذا الاختبار بالذات؛ موثّق أيضاً في ملخّص الجلسة كملاحظة UX منفصلة.
 */
export async function openTripAsAdmin(page: Page, creds: TripCreds): Promise<void> {
  await page.goto(`/?trip=${creds.tripId}`)
  await signInWithEmail(page, creds.adminEmail, creds.adminPassword)
  await expect(page.getByRole('button', { name: 'إغلاق المسؤول' })).toBeVisible()
}

/** يفتح رابط الرحلة ويسجّل دخول حساب العضو العادي عبر AuthGate — بلا صلاحية مسؤول. */
export async function openTripAsMember(page: Page, creds: TripCreds): Promise<void> {
  await page.goto(`/?trip=${creds.tripId}`)
  await signInWithEmail(page, creds.memberEmail, creds.memberPassword)
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
