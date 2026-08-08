import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBalances } from './useBalances'
import { calculateBalances, calculateTotalSpent, calculateTotalDeposited } from '../utils/calculations'
import type { Traveler, Expense } from '../types'

const travelers: Traveler[] = [
  { id: 1, name: 'محمد العاثم', shortName: 'محمد', deposited: 1000, deletedAt: null },
  { id: 2, name: 'عيسى آل شبير', shortName: 'عيسى', deposited: 500, deletedAt: null },
]

const expenses: Expense[] = [
  {
    id: 'e1', date: '2026-08-01', description: 'عشاء', amount: 300, originalAmount: 300,
    currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 1,
  },
]

describe('useBalances', () => {
  it('يُرجع نفس نتيجة calculateBalances/calculateTotalSpent/calculateTotalDeposited مباشرة', () => {
    const { result } = renderHook(() => useBalances(travelers, expenses))

    expect(result.current.balances).toEqual(calculateBalances(travelers, expenses))
    expect(result.current.totalSpent).toBe(calculateTotalSpent(expenses))
    expect(result.current.totalDeposited).toBe(calculateTotalDeposited(travelers))
  })

  it('totalRemaining = totalDeposited - totalSpent', () => {
    const { result } = renderHook(() => useBalances(travelers, expenses))
    expect(result.current.totalRemaining).toBe(result.current.totalDeposited - result.current.totalSpent)
  })

  it('يتعامل مع قوائم فارغة دون أخطاء', () => {
    const { result } = renderHook(() => useBalances([], []))
    expect(result.current.balances).toEqual([])
    expect(result.current.totalSpent).toBe(0)
    expect(result.current.totalDeposited).toBe(0)
    expect(result.current.totalRemaining).toBe(0)
  })

  it('لا يعيد حساب النتيجة (نفس المرجع) عند إعادة العرض بنفس المدخلات', () => {
    const { result, rerender } = renderHook(
      ({ t, e }) => useBalances(t, e),
      { initialProps: { t: travelers, e: expenses } }
    )
    const first = result.current
    rerender({ t: travelers, e: expenses }) // نفس مراجع المصفوفات بالضبط
    expect(result.current).toBe(first) // useMemo يجب ألا يعيد الحساب
  })

  it('يعيد الحساب عند تغيّر مرجع travelers أو expenses', () => {
    const { result, rerender } = renderHook(
      ({ t, e }) => useBalances(t, e),
      { initialProps: { t: travelers, e: expenses } }
    )
    const first = result.current
    rerender({ t: [...travelers], e: expenses })
    expect(result.current).not.toBe(first)
    expect(result.current).toEqual(first) // القيمة نفسها منطقياً، لكن أُعيد حسابها
  })
})
