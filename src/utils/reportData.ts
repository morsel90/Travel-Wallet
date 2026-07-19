// 🆕 دوال بيانات التقارير للعرض على الشاشة — بحتة (بلا React/DOM) وقابلة للاختبار.
// تكمّل reports.ts (الذي يبني صفوف Excel)، لكن هذه تُعيد كائنات مُهيكلة تناسب
// عرض واجهة صفحة التقارير (ReportsView).

import type { Expense, Traveler } from '../types'
import { splitByShares } from './calculations'
import { matchesTraveler } from './participants'

export interface TravelerReportLine {
  id: string
  date: string
  description: string
  category: string
  share: number
}

export interface TravelerReport {
  lines: TravelerReportLine[]
  totalShare: number
}

/**
 * تقرير مسافر واحد: قائمة المصاريف التي شارك فيها مع مبلغ حصّته من كلٍّ منها
 * (بنفس منطق splitByShares المستخدم في الحسابات والواجهة)، ومجموع حصصه.
 * الأسطر مرتّبة من الأحدث للأقدم.
 */
export function buildTravelerReport(traveler: Traveler, expenses: Expense[]): TravelerReport {
  const lines: TravelerReportLine[] = []
  let totalShare = 0

  for (const exp of expenses) {
    if (exp.participants.length === 0) continue
    const idx = exp.participants.findIndex(p => matchesTraveler(traveler, p))
    if (idx === -1) continue
    const shares = splitByShares(exp.amount, exp.participants, exp.shares)
    const share = shares[idx] ?? 0
    lines.push({
      id: exp.id,
      date: exp.date,
      description: exp.description,
      category: exp.category || 'أخرى',
      share,
    })
    totalShare += share
  }

  lines.sort((a, b) => b.date.localeCompare(a.date))
  return { lines, totalShare }
}

export interface DailySummaryRow {
  date: string
  count: number
  total: number
  cumulative: number
}

/**
 * ملخص يومي: لكل يوم عدد المصاريف وإجماليها، مع المجموع التراكمي حتى ذلك اليوم.
 * مرتّب زمنياً تصاعدياً.
 */
export function buildDailySummary(expenses: Expense[]): DailySummaryRow[] {
  const byDay = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const cur = byDay.get(e.date) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += e.amount
    byDay.set(e.date, cur)
  }
  let cumulative = 0
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      cumulative += v.total
      return { date, count: v.count, total: v.total, cumulative }
    })
}

export interface StatementRow {
  id: string
  date: string
  description: string
  category: string
  share: number
  balanceAfter: number
}

export interface AccountStatement {
  opening: number
  rows: StatementRow[]
  totalShare: number
  remaining: number
}

/**
 * كشف حساب مسافر: يبدأ من رصيده المُودَع (opening) ثم يخصم حصّته من كل مصروف
 * شارك فيه بترتيب زمني تصاعدي (حسب createdAt)، مع رصيد جارٍ (balanceAfter) بعد
 * كل عملية. الرصيد النهائي = remaining = المُودَع − إجمالي الحصص. يعامل الرصيد
 * المُودَع كأنه متوفّر من بداية الرحلة (النمط المعتاد للدفع المسبق).
 */
export function buildAccountStatement(deposited: number, traveler: Traveler, expenses: Expense[]): AccountStatement {
  const mine = expenses
    .map(exp => {
      if (exp.participants.length === 0) return null
      const idx = exp.participants.findIndex(p => matchesTraveler(traveler, p))
      if (idx === -1) return null
      const share = splitByShares(exp.amount, exp.participants, exp.shares)[idx] ?? 0
      return { exp, share }
    })
    .filter((x): x is { exp: Expense; share: number } => x !== null)
    .sort((a, b) => a.exp.createdAt - b.exp.createdAt)

  let balance = deposited
  const rows: StatementRow[] = mine.map(({ exp, share }) => {
    balance -= share
    return {
      id: exp.id,
      date: exp.date,
      description: exp.description,
      category: exp.category || 'أخرى',
      share,
      balanceAfter: balance,
    }
  })

  const totalShare = mine.reduce((s, m) => s + m.share, 0)
  return { opening: deposited, rows, totalShare, remaining: deposited - totalShare }
}
