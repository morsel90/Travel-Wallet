// 🔴 الرحلات طويلة المدى: إغلاق الشهر وترحيل الأرصدة، وخروج منتدَب بحساب مسوّى.
//
// ⚠️ **هذه الطبقة تحديداً هي الوحيدة التي تُثبت الميزة فعلاً**، وليس ذلك
// شعاراً: منطق الترحيل كلّه يعيش في closeMonth (Cloud Function بصلاحيات Admin
// SDK)، فلا اختبار وحدة يراه، ولا اختبار قواعد يمرّ به (القواعد تُتجاوَز
// هناك). ما يُقاس هنا هو الشيء الوحيد الذي يهمّ محاسبياً:
//
//   **الرصيد الصافي لكل عضو لا يتغيّر بالإغلاق.**
//
// الأرقام مختارة لتغطّي الاتجاهين معاً في تشغيل واحد: عضو له رصيد (credit)
// وعضو عليه عجز (debt) — وهما مساران مختلفان تماماً داخل الدالة (مصروف ثم
// إيداع، مقابل إيداع ثم مصروف).
import { test, expect } from '@playwright/test'
import { seedTrip, adminFirestore } from './utils/seed'
import { openTripAsAdmin } from './utils/flows'

// ⚠️ **تسلسلي لا متوازٍ.** الاختباران يتشاركان *دفتراً واحداً*، وحالة الدفتر
// هي موضوع الاختبار نفسه: الثاني يُخرج خالد من الرحلة بينما الأول يتحقّق من
// رصيده بعد الترحيل. رُصد هذا فعلاً لا افتراضاً — الأول فشل عند «−200.00 ريال»
// لأن الثاني كان قد أخرج صاحبه قبل ثوانٍ (fullyParallel في playwright.config.ts).
//
// والترتيب مقصود لا مجرّد تفادٍ للتعارض: الثاني يبدأ من دفتر *بعد* ترحيل حقيقي،
// وهو الوضع الفعلي الذي يخرج فيه منتدَب من انتداب طويل.
test.describe.configure({ mode: 'serial' })

const CREDS = {
  tripId: 'e2e-long-term',
  memberEmail: 'e2e-long-term-member@test.local',
  memberPassword: 'E2eTestPass!1',
  adminEmail: 'e2e-long-term-admin@test.local',
  adminPassword: 'E2eTestPass!1',
}

// شهر ثابت لا `new Date()`: الاختبار يجب أن يُنتج نفس النتيجة في أي يوم يُشغَّل
// فيه. closeMonth تشترط أن يطابق الشهر المطلوب `currentPeriod` على مستند الرحلة
// — وهي قيمة نزرعها هنا، فلا علاقة لتقويم جهاز التشغيل بالأمر إطلاقاً.
const PERIOD = '2026-08'
const NEXT_PERIOD_LABEL = 'سبتمبر 2026'

const SAAD = { id: 101, name: 'سعد', shortName: 'سعد', deposited: 1000 }
const KHALED = { id: 102, name: 'خالد', shortName: 'خالد', deposited: 0 }

// ⚠️ عضوة برصيد صفر **ولا مشاركة في أي مصروف** — وهذا الشرط المزدوج مقصود:
// بطاقة المسافر تُخفي زرّ الحذف لمن له مصاريف («مربوط بمصاريف»)، والإغلاق
// يُنشئ مصروف تسوية لكل من رصيده غير صفر. فمن له رصيد أو مصاريف تختفي بطاقته
// من هذا المسار بعد أول إغلاق. منى تمثّل منتدَبة انضمّت ولم تُنفق بعد ثم غادرت
// — وهي الحالة الوحيدة التي يبقى فيها زرّ البطاقة ظاهراً، أي الحالة التي
// **يجب** أن تُفحص هنا بلا شرط `if` يُفرغ الاختبار من مضمونه.
const MONA = { id: 103, name: 'منى', shortName: 'منى', deposited: 0 }

