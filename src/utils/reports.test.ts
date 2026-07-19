import { describe, it, expect } from 'vitest'
import type { Expense, Traveler } from '../types'
import { calculateBalances, calculateSettlements } from './calculations'
import {
  buildExpenseRows,
  buildTravelerRows,
  buildSettlementRows,
  buildDailyRows,
} from './reports'
import { buildXlsxBytes } from './xlsx'

const travelers: Traveler[] = [
  { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null },
  { id: 2, name: 'سعد',          shortName: 'سعد',  deposited: 100,  deletedAt: null },
]

const expenses: Expense[] = [
  { id: 'e1', date: '2026-07-10', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1, category: 'طعام وشراب' },
  { id: 'e2', date: '2026-07-10', description: 'وقود', amount: 100, originalAmount: 100, currency: 'SAR', exchangeRate: 1, participants: [1],    createdAt: 2, category: 'مواصلات' },
  { id: 'e3', date: '2026-07-11', description: 'فندق', amount: 300, originalAmount: 80,  currency: 'USD', exchangeRate: 3.75, participants: [1, 2], createdAt: 3, category: 'إقامة' },
]

describe('buildExpenseRows', () => {
  it('header + one row per expense + totals row', () => {
    const rows = buildExpenseRows(expenses, travelers)
    expect(rows).toHaveLength(1 + expenses.length + 1)
    expect(rows[0]).toEqual(['التاريخ', 'الوصف', 'الفئة', 'المبلغ (ريال)', 'العملة', 'المبلغ الأصلي', 'المشاركون'])
    // صف المصروف الأول: التاريخ/الوصف/الفئة/المبلغ
    expect(rows[1][0]).toBe('2026-07-10')
    expect(rows[1][3]).toBe(200)
    // صف الإجمالي الأخير = مجموع كل المبالغ بالريال
    expect(rows[rows.length - 1][0]).toBe('الإجمالي')
    expect(rows[rows.length - 1][3]).toBe(600)
  })

  it('participants cell lists names for equal split', () => {
    const rows = buildExpenseRows(expenses, travelers)
    expect(String(rows[1][6])).toContain('أحمد')
    expect(String(rows[1][6])).toContain('سعد')
  })
})

describe('buildDailyRows', () => {
  it('groups by date ascending with count and daily total', () => {
    const rows = buildDailyRows(expenses)
    expect(rows[0]).toEqual(['التاريخ', 'عدد المصاريف', 'الإجمالي (ريال)'])
    expect(rows[1]).toEqual(['2026-07-10', 2, 300])
    expect(rows[2]).toEqual(['2026-07-11', 1, 300])
  })
})

describe('buildTravelerRows', () => {
  it('per-traveler deposited/spent/remaining + totals', () => {
    const balances = calculateBalances(travelers, expenses)
    const rows = buildTravelerRows(balances)
    expect(rows[0]).toEqual(['المسافر', 'المودَع', 'نصيبه من المصاريف', 'المتبقي'])
    // أحمد: أودع 1000، نصيبه 350 (100+100+150)، المتبقي 650
    expect(rows[1]).toEqual(['أحمد الغامدي', 1000, 350, 650])
    // سعد: أودع 100، نصيبه 250 (100+150)، المتبقي -150
    expect(rows[2]).toEqual(['سعد', 100, 250, -150])
    // صف الإجمالي
    expect(rows[3]).toEqual(['الإجمالي', 1100, 600, 500])
  })
})

describe('buildSettlementRows', () => {
  it('shows who pays whom', () => {
    const balances = calculateBalances(travelers, expenses)
    const settlements = calculateSettlements(balances)
    const rows = buildSettlementRows(settlements)
    expect(rows[0]).toEqual(['من', 'إلى', 'المبلغ (ريال)'])
    // سعد مدين بـ 150 لأحمد
    expect(rows[1][0]).toBe('سعد')
    expect(rows[1][1]).toBe('أحمد')
    expect(rows[1][2]).toBe(150)
  })

  it('renders a friendly row when nothing to settle', () => {
    const rows = buildSettlementRows([])
    expect(rows).toHaveLength(2)
    expect(String(rows[1][0])).toContain('لا توجد تسويات')
  })
})

describe('buildXlsxBytes', () => {
  it('produces a non-empty ZIP (starts with the PK signature)', () => {
    const bytes = buildXlsxBytes([{ name: 'ورقة', rows: [['أ', 1], ['ب', 2]], rtl: true }])
    expect(bytes.length).toBeGreaterThan(0)
    // توقيع ZIP المحلي: 0x50 0x4B ('P' 'K')
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })
})
