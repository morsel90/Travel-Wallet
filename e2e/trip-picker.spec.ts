// 🔴 شاشة «رحلاتي»: من يفتح التطبيق بلا `?trip=` لا رحلة مقصودة لديه، فيرى
// قائمة رحلاته ويختار منها — بدل أن يُطالَب برمز الرحلة الافتراضية التي قد لا
// تعنيه إطلاقاً.
//
// ⚠️ اختبار انحدار لخطأ تصميم حقيقي: أول نسخة ربطت ظهور الشاشة بـ needsTripPin
// و!isAdmin معاً، فاختفت عن كل عضو في الرحلة الافتراضية (وهم الأغلبية) وعن
// المسؤول تماماً — أي عن كل من قد يجرّبها عملياً.
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsMember } from './utils/flows'

const CREDS = {
  tripId: 'e2e-trip-picker',
  memberEmail: 'e2e-member-picker@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-admin-picker@test.local', // غير مستخدَم في هذا السيناريو، لكن seedTrip يتطلبه
  adminPassword: 'E2eTestPass!1',
}

// 🆕 دفتر مقصود الشكل: البطاقة يجب أن تعرض «٢ مسافرين · 300 ﷼» — أي المسافر
// المحذوف لا يُعدّ، والمصروف المحذوف لا يُجمع، **والمصروف القديم بلا حقل
// `deletedAt` إطلاقاً يُجمع**. هذا الأخير هو الفخّ كله: فلتر
// `deletedAt == null` كان سيُسقطه صامتاً فيظهر 200 بدل 300.
const LEDGER = {
  travelers: [
    { id: 1, name: 'سارة',  shortName: 'سارة',  deposited: 0, deletedAt: null },
    { id: 2, name: 'خالد',  shortName: 'خالد',  deposited: 0, deletedAt: null },
    { id: 3, name: 'محذوف', shortName: 'محذوف', deposited: 0, deletedAt: 1750000000000 },
  ],
  expenses: [
    // مصروف «قديم» — بلا حقل deletedAt أصلاً، كما كل مصاريف ما قبل الحذف الليّن
    { id: 'legacy',  amount: 100, deletedAt: undefined },
    { id: 'active',  amount: 200, deletedAt: null },
    { id: 'deleted', amount: 900, deletedAt: 1750000000000 },
  ],
}

test.beforeAll(async () => {
  await seedTrip(CREDS)

  const db = adminFirestore()
  const root = db.collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')
  await Promise.all(LEDGER.travelers.map(t =>
    root.collection('travelers').doc(String(t.id)).set(t)))
  await Promise.all(LEDGER.expenses.map(e =>
    root.collection('expenses').doc(e.id).set({
      date: '2026-07-21',
      description: `مصروف ${e.id}`,
      amount: e.amount,
      originalAmount: e.amount,
      currency: 'SAR',
      exchangeRate: 1,
      participants: [1, 2],
      createdAt: 1750000000000,
      // الغياب التام مقصود هنا — لا تكتبه بقيمة null
      ...(e.deletedAt === undefined ? {} : { deletedAt: e.deletedAt }),
    })))
})

test('عضو انضم لرحلة يرى قائمة رحلاته عند فتح التطبيق بلا معرّف رحلة، ويدخلها بالضغط عليها', async ({ page }) => {
  // العضوية ممنوحة مسبقاً كـ claim عبر seedTrip (نفس أثر استهلاك رابط دعوة حقيقي) —
  // تسجيل الدخول هنا عبر AuthGate وحده كافٍ لرؤيتها.
  await openTripAsMember(page, CREDS)
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()

  // فتح التطبيق مجرّداً: لا `?trip=` — يجب أن تظهر «رحلاتي» لا بوابة تسجيل الدخول
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'رحلاتي' })).toBeVisible()

  const tripButton = page.getByRole('button', { name: new RegExp(CREDS.tripId) })
  await expect(tripButton).toBeVisible()

  // الضغط على الرحلة يفتحها مباشرةً — بلا مطالبة بتسجيل دخول جديد، لأن الجلسة
  // ما زالت قائمة والعضوية محفوظة في claims الحساب
  await tripButton.click()
  await expect(page).toHaveURL(new RegExp(`trip=${CREDS.tripId}`))
  await expect(page.getByRole('button', { name: /متابعة عبر Google/ })).not.toBeVisible()
})

// 🆕 رقما البطاقة (useTripStats) — استعلاما تجميع خادميان لكل مجموعة: المجموع
// الكامل ناقص المحذوف. يُختبران هنا لا في اختبار وحدة لأن ما يُتحقَّق منه
// سلوك Firestore نفسه: أن `deletedAt > 0` يطابق المحذوف وحده، وأن القواعد
// تسمح بالتجميع لعضو عادي، وأنه لا يحتاج فهرساً مركّباً.
test('بطاقة الرحلة تعرض عدد المسافرين وإجمالي المصروف — بلا المحذوف، ومع المصاريف القديمة بلا حقل deletedAt', async ({ page }) => {
  await openTripAsMember(page, CREDS)
  await page.goto('/')

  const row = page.getByRole('listitem').filter({ hasText: CREDS.tripId })
  // البطاقة تظهر فوراً بالاسم؛ الرقمان يلحقان بها بعد التجميع.
  await expect(row).toBeVisible()

  // ٣ مسافرين في الدفتر، أحدهم محذوف ⇒ ٢
  await expect(row).toContainText('2 مسافرين')
  // 100 (قديم بلا الحقل) + 200 (نشط) = 300، و900 المحذوف لا يُجمع
  await expect(row).toContainText('300 ﷼')
  await expect(row).not.toContainText('1,200')
})
