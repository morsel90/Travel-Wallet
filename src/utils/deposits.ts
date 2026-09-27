// ─── دفتر الإيداعات — دوال نقية ──────────────────────────────────────────────
// `deposited` هو الطرف الدائن الوحيد في الدفتر، فكل كتابة فيه يجب أن تُخلّف
// سطراً في `depositLogs`. استُخرج هنا ليصير «الرصيد = مجموع الحركات» قابلاً للاختبار.
import type { DepositLogEntry, DepositMode } from '../types'

/**
 * يطبّق حركة إيداع على رصيد قائم ويُعيد الرصيد الجديد.
 *
 * ⚠️ `subtract` تُقصَر عند الصفر عمداً (المَدين يظهر في `remaining` لا هنا)،
 * فـ`delta` يُشتق من الفرق الفعلي بين الرصيدين لا من المبلغ المُدخَل.
 */
export function applyDepositMode(previous: number, mode: DepositMode, amount: number): number {
  // ⚠️ القاعدة ١٩ — حارسان لا يُدمجان: رصيد سابق تالف يُقرأ صفراً وتُطبَّق
  // الحركة عليه (لا نُسقط حركة صحيحة عقوبةً على فساد قديم)، أما مبلغ تالف
  // فلا حركة أصلاً.
  const safePrevious = Number.isFinite(previous) ? previous : 0
  if (!Number.isFinite(amount)) return safePrevious

  if (mode === 'set')      return Math.max(0, amount)
  if (mode === 'subtract') return Math.max(0, safePrevious - amount)
  return safePrevious + amount
}

/**
 * يعيد تشغيل سجلّ الإيداعات من الصفر. إن خالف الناتجُ `traveler.deposited`
 * فهناك تغيّر في الرصيد لم يُوثَّق.
 *
 * ⚠️ يُرتَّب بـ `createdAt`: `mode: 'set'` يُلغي ما قبله، فالترتيب يغيّر النتيجة.
 */
export function replayDepositLogs(logs: DepositLogEntry[]): number {
  return [...logs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .reduce((balance, log) => applyDepositMode(balance, log.mode, modeAmount(log)), 0)
}

/** المبلغ المُدخَل في حركةٍ ما. لا يُستعمل `delta` لأن القصر عند الصفر يصغّره. */
function modeAmount(log: DepositLogEntry): number {
  if (log.mode === 'set')      return log.newDeposited
  if (log.mode === 'subtract') return log.previousDeposited - log.newDeposited
  return log.newDeposited - log.previousDeposited
}

/** نص السبب المستخدم للرصيد الابتدائي — مشترك بين الكاتب والاختبارات. */
export const INITIAL_DEPOSIT_REASON = 'رصيد ابتدائي عند إضافة المسافر'