// مصروف واحد بـ 400 على الاثنين بالتساوي (200 لكل منهما):
//   سعد  = 1000 − 200 = +800  (دائن)
//   خالد =    0 − 200 = −200  (مدين)
const SAAD_BALANCE = 800
const KHALED_BALANCE = -200

test.beforeAll(async () => {
  await seedTrip(CREDS)
  const db = adminFirestore()

  await db.collection('trips').doc(CREDS.tripId).set({
    tripType: 'long_term',
    currentPeriod: PERIOD,
  }, { merge: true })

  const dataRoot = db.collection('artifacts').doc(CREDS.tripId).collection('public').doc('data')

  for (const traveler of [SAAD, KHALED, MONA]) {
    await dataRoot.collection('travelers').doc(String(traveler.id)).set({ ...traveler, deletedAt: null })
    await dataRoot.collection('travelerNames').doc(traveler.shortName).set({ travelerId: traveler.id })
  }

  await dataRoot.collection('expenses').doc('e2e-lt-expense').set({
    date: `${PERIOD}-10`,
    description: 'سكن الانتداب',
    amount: 400,
    originalAmount: 400,
    currency: 'SAR',
    exchangeRate: 1,
    participants: [SAAD.id, KHALED.id],
    createdAt: Date.now(),
    createdByUid: 'seed',
    deletedAt: null,
  })
})

test('إغلاق الشهر يُرحّل الأرصدة دون أن يغيّر صافي رصيد أي عضو', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  const panel = page.locator('#long-term-section')
  await expect(panel).toBeVisible()
  // ⚠️ `exact: true` ليس تفصيلاً: «أغسطس 2026» يظهر ثلاث مرات في هذا القسم
  // (شارة الشهر المفتوح، وعنوان «مصاريف أغسطس 2026»، ونصّ زرّ الإغلاق). المطابقة
  // التامة تعزل الشارة وحدها — وهي المقصودة هنا.
  await expect(panel.getByText('أغسطس 2026', { exact: true })).toBeVisible()
  await expect(panel.getByText('لم يُغلق شهر بعد')).toBeVisible()
  await expect(panel.getByText(`${SAAD_BALANCE.toFixed(2)} ريال`)).toBeVisible()
  await expect(panel.getByText(`${KHALED_BALANCE.toFixed(2)} ريال`)).toBeVisible()

  // ── المعاينة قبل التنفيذ: الاتجاهان معاً ────────────────────────────────
  await panel.getByRole('button', { name: /إغلاق أغسطس 2026/ }).click()
  await expect(page.getByText(/يُرحَّل له 800\.00 ريال/)).toBeVisible()
  await expect(page.getByText(/يُرحَّل عليه 200\.00 ريال/)).toBeVisible()

  await page.getByRole('button', { name: 'تأكيد الإغلاق' }).click()
  await expect(page.getByText(/تم إغلاق أغسطس 2026/)).toBeVisible({ timeout: 15_000 })

  // ── الشهر تقدّم، والشهر المُغلق صار مذكوراً بوصفه كذلك ──────────────────
  await expect(panel.getByText(NEXT_PERIOD_LABEL, { exact: true })).toBeVisible()
  // وأغسطس صار «آخر شهر أُغلق» — المطابقة التامة تلتقطه وحده الآن، فنصّ الزرّ
  // وعنوان المصاريف صارا يحملان اسم سبتمبر.
  await expect(panel.getByText('أغسطس 2026', { exact: true })).toBeVisible()

  // ⚠️ **جوهر الاختبار كله**: نفس الرصيدين بالضبط بعد الترحيل. لو كتب الإغلاق
  // حركة واحدة من الاثنتين (تصفير بلا افتتاح، أو العكس) لتغيّر الرقم هنا —
  // وهذا هو الشكل الذي يظهر به «اختفاء مال من الدفتر» في هذا التطبيق.
  await expect(panel.getByText(`${SAAD_BALANCE.toFixed(2)} ريال`)).toBeVisible()
  await expect(panel.getByText(`${KHALED_BALANCE.toFixed(2)} ريال`)).toBeVisible()

  // ── الحالة السالبة: إعادة إغلاق نفس الشهر مرفوضة ────────────────────────
  // (القاعدة ١٨) الترحيل المزدوج يضاعف رصيد كل عضو، فلا يكفي أن ينجح المسار
  // السعيد — يجب أن يُرصد رفض التكرار فعلياً. الشهر المفتوح صار سبتمبر، فزرّ
  // الإغلاق يحمل اسمه الآن؛ ما نتحقق منه هو أن أغسطس لم يعد قابلاً للإغلاق.
  await expect(panel.getByRole('button', { name: /إغلاق أغسطس 2026/ })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: new RegExp(`إغلاق ${NEXT_PERIOD_LABEL}`) })).toBeVisible()
})

