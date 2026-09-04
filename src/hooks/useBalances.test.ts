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

  it('totalRemaining = totalDeposited - totalSpent (بلا أي مصروف مدفوع من جيب)', () => {
    const { result } = renderHook(() => useBalances(travelers, expenses))
    expect(result.current.totalRemaining).toBe(result.current.totalDeposited - result.current.totalSpent)
  })

  // ⚠️ خطأ حقيقي أبلغ عنه المستخدم: "المتبقي" في هيدر الرحلة (Header.tsx،
  // مصدره stats/cycleStats.totalRemaining هنا) كان أقلّ من الصحيح بقيمة كل
  // مصروف دُفع من جيب مسافر بالضبط — لأن `totalDeposited − totalSpent` تتجاهل
  // paidBy كلياً، بينما بطاقة كل مسافر (balances[i].remaining) كانت صحيحة
  // دائماً. totalRemaining يجب أن يطابق مجموع balances[i].remaining تماماً،
  // لا معادلة موازية قد تنحرف عنه.
  it('totalRemaining يشمل مصروفاً مدفوعاً من جيب مسافر — لا يتجاهله كما في الخطأ المُبلَّغ عنه', () => {
    const withPocketExpense: Expense[] = [
      ...expenses,
      {
        id: 'e2', date: '2026-08-02', description: 'بنزين', amount: 96.95, originalAmount: 96.95,
        currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: 2, paidBy: 1,
      },
    ]
    const { result } = renderHook(() => useBalances(travelers, withPocketExpense))

    // محمد دفع 96.95 من جيبه — يُقيَّد كاملاً لحسابه فوق نصيبه من نفس المصروف،
    // فمجموع remaining الحقيقي أعلى من totalDeposited − totalSpent بمقدارها.
    const naiveTotal = result.current.totalDeposited - result.current.totalSpent
    expect(result.current.totalRemaining).toBe(naiveTotal + 96.95)
    expect(result.current.totalRemaining).toBe(result.current.balances.reduce((s, b) => s + b.remaining, 0))
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
