// 🆕 بُناة صفوف التقارير — دوال بحتة (بلا React ولا DOM) تحوّل بيانات الرحلة إلى
// جداول (صفوف خلايا) جاهزة للتصدير إلى Excel. قابلة للاختبار بالكامل عبر Vitest
// (انظر reports.test.ts). التصدير الفعلي يتم عبر utils/xlsx.ts.

import type { Expense, Traveler, TravelerBalance, Settlement } from '../types'
import { toDisplayNames } from './participants'
import { splitByShares } from './calculations'
import { downloadXlsx, type XlsxCell, type XlsxSheet } from './xlsx'

// تقريب لخانتين عشريتين مع إبقاء القيمة رقماً (لتعمل جمعيات Excel عليها).
const money = (n: number): number => Math.round(n * 100) / 100

// نص عمود "المشاركون": أسماء المشاركين، ومع التقسيم غير المتساوي يُضاف مبلغ حصة
// كل شخص بجانب اسمه (نفس ما يظهر في الواجهة).
function participantsCell(exp: Expense, travelers: Traveler[]): string {
  const names = toDisplayNames(exp.participants, travelers)
  if (!exp.shares) return names.join('، ')
  const amounts = splitByShares(exp.amount, exp.participants, exp.shares)
  return names.map((n, i) => `${n} (${(amounts[i] ?? 0).toFixed(2)})`).join('، ')
}

/** ورقة "المصاريف": صف لكل مصروف + صف إجمالي في النهاية. */
export function buildExpenseRows(expenses: Expense[], travelers: Traveler[]): XlsxCell[][] {
  const header: XlsxCell[] = ['التاريخ', 'الوصف', 'الفئة', 'المبلغ (ريال)', 'العملة', 'المبلغ الأصلي', 'المشاركون']
  const rows: XlsxCell[][] = expenses.map(e => [
    e.date,
    e.description,
    e.category || 'أخرى',
    money(e.amount),
    e.currency,
    money(e.originalAmount),
    participantsCell(e, travelers),
  ])
  const total = money(expenses.reduce((s, e) => s + e.amount, 0))
  rows.push(['الإجمالي', '', '', total, '', '', ''])
  return [header, ...rows]
}

/** ورقة "ملخص المسافرين": المودَع، نصيبه من المصاريف، المتبقي + صف إجمالي. */
export function buildTravelerRows(balances: TravelerBalance[]): XlsxCell[][] {
  const header: XlsxCell[] = ['المسافر', 'المودَع', 'نصيبه من المصاريف', 'المتبقي']
  const rows: XlsxCell[][] = balances.map(b => [b.name, money(b.deposited), money(b.totalExpenses), money(b.remaining)])
  rows.push([
    'الإجمالي',
    money(balances.reduce((s, b) => s + b.deposited, 0)),
    money(balances.reduce((s, b) => s + b.totalExpenses, 0)),
    money(balances.reduce((s, b) => s + b.remaining, 0)),
  ])
  return [header, ...rows]
}

/** ورقة "التسويات": من يدفع لمن وكم (من calculateSettlements). */
export function buildSettlementRows(settlements: Settlement[]): XlsxCell[][] {
  const header: XlsxCell[] = ['من', 'إلى', 'المبلغ (ريال)']
  if (settlements.length === 0) return [header, ['لا توجد تسويات مطلوبة — الأرصدة متساوية', '', '']]
  const rows: XlsxCell[][] = settlements.map(s => [s.fromName, s.toName, money(s.amount)])
  return [header, ...rows]
}

/** ورقة "الملخص اليومي": لكل يوم عدد المصاريف وإجماليها، مرتّبة زمنياً تصاعدياً. */
export function buildDailyRows(expenses: Expense[]): XlsxCell[][] {
  const header: XlsxCell[] = ['التاريخ', 'عدد المصاريف', 'الإجمالي (ريال)']
  const byDay = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const cur = byDay.get(e.date) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += e.amount
    byDay.set(e.date, cur)
  }
  const rows: XlsxCell[][] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => [date, v.count, money(v.total)])
  return [header, ...rows]
}

const todayStr = (): string => new Date().toISOString().split('T')[0]

// ============================================================================
// 1. الدالة الخاصة بتصدير الرحلة ككل (التي كانت مفقودة)
// ============================================================================
export interface TripExcelParams {
  expenses: Expense[]
  travelers: Traveler[]
  balances: TravelerBalance[]
  settlements: Settlement[]
}

/** يجمّع كل الأوراق ويُنزّل مصنّف Excel واحداً للرحلة. */
export function exportTripToExcel({ expenses, travelers, balances, settlements }: TripExcelParams): void {
  const sheets: XlsxSheet[] = [
    { name: 'المصاريف', rows: buildExpenseRows(expenses, travelers), rtl: true },
    { name: 'ملخص المسافرين', rows: buildTravelerRows(balances), rtl: true },
    { name: 'التسويات', rows: buildSettlementRows(settlements), rtl: true },
    { name: 'الملخص اليومي', rows: buildDailyRows(expenses), rtl: true },
  ]
  downloadXlsx(`تقرير_الرحلة_${todayStr()}.xlsx`, sheets)
}

// ============================================================================
// 2. الدالة الجديدة الخاصة بتصدير كشف حساب مسافر واحد
// ============================================================================
export interface TravelerExcelParams {
  traveler: Traveler
  balance: TravelerBalance
  statement: any // نستخدم any هنا اختصاراً، أو يمكن استيراد نوع Statement
}

/** يجمّع بيانات المسافر الفردية ويُنزّل كشف حسابه كملف Excel */
export function exportTravelerToExcel({ traveler, balance, statement }: TravelerExcelParams): void {
  // 1. بناء ورقة الخلاصة
  const summaryRows: XlsxCell[][] = [
    ['البيان', 'القيمة (ريال)'],
    ['اسم المسافر', traveler.name],
    ['إجمالي المودَع', money(balance.deposited)],
    ['نصيبه من المصاريف', money(balance.totalExpenses)],
    ['الرصيد المتبقي', money(balance.remaining)]
  ]

  // 2. بناء ورقة كشف الحساب التفصيلي
  const statementHeader: XlsxCell[] = ['التاريخ', 'الوصف', 'الفئة', 'المبلغ المخصوم (ريال)', 'الرصيد الجاري (ريال)']
  const statementRows: XlsxCell[][] = statement ? statement.rows.map((r: any) => [
    r.date,
    r.description,
    r.category,
    money(r.share),
    money(r.balanceAfter)
  ]) : []

  // 3. تجميع الأوراق وتصدير الملف
  const sheets: XlsxSheet[] = [
    { name: 'الخلاصة', rows: summaryRows, rtl: true },
    { name: 'كشف الحساب', rows: [statementHeader, ...statementRows], rtl: true }
  ]

  // استبدال المسافات في اسم المسافر بشرطة سفلية لاسم الملف
  const safeName = traveler.name.replace(/\s+/g, '_')
  downloadXlsx(`كشف_حساب_${safeName}_${todayStr()}.xlsx`, sheets)
}