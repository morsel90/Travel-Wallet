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
import type { TravelerBalance, RolloverMovement, TripType } from '../types'

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
