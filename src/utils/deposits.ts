// ─── دفتر الإيداعات — دوال نقية ──────────────────────────────────────────────
//
// `deposited` هو **الطرف الدائن الوحيد في الدفتر**: المصاريف تُنقص، ولا شيء
// يزيد سواه. فكل كتابة فيه حركة مالية، ويجب أن تُخلّف سطراً في `depositLogs`.
//
// وُجد هذا الملف لسبب محدد: الاتساق المحاسبي — «الرصيد الحالي = مجموع الحركات
// الموثّقة» — لم يكن **قابلاً للاختبار أصلاً**، لأن منطق تطبيق الحركة كان
// مدفوناً داخل معالج نموذج في hook. استخراجه هنا هو ما يجعل القاعدة قابلة
// للإثبات بدل أن تبقى نيّة مكتوبة في تعليق.
import type { DepositLogEntry, DepositMode } from '../types'

/**
 * يطبّق حركة إيداع على رصيد قائم ويُعيد الرصيد الجديد.
 *
 * ⚠️ `subtract` **تُقصَر عند الصفر** (`Math.max`) — وهذا سلوك قائم منذ البداية
 * ومقصود: الرصيد المُودَع لا يصير سالباً، فالمَدين يظهر في `remaining` لا هنا.
 * وأثره أن `delta` قد لا يساوي `-amount` عند القصر — ولهذا يُشتق `delta` من
 * الفرق الفعلي بين الرصيدين لا من المبلغ المُدخَل، وإلا انكسر الاتساق المحاسبي
 * في أول عملية خصم تتجاوز الرصيد.
 */
export function applyDepositMode(previous: number, mode: DepositMode, amount: number): number {
  // القاعدة ١٩ — وحارسان مختلفان لا حارس واحد:
  //
  //   • **الرصيد السابق** غير المنتهي مستندٌ تالف في قاعدة البيانات، فيُقرأ
  //     كصفر ثم **تُطبَّق العملية عليه** — نفس معالجة calculateBalances. إلغاء
  //     العملية هنا يعني أن إضافة ٣٠٠ إلى رصيد تالف تُنتج صفراً لا ٣٠٠، أي
  //     نُسقط حركة صحيحة عقوبةً على فساد سابق.
  //   • **المبلغ** غير المنتهي مدخلٌ فاسد الآن، فلا عملية أصلاً — يبقى الرصيد
  //     على حاله المطهَّر بدل تسميمه.
  //
  // ⚠️ دمجهما في شرط واحد كان أول ما كتبتُه، وكشفه اختبار «رصيد سابق غير منتهٍ
  // يُعامَل كصفر»: الاسم يصف السلوك الصحيح والتنفيذ كان يخالفه.
  const safePrevious = Number.isFinite(previous) ? previous : 0
  if (!Number.isFinite(amount)) return safePrevious

  if (mode === 'set')      return Math.max(0, amount)
  if (mode === 'subtract') return Math.max(0, safePrevious - amount)
  return safePrevious + amount
}

/**
 * يعيد تشغيل سجلّ الإيداعات من الصفر ويُعيد الرصيد الناتج.
 *
 * هذه هي **الحلقة التي تُغلق التدقيق**: إن خالف الناتجُ `traveler.deposited`
 * فهناك تغيّر في الرصيد لم يُوثَّق — وهو بالضبط ما كان يسمح به إنشاء المسافر
 * برصيد ابتدائي قبل 2026-08-14.
 *
 * ⚠️ يُرتَّب بـ `createdAt` لا بترتيب الوصول: `mode: 'set'` يُلغي كل ما قبله،
 * فقراءة السجلّات بترتيب مختلف تُنتج رصيداً مختلفاً تماماً.
 */
export function replayDepositLogs(logs: DepositLogEntry[]): number {
  return [...logs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .reduce((balance, log) => applyDepositMode(balance, log.mode, modeAmount(log)), 0)
}

/**
 * المبلغ الذي أُدخل في حركةٍ ما، مستنتجاً من السطر المحفوظ.
 *
 * `set` تحفظ القيمة النهائية، و`add`/`subtract` تحفظان الفرق — و`delta` وحده
 * لا يكفي لإعادة التشغيل لأن القصر عند الصفر يجعله أصغر من المُدخَل. لذا نعيد
 * البناء من `newDeposited` مباشرةً حيث أمكن.
 */
function modeAmount(log: DepositLogEntry): number {
  if (log.mode === 'set')      return log.newDeposited
  if (log.mode === 'subtract') return log.previousDeposited - log.newDeposited
  return log.newDeposited - log.previousDeposited
}

/** نص السبب المستخدم للرصيد الابتدائي — مشترك بين الكاتب والاختبارات. */
export const INITIAL_DEPOSIT_REASON = 'رصيد ابتدائي عند إضافة المسافر'