test('بطاقة المسافر في رحلة طويلة تفتح نافذة الخروج لا تأكيد الحذف المعتاد', async ({ page }) => {
  // ⚠️ هذا الاختبار يحرس **الطريق المسدود** الذي رصده المالك: أول تنفيذ كان
  // يفتح تأكيد الحذف المعتاد فيمنعه الحارس برسالة تشير لزرّ في قسم آخر.
  // سعد وحده بلا مصاريف هنا (لم يشارك في أي مصروف بعد إخراج خالد)، فبطاقته
  // تعرض زرّ الحذف أصلاً — من له مصاريف تعرض بطاقته «مربوط بمصاريف» بلا زرّ،
  // وهي قاعدة قائمة من الرحلات القياسية لا تخصّ هذه الميزة.
  await openTripAsAdmin(page, CREDS)
  await expect(page.locator('#long-term-section')).toBeVisible()

  // صفّ أزرار البطاقة مخفي حتى المرور بالفأرة (group-hover في TravelerSection.tsx)
  // — نفس ما تفعله editExpenseAmount في flows.ts قبل النقر على أزرار المصروف.
  const card = page.locator('#travelers-section div.bg-white.rounded-xl').filter({ hasText: MONA.name })
  await expect(card).toBeVisible()
  await card.hover()
  await card.getByRole('button', { name: 'حذف المسافر' }).click()

  // ⚠️ الحارس: نافذة الخروج تُفتح، **ولا** يظهر تأكيد الحذف المعتاد. غياب
  // «نعم، احذف» هو ما يُثبت أن التوجيه عمل — وجود النافذة وحده لا يميّز بينهما.
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'نعم، احذف' })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'إخراج', exact: true })).toBeVisible()
})

test('خروج منتدَب: يُمنع برصيد غير مسوّى، ويمرّ عبر «تسوية وخروج»', async ({ page }) => {
  await openTripAsAdmin(page, CREDS)

  const panel = page.locator('#long-term-section')
  await expect(panel).toBeVisible()

  // ⚠️ النص المتوقَّع «تسوية وخروج» لا «إخراج»: خالد عليه عجز، والزرّ يصف ما
  // سيحدث فعلاً. رُصد أن الصياغة المجرّدة السابقة («إخراج» للجميع) لم تكن
  // مفهومة — المالك بحث عن الميزة ولم يجدها رغم أن الزرّ أمامه.
  const khaledRow = panel.locator('li').filter({ hasText: KHALED.name })
  await khaledRow.getByRole('button', { name: 'تسوية وخروج' }).click()

  // الرسالة تسمّي المبلغ والاتجاه — هذا هو «الإرشاد» المطلوب، لا رفض غامض.
  await expect(page.getByText(/حسابه غير مسوّى/)).toBeVisible()
  await expect(page.getByText(/عليه 200\.00 ريال/)).toBeVisible()

  // زرّ التأكيد داخل النافذة يحمل نفس النص — نحصر النقر بالنافذة لا بالصف.
  await page.getByRole('dialog').getByRole('button', { name: 'تسوية وخروج' }).click()
  await expect(page.getByText(/تمت تسوية 200\.00 ريال وإخراج العضو/)).toBeVisible({ timeout: 15_000 })

  // خرج فعلاً من القائمة النشطة — حذف ليّن، فسجلّه المالي باقٍ (القاعدة ٥).
  await expect(panel.locator('li').filter({ hasText: KHALED.name })).toHaveCount(0)
})
