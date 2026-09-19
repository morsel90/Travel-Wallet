// 🔴 التحويل يُسجَّل في الدفتر فعلاً — لا تأشيراً على الشاشة.
//
// العطل الذي أوجد هذا الاختبار: «تحديد كمُحوَّل» كان يكتب في useState محلي، فكان
// السطر يُظلَّل ويُقرأ «تم التحويل ✓» والدفتر لا يعرف عنه شيئاً — يزول بإعادة
// التحميل ولا يراه جهاز آخر. ولهذا لا يكفي هنا فحص اختفاء البطاقة: الاختبار
// يُعيد تحميل الصفحة (قراءة جديدة من الخادم) ويفحص الأرصدة نفسها بعدها.
//
// ⚠️ والفحص الأهم هو الثابت المحاسبي: التحويل **ينقل** ولا يضيف — «الرصيد» في
// الهيدر (مجموع المُودَع ناقص المصروف) هو 300 قبل التحويل وبعده. لو كُتبت الحركة
// في طرف واحد — إيداع للمَدين بلا خصم من الدائن، وهو أسهل خطأ يُرتكب هنا —
// لاختفت البطاقة ولبدت أرصدة الأفراد سليمة، ولانكشف الخلل في هذا المجموع وحده.
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsAdmin, addTraveler, addExpense } from './utils/flows'

const CREDS = {
  tripId: 'e2e-settlement-record',
  memberEmail: 'e2e-member-settle@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-settle@test.local',
  adminPassword: 'E2eTestPass!1',
}

test.beforeAll(async () => {
  await seedTrip(CREDS)
})

test('تسجيل التحويل يُصفّي الرصيدَين ويبقى بعد إعادة التحميل', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  await addTraveler(page, 'منى الدوسري', '600')
  await addTraveler(page, 'فيصل الشمري', '100')

  // 400 على الاثنين → 200 لكل منهما. منى: 600−200 = +400، فيصل: 100−200 = −100.
  await addExpense(page, { amount: '400', description: 'إيجار شقة' })

  const settlementsPanel = page.locator('#settlements-section')
  const monaCard = page.locator('div.group').filter({ hasText: 'منى الدوسري' })
  const faisalCard = page.locator('div.group').filter({ hasText: 'فيصل الشمري' })

  await expect(monaCard.getByText('400.00', { exact: true })).toBeVisible()
  await expect(faisalCard.getByText('-100.00', { exact: true })).toBeVisible()
  await expect(settlementsPanel).toContainText('100.00')
  // المجموع قبل التحويل — 700 مُودَع ناقص 400 مصروف.
  await expect(page.getByText('الرصيد 300.00 ﷼')).toBeVisible()

  // ── التسجيل: نقرة تكشف التأكيد، والتأكيد وحده يكتب ───────────────────────
  await settlementsPanel.getByRole('button', { name: 'تسجيل التحويل' }).click()
  await settlementsPanel.getByRole('button', { name: /تأكيد تسجيل 100\.00/ }).click()

  // التسوية تختفي لأن الرصيدَين صارا صحيحَين — لا لأن أحداً أشّر عليها.
  await expect(settlementsPanel).toContainText('الحسابات مصفّاة')

  // ── وبعد إعادة التحميل: نفس الأرقام، من الخادم لا من حالة الصفحة ─────────
  await page.reload()
  await expect(page.locator('#settlements-section')).toContainText('الحسابات مصفّاة')

  // فيصل: أودع 100+100 = 200، ونصيبه 200 → صفر. منى: 600−100 = 500، ونصيبها 200 → 300.
  await expect(page.locator('div.group').filter({ hasText: 'فيصل الشمري' })
    .getByText('0.00', { exact: true })).toBeVisible()
  await expect(page.locator('div.group').filter({ hasText: 'منى الدوسري' })
    .getByText('300.00', { exact: true })).toBeVisible()

  // ولم يدخل الدفتر ريال واحد ولم يخرج منه: نفس المجموع قبل التحويل.
  await expect(page.getByText('الرصيد 300.00 ﷼')).toBeVisible()
})

// 🐛 ما حدث فعلاً على Bh26: الدائن صار دائناً بدفع مصاريف **من جيبه** (paidBy)
// لا بإيداع، فخصم التحويل من «المودَع» أنزله إلى ‎-170.5 — رقم تشترط القواعد
// ألا يكون (`isFiniteAmount: >= 0`). الحارس يرفض بدل أن يكتب دفتراً فاسداً،
// والاختبار يثبت الأمرين: الرفض، وأن **لا شيء** كُتب.
const POCKET = {
  tripId: 'e2e-settlement-pocket',
  memberEmail: 'e2e-member-pocket@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-pocket@test.local',
  adminPassword: 'E2eTestPass!1',
}

test('دائنٌ دفع من جيبه: التسجيل يُرفض بسبب مفهوم، ولا يُكتب أي رصيد', async ({ page }) => {
  await seedTrip(POCKET)
  const root = adminFirestore().collection('artifacts').doc(POCKET.tripId).collection('public').doc('data')
  await root.collection('travelers').doc('1').set({ id: 1, name: 'راشد الدافع', shortName: 'راشد', deposited: 0, deletedAt: null })
  await root.collection('travelers').doc('2').set({ id: 2, name: 'سالم المدين', shortName: 'سالم', deposited: 0, deletedAt: null })
  // 200 دفعها راشد من جيبه عن الاثنين → راشد له 100، وسالم عليه 100، ولا أحد أودع شيئاً.
  await root.collection('expenses').doc('p1').set({
    date: '2026-09-18', description: 'غداء', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1,
    participants: [1, 2], paidBy: 1, category: 'طعام وشراب', createdAt: Date.now(), deletedAt: null,
  })

  await openTripAsAdmin(page, POCKET)
  const panel = page.locator('#settlements-section')
  await expect(panel).toContainText('100.00')

  await panel.getByRole('button', { name: 'تسجيل التحويل' }).click()
  await panel.getByRole('button', { name: /تأكيد تسجيل 100\.00/ }).click()

  await expect(page.getByText(/أتى من مصاريف دفعها من جيبه/)).toBeVisible()
  // التسوية باقية كما هي — لم يُسجَّل شيء.
  await expect(panel).toContainText('100.00')

  // ⚠️ تحقّق سلبي حقيقي: لا رصيد تغيّر ولا سطر تدقيق كُتب — المعاملة أُلغيت كاملة.
  const [rashed, salem] = await Promise.all([root.collection('travelers').doc('1').get(), root.collection('travelers').doc('2').get()])
  expect(rashed.data()?.deposited).toBe(0)
  expect(salem.data()?.deposited).toBe(0)
  expect((await root.collection('travelers').doc('2').collection('depositLogs').get()).size).toBe(0)
})
