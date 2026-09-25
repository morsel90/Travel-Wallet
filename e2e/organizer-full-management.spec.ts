// 🔴 منظّم الرحلة مشرفها الكامل — بلا مسؤول عالمي على الإطلاق في هذا الاختبار.
//
// أول منظّم حقيقي أنشأ رحلته ولم يستطع إضافة أحد، ولا حذف من أضافه بالخطأ،
// ولا تسجيل مودَع — كلها كانت isAdmin() والمسؤول لا يحضر الرحلة. هذا الاختبار
// يعبر المسار كاملاً بحساب عادي أنشأ رحلته بنفسه، ويتحقّق من الأثر في قاعدة
// البيانات لا من التوستات وحدها:
//   • المودَع يمرّ من recordDeposit — الرصيد **وسطر تدقيقه** باسم المنظّم.
//   • تعديل مصروف غيره يترك «عدّله فلان» عليه.
//   • حذف مسافر ليّن، و«تراجع» يعيده.
import { test, expect } from '@playwright/test'
import { adminFirestore, seedBareUser } from './utils/seed'
import { signInWithEmail, addTraveler, editExpenseAmount, expenseCard, openFromMoreMenu } from './utils/flows'

const CREDS = { email: 'e2e-organizer-full@test.local', password: 'E2eTestPass!1' }
const TRIP_ID = 'e2e-organizer-full'
const PROFILE_NAME = 'سلمان المنظّم'

const dataRoot = () => adminFirestore().collection('artifacts').doc(TRIP_ID).collection('public').doc('data')

test.beforeAll(async () => {
  await seedBareUser(CREDS.email, CREDS.password)
})

test('المنظّم يضيف مسافراً بمودَع، يعدّل مصروف غيره، ويحذف مسافراً ويستعيده — بلا مسؤول', async ({ page }) => {
  const organizerUid = await seedBareUser(CREDS.email, CREDS.password)

  await page.goto('/')
  await signInWithEmail(page, CREDS.email, CREDS.password)
  await page.getByRole('button', { name: 'بروفايلي' }).click()
  await page.getByLabel('اسمك').fill(PROFILE_NAME)
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'بروفايلي' })).not.toBeVisible()

  await page.getByRole('button', { name: 'إنشاء رحلة جديدة' }).click()
  await page.getByLabel('معرّف الرحلة').fill(TRIP_ID)
  await page.getByLabel('اسم الرحلة').fill('رحلة يديرها منظّمها')
  await page.getByRole('button', { name: 'إنشاء الرحلة' }).click()
  await expect(page).toHaveURL(new RegExp(`trip=${TRIP_ID}`))
  await expect(page.getByText(PROFILE_NAME)).toBeVisible()

  // ── مسافر بمودَع ابتدائي — الحقل ظاهر للمنظّم الآن، والمبلغ يمرّ من الخادم ──
  await addTraveler(page, 'سعد الغامدي', '300')
  await expect.poll(async () => {
    const snap = await dataRoot().collection('travelers').where('name', '==', 'سعد الغامدي').get()
    return snap.docs[0]?.data().deposited
  }, { timeout: 15_000 }).toBe(300)

  const saad = (await dataRoot().collection('travelers').where('name', '==', 'سعد الغامدي').get()).docs[0]
  const logs = await saad.ref.collection('depositLogs').get()
  // ⚠️ الحالة الحاكمة: رصيد بلا سطر يفسّره هو ما وُجدت recordDeposit لمنعه.
  expect(logs.size).toBe(1)
  expect(logs.docs[0].data()).toMatchObject({ newDeposited: 300, changedByUid: organizerUid, mode: 'set' })

  // ── مصروف كتبه غيره — المنظّم يعدّله فيُختم اسمه عليه ────────────────────
  await dataRoot().collection('expenses').doc('someone-elses').set({
    date: '2026-09-01', description: 'غداء كتبه غيره', amount: 90, originalAmount: 90,
    currency: 'SAR', exchangeRate: 1, participants: [saad.data().id], createdAt: Date.now(),
    createdByUid: 'another-member',
  })
  await expect(expenseCard(page, 'غداء كتبه غيره')).toBeVisible()
  await editExpenseAmount(page, 'غداء كتبه غيره', '120')
  await expect(expenseCard(page, 'غداء كتبه غيره').getByText(`عدّله: ${PROFILE_NAME}`)).toBeVisible()
  // الشارة تظهر من الكاش المحلي قبل وصول الكتابة للخادم — فالتحقّق يُعاد حتى تصل.
  await expect.poll(async () => (await dataRoot().collection('expenses').doc('someone-elses').get()).data(), { timeout: 15_000 })
    .toMatchObject({ amount: 120, lastEditedByUid: organizerUid, createdByUid: 'another-member' })

  // ── حذف مسافر بلا مصاريف، ثم «تراجع» ─────────────────────────────────────
  await addTraveler(page, 'فهد المستعجل')
  const fahdCard = page.locator('div.group').filter({ hasText: 'فهد المستعجل' }).first()
  await fahdCard.hover()
  await fahdCard.getByTitle('حذف المسافر').click()
  await expect.poll(async () => {
    const snap = await dataRoot().collection('travelers').where('name', '==', 'فهد المستعجل').get()
    return snap.docs[0]?.data().deletedAt
  }, { timeout: 15_000 }).toEqual(expect.any(Number))

  // الاستعادة من سلة المهملات لا من «تراجع» (5 ثوانٍ تنقضي أثناء التحقّق أعلاه) —
  // وهذا يختبر أيضاً أن السلة صارت ظاهرة للمنظّم.
  await openFromMoreMenu(page, 'سلة المهملات')
  const trash = page.getByRole('dialog', { name: 'سلة المهملات' })
  await trash.getByRole('button', { name: /المسافرون/ }).click()
  await trash.locator('div').filter({ hasText: 'فهد المستعجل' }).getByRole('button', { name: 'استعادة' }).last().click()
  await expect.poll(async () => {
    const snap = await dataRoot().collection('travelers').where('name', '==', 'فهد المستعجل').get()
    return snap.docs[0]?.data().deletedAt
  }, { timeout: 15_000 }).toBeNull()
})
