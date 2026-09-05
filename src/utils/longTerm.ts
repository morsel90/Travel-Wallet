// 🆕 منطق الرحلات طويلة المدى — دوال نقية بلا React ولا Firestore.
//
// ما في هذا الملف **معاينة وتفسير، لا تنفيذ**:
//   • planRollover تُجيب «ماذا سيحدث لو أُغلق الشهر الآن؟» لعرضه للمنظّم قبل
//     أن يضغط. الخطة المنفَّذة فعلاً تُحسب من جديد داخل closeMonth
//     (functions/index.js) على بيانات الخادم لحظة التنفيذ — لا تُرسَل من هنا،
//     وإلا لأصبح المتصفح قادراً على إملاء حركات مالية.
//   • describeExitBlock تشرح لماذا لا يُخرَج عضو، ونصّها هو ما يراه المنظّم.
//     المنع نفسه يقع خادمياً في exitTraveler، لا هنا.
//
// ⚠️ ولهذا فإن أي اختلاف بين هذا الملف ونظيره الخادمي يظهر كمعاينة تخالف
// النتيجة — مزعج، لا خطر. أما العكس (الاعتماد على هذا الملف كحارس) فثغرة.
import type { TravelerBalance, RolloverMovement, TripType, Expense, PeriodKey } from '../types'
import { isInPeriod, periodStartDate, periodEndDate, nextPeriod, previousPeriod } from './period'

/**
 * هللة واحدة — نفس عتبة calculateSettlements بالضبط، وللسبب نفسه: أرصدة شبه
 * صفرية ناتجة عن تقريب الفاصلة العائمة ليست ديوناً حقيقية. توحيد العتبة مقصود:
 * عضو «مسوّى» في شاشة التسويات يجب أن يكون «مسوّى» عند الإغلاق والخروج أيضاً،
 * وإلا رأى المنظّم رصيد صفر في مكان ومنعاً من الخروج في مكان آخر.
 */
export const ROLLOVER_EPSILON = 0.01

/**
 * فئة مصاريف التسوية الشهرية — قيمة `Expense.category` لكل مصروف تكتبه
 * closeMonth. ليست من EXPENSE_CATEGORIES في constants.ts عمداً: تلك قائمة
 * *اختيار المستخدم* في نموذج المصروف، وهذه فئة لا يكتبها إنسان أبداً. وجودها
 * كفئة مستقلة هو ما يجعل مصاريف الترحيل قابلة للتمييز في الرسم البياني وفي
 * أي تدقيق لاحق دون أي حقل جديد في مخطط المصروف — ولا تغيير في firestore.rules.
 */
export const ROLLOVER_CATEGORY = 'تسوية شهرية'

/** اتجاه رصيد واحد عند الإغلاق — منطق واحد يشترك فيه الترحيل والخروج. */
export function settlementDirection(remaining: number): RolloverMovement['direction'] {
  // غير المنتهي يُعامَل كمسوّى (القاعدة ١٩): رصيد لا يُقرأ لا تُبنى عليه حركة مالية.
  if (!Number.isFinite(remaining) || Math.abs(remaining) <= ROLLOVER_EPSILON) return 'settled'
  return remaining > 0 ? 'credit' : 'debt'
}

/**
 * معاينة ترحيل الشهر: حركة لكل مسافر نشط، بحسب رصيده الحالي.
 *
 * ⚠️ يُبنى على `remaining` من calculateBalances — أي الرصيد **التراكمي** لا
 * رصيد الشهر وحده، وهذا صحيح لا سهو: الإغلاق يُصفّر الرصيد ثم يعيد فتحه بنفس
 * القيمة، فمجموع الحركتين على الدفتر الكلّي صفر. أي أن الرصيد التراكمي *هو*
 * رصيد الشهر الجاري في رحلة تُغلق شهورها بانتظام — والشهر المنتهي وحده هو ما
 * يظهر مصفَّراً عند تصفية المصاريف بتاريخه.
 */
export function planRollover(balances: TravelerBalance[]): RolloverMovement[] {
  return balances.map(b => ({
    travelerId:   b.id,
    travelerName: b.name,
    remaining:    Number.isFinite(b.remaining) ? b.remaining : 0,
    direction:    settlementDirection(b.remaining),
  }))
}

/** عدد الحركات التي ستُكتب فعلاً — من رصيده صفر لا يُكتب له شيء. */
export function countRolloverMovements(movements: RolloverMovement[]): number {
  return movements.filter(m => m.direction !== 'settled').length
}

/**
 * مصاريف *حقيقية* لشهر واحد: مؤرَّخة داخله، وليست مصروف تسوية كتبه closeMonth
 * نفسه (ROLLOVER_CATEGORY). الاستبعاد مقصود لا سهو — مصروف الترحيل يُصفّر
 * رصيد شهر منتهٍ أو يفتح عجزاً موروثاً في شهر جديد، وكلاهما محاسبة إغلاق لا
 * إنفاق فعلي، فحسابه ضمن «مصاريف هذا الشهر» يُضاعف نفس المبلغ الذي أنتجه هو.
 *
 * ⚠️ هذه هي «الدورة الحالية» في كل مكان يعرضها (الهيدر، «الشهر المحاسبي») —
 * قيمة واحدة، لا حسابان قد ينحرف أحدهما عن الآخر.
 */
export function filterCycleExpenses<T extends Pick<Expense, 'date' | 'category'>>(
  expenses: T[],
  period: PeriodKey,
): T[] {
  return expenses.filter(e => e.category !== ROLLOVER_CATEGORY && isInPeriod(e.date, period))
}

/**
 * محفظة الدورة = الرصيد المتبقي (التراكمي) + مصاريف الدورة الحقيقية. لا مصدر
 * مالي جديد: بما أن «المتبقي» التراكمي *هو* متبقي الدورة الحالية أصلاً (انظر
 * أعلى الملف)، فمحفظتها تُشتق منه جبرياً — رصيد افتتاحي مُرحَّل + أي إيداع
 * جديد هذا الشهر، بلا حاجة لتأريخ الإيداعات (غير متاح اليوم في المخطط).
 * الطرح دائماً يُعيد "متبقي" نفسه، مهما بدا الرقمان — وهذا هو الاتساق المطلوب.
 */
export function calculateCycleWallet(cumulativeRemaining: number, cycleSpent: number): number {
  return cumulativeRemaining + cycleSpent
}

/**
 * رصيد مسافر عند حدّ إغلاق فعلي بين شهرين متتاليين — **قراءة مباشرة لمصروف
 * الترحيل الذي كتبه closeMonth فعلاً، لا إعادة بناء من deposited/سجلّات
 * الإيداع.** deposited على مستند المسافر تراكميّ بلا تأريخ (انظر تعليق
 * calculateCycleWallet)، فلا سبيل لمعرفة قيمته «عند لحظة ماضية» منه وحده.
 * لكن closeMonth يترك أثراً مؤرَّخاً بصيغة Expense.date (نصّية، لا التباس
 * منطقة زمنية) لكل تحويل فعلي:
 *   • رصيد دائن أُغلق به `before` → مصروف ترحيل بتاريخ periodEndDate(before).
 *   • عجز افتُتح به `after`      → مصروف ترحيل بتاريخ periodStartDate(after).
 * فحص كِلا التاريخين كافٍ لمعرفة الرصيد عند تلك اللحظة تحديداً بلا افتراض.
 *
 * @returns +المبلغ (دائن أُغلق)، −المبلغ (عجز افتُتح)، أو null إن لم يُعثر
 *          على أثر إغلاق بين الفترتين لهذا المسافر (لم يُغلق `before` بعد،
 *          أو كان رصيده مسوّى صفراً عند الإغلاق فلم يُكتب له مصروف أصلاً).
 */
export function boundaryRolloverAmount(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  before: PeriodKey,
  after: PeriodKey,
): number | null {
  const isOwnRollover = (e: typeof expenses[number]): boolean =>
    e.category === ROLLOVER_CATEGORY && e.participants.length === 1 && e.participants[0] === travelerId

  const closingEntry = expenses.find(e => isOwnRollover(e) && e.date === periodEndDate(before))
  if (closingEntry) return Number.isFinite(closingEntry.amount) ? closingEntry.amount : 0

  const openingEntry = expenses.find(e => isOwnRollover(e) && e.date === periodStartDate(after))
  if (openingEntry) return -(Number.isFinite(openingEntry.amount) ? openingEntry.amount : 0)

  return null
}

/**
 * رصيد افتتاح الدورة `period` لمسافر — أي رصيده فور بدئها (قبل أي نشاط
 * حقيقي فيها)، مقروءاً من حدّ الإغلاق بينها وبين الدورة السابقة.
 *
 * ⚠️ **غياب مصروف الترحيل عند الحدّ لا يعني تلقائياً «لا معلومة».** closeMonth
 * لا يكتب شيئاً لمسافر رصيده مسوّى (صفر) أصلاً عند الإغلاق — فذاك افتتاح
 * بصفر معروف بيقين، لا مجهول. `lastClosedPeriod` (من مستند الرحلة) هو الفيصل:
 * إن كانت الدورة السابقة *أُغلقت* فعلاً (`lastClosedPeriod >= previousPeriod`)
 * ولم يُعثر على مصروف ترحيل، فالافتتاح صفر معروف. الفرق بين «افتتح بصفر فعلاً»
 * و«لا معلومة» (أول دورة في الرحلة، أو دورة سابقة لم تُغلق بعد) مهمّ في تقرير
 * مالي، فلا يُطمَس أحدهما بالآخر — ولا يُستنتَج «صفر» من مجرّد غياب حركة.
 */
export function periodOpeningBalance(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  period: PeriodKey,
  lastClosedPeriod: PeriodKey | null,
): number | null {
  const before = previousPeriod(period)
  const boundary = boundaryRolloverAmount(travelerId, expenses, before, period)
  if (boundary !== null) return boundary
  return lastClosedPeriod !== null && lastClosedPeriod >= before ? 0 : null
}

