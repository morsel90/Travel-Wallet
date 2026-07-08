import type { Expense, Traveler } from '../types'
import { toDisplayNames } from './participants'
import { splitByShares } from './calculations'

// ─── تصدير المصاريف إلى CSV ──────────────────────────────────────────────────
// 🆕 استُخرجت من App.tsx (كانت exportCSV) لتقليل حجمه — دالة بحتة لا تعتمد على
// React، تُبنى وتُنزَّل الملف مباشرة عبر رابط Blob مؤقت. \uFEFF (BOM) في البداية
// ضروري لعرض النص العربي بشكل صحيح عند فتح الملف في Excel.

/**
 * 🆕 يحوّل قائمة المشاركين لنص واحد لعمود "المشاركون" — إن كان المصروف بتقسيم
 * غير متساوٍ (exp.shares)، يُضاف مبلغ حصة كل شخص بجانب اسمه (نفس ما يظهر في
 * الواجهة، انظر ExpenseSection.tsx) بدل قائمة أسماء مجرّدة.
 */
function formatParticipantsCell(exp: Expense, travelers: Traveler[]): string {
  const names = toDisplayNames(exp.participants, travelers)
  if (!exp.shares) return names.join(' | ')
  const shareAmounts = splitByShares(exp.amount, exp.participants, exp.shares)
  return names.map((name, i) => `${name} (${(shareAmounts[i] ?? 0).toFixed(2)})`).join(' | ')
}

/** يبني ملف CSV لقائمة المصاريف المُمرَّرة (عادة activeExpenses) وينزّله فوراً. */
export function exportExpensesToCSV(expenses: Expense[], travelers: Traveler[]): void {
  const header = ['التاريخ', 'الوصف', 'الفئة', 'المبلغ (ريال)', 'العملة الأصلية', 'المبلغ الأصلي', 'المشاركون']
  const rows = expenses.map(exp => [
    exp.date, exp.description, exp.category || 'أخرى', exp.amount.toFixed(2),
    exp.currency, exp.originalAmount.toFixed(2),
    formatParticipantsCell(exp, travelers),
  ])
  const csv = [header, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `مصاريف_الرحلة_${new Date().toISOString().split('T')[0]}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}
