import { describe, it, expect } from 'vitest'
import type { Expense, Traveler } from '../types'
import { buildTravelerReport, buildDailySummary, buildAccountStatement } from './reportData'

const ahmed: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null }
const saad:  Traveler = { id: 2, name: 'سعد',          shortName: 'سعد',  deposited: 100,  deletedAt: null }

const expenses: Expense[] = [
  { id: 'e1', date: '2026-07-10', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1, category: 'طعام وشراب' },
  { id: 'e2', date: '2026-07-10', description: 'وقود', amount: 100, originalAmount: 100, currency: 'SAR', exchangeRate: 1, participants: [1],    createdAt: 2, category: 'مواصلات' },
  { id: 'e3', date: '2026-07-11', description: 'فندق', amount: 300, originalAmount: 80,  currency: 'USD', exchangeRate: 3.75, participants: [1, 2], createdAt: 3, category: 'إقامة' },
]

describe('buildTravelerReport', () => {
  it('lists only expenses the traveler is part of, with their share', () => {
    const rep = buildTravelerReport(ahmed, expenses)
    // أحمد شارك في الثلاثة: 100 + 100 + 150 = 350
    expect(rep.lines).toHaveLength(3)
    expect(rep.totalShare).toBe(350)
  })

  it('excludes expenses the traveler is not part of', () => {
    const rep = buildTravelerReport(saad, expenses)
    // سعد شارك في e1 و e3 فقط: 100 + 150 = 250
    expect(rep.lines.map(l => l.id).sort()).toEqual(['e1', 'e3'])
    expect(rep.totalShare).toBe(250)
  })

  it('sorts lines newest first', () => {
    const rep = buildTravelerReport(ahmed, expenses)
    expect(rep.lines[0].date).toBe('2026-07-11')
  })
})

describe('buildDailySummary', () => {
  it('aggregates per day with a running cumulative total', () => {
    const rows = buildDailySummary(expenses)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ date: '2026-07-10', count: 2, total: 300, cumulative: 300 })
    expect(rows[1]).toEqual({ date: '2026-07-11', count: 1, total: 300, cumulative: 600 })
  })
})

describe('buildAccountStatement', () => {
  it('runs a chronological balance from the deposit down to remaining', () => {
    const st = buildAccountStatement(1000, ahmed, expenses)
    expect(st.opening).toBe(1000)
    expect(st.totalShare).toBe(350)
    expect(st.remaining).toBe(650)
    // مرتّب زمنياً بـ createdAt تصاعدياً: e1(100)→900، e2(100)→800، e3(150)→650
    expect(st.rows.map(r => r.balanceAfter)).toEqual([900, 800, 650])
    expect(st.rows[0].id).toBe('e1')
    expect(st.rows[2].id).toBe('e3')
  })

  it('handles a traveler in only some expenses', () => {
    const st = buildAccountStatement(100, saad, expenses)
    // سعد: e1(100)→0، e3(150)→-150
    expect(st.rows.map(r => r.balanceAfter)).toEqual([0, -150])
    expect(st.remaining).toBe(-150)
  })
})