/**
 * رصيد إغلاق الدورة `period` لمسافر — المبلغ الذي رُحِّل فعلاً إلى الدورة
 * التالية عند إغلاقها. null إن لم تُغلق `period` بعد (بينها ما زالت مفتوحة،
 * استخدم الرصيد المتبقي التراكمي الحيّ بدل هذه الدالة لعرض حالتها الحالية).
 * انظر تعليق periodOpeningBalance لماذا الغياب وحده لا يكفي — نفس المبدأ هنا.
 */
export function periodClosingBalance(
  travelerId: number,
  expenses: Pick<Expense, 'date' | 'category' | 'participants' | 'amount'>[],
  period: PeriodKey,
  lastClosedPeriod: PeriodKey | null,
): number | null {
  const boundary = boundaryRolloverAmount(travelerId, expenses, period, nextPeriod(period))
  if (boundary !== null) return boundary
  return lastClosedPeriod !== null && lastClosedPeriod >= period ? 0 : null
}

/**
 * هل يجوز إخراج هذا العضو من الرحلة؟ — يُرجع نصّ المنع أو null إن كان مسموحاً.
 *
 * ⚠️ **مقصور على الرحلات طويلة المدى عمداً.** الرحلة القياسية تنتهي بتسوية
 * واحدة لكل المشاركين، ونقل مسافر للسلة فيها سلوك ناضج ومستقر منذ البداية —
 * إضافة شرط رصيد عليه تغيّر سلوكاً قائماً بلا طلب. أما الانتداب الطويل فخروج
 * فرد منه حدث اعتيادي متكرّر، ورصيده لا يُسوّى تلقائياً بانتهاء شيء.
 */
export function describeExitBlock(
  tripType: TripType,
  travelerName: string,
  remaining: number,
): string | null {
  if (tripType !== 'long_term') return null
  const direction = settlementDirection(remaining)
  if (direction === 'settled') return null

  const amount = Math.abs(remaining).toFixed(2)
  return direction === 'credit'
    ? `لا يمكن إخراج ${travelerName} قبل تسوية حسابه — له رصيد متبقٍّ ${amount} ريال. أنشئ معاملة تسوية (إعادة المبلغ له) لتصفير الرصيد أولاً، أو استخدم «تسوية وخروج».`
    : `لا يمكن إخراج ${travelerName} قبل تسوية حسابه — عليه ${amount} ريال. أنشئ معاملة تسوية (استلام المبلغ منه) لتصفير الرصيد أولاً، أو استخدم «تسوية وخروج».`
}

/**
 * هل يجوز إخراج هذا العضو إن كان هو منظّم الرحلة؟ — يُرجع نصّ المنع أو null.
 *
 * ⚠️ **منفصل عمداً عن describeExitBlock أعلاه.** ذاك يُحلّ بتسوية الرصيد ضمن
 * نفس عملية الخروج؛ هذا لا تحلّه تسوية أي رصيد — البنك الذي تصل له كل
 * التحويلات (BankDetailsCard عبر users/{organizerUid}) يبقى بنكه حتى بعد
 * خروجه من دفتر المسافرين، فلا معنى لإخراجه قبل تعيين منظّم آخر مكانه صراحة.
 *
 * ⚠️ **نصّ الإرشاد يجب أن يطابق تسميات الواجهة حرفياً.** كان يحيل إلى «تبويب
 * الأعضاء في إدارة الرحلة» — وكلاهما لم يعد موجوداً: «الأعضاء» دُمج في
 * «المسافرون» و«إدارة الرحلات» حُذفت (انظر CHANGELOG 2026-08-29)، فبقيت
 * الرسالة تُرشد إلى مكان محذوف. الاختبارات لم تكشفه لأنها كانت تفحص ورود اسم
 * المسافر وحده. رسالة منع بالذات لا تُقرأ إلا لحظة الحاجة، فإرشادها الخاطئ
 * يترك القارئ عالقاً بلا مخرج — ولهذا يثبّت الاختبار الآن أسماء التبويب والزرّ
 * كما تظهر في TripDetailPanel.tsx، لا مجرّد كون الرسالة غير فارغة.
 *
 * وذكر شرط ربط الحساب مقصود: زرّ «تعيين منظّماً» يُعرض لعضو له حساب مرتبط
 * فقط، فمن يبحث عنه عند مسافر مسجَّل يدوياً لن يجده ولا شيء يفسّر له لماذا.
 */
export function describeOrganizerExitBlock(
  travelerUid: string | null | undefined,
  organizerUid: string | null | undefined,
  travelerName: string,
): string | null {
  if (!travelerUid || !organizerUid || travelerUid !== organizerUid) return null
  return `لا يمكن إخراج ${travelerName} — هو منظّم الرحلة، والتحويلات البنكية تصل لحسابه حالياً. عيّن منظّماً آخر أولاً: «تعديل الرحلة» من اسم الرحلة في الأعلى ← تبويب «المسافرون» ← «تعيين منظّماً». الزرّ يظهر لمن ربط حسابه فقط.`
}
