import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFilteredExpenses } from './useFilteredExpenses'
import type { Traveler, Expense } from '../types'

const travelers: Traveler[] = [
  { id: 1, name: 'محمد العاثم', shortName: 'محمد', deposited: 1000, deletedAt: null },
  { id: 2, name: 'عيسى آل شبير', shortName: 'عيسى', deposited: 500, deletedAt: null },
]

const mkExpense = (over: Partial<Expense>): Expense => ({
  id: 'x', date: '2026-08-01', description: 'اختبار', amount: 0, originalAmount: 0,
  currency: 'SAR', exchangeRate: 1, participants: [], createdAt: 0, ...over,
})

const expenses: Expense[] = [
  mkExpense({ id: 'e1', description: 'عشاء في وارسو', amount: 300, createdAt: 1, date: '2026-08-01', participants: [1] }),
  mkExpense({ id: 'e2', description: 'تذاكر متحف', amount: 100, createdAt: 2, date: '2026-08-02', participants: [2] }),
  mkExpense({ id: 'e3', description: 'إيجار سيارة', amount: 500, createdAt: 3, date: '2026-08-03', participants: [1, 2] }),
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// البحث مؤخَّر (debounced) بـ 300ms — نتقدّم بالوقت داخل act لنسمح لأثر
// useDebounce بالتفعّل قبل التحقق من filteredExpenses.
const flushDebounce = () => act(() => { vi.advanceTimersByTime(300) })

describe('useFilteredExpenses', () => {
  it('يُرجع كل المصاريف بلا فلترة عند غياب بحث، مرتّبة تنازلياً حسب التاريخ افتراضياً', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e3', 'e2', 'e1'])
  })

  it('يفلتر بحسب الوصف (case-insensitive جزئياً)', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('متحف'))
    flushDebounce()
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e2'])
  })

  it('يفلتر بحسب اسم المشارك المشتق من travelers', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('عيسى'))
    flushDebounce()
    expect(result.current.filteredExpenses.map(e => e.id).sort()).toEqual(['e2', 'e3'])
  })

  it('يفلتر بحسب التاريخ', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('2026-08-03'))
    flushDebounce()
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e3'])
  })

  it('لا يفلتر فوراً قبل انتهاء مهلة الـ debounce', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('متحف'))
    act(() => { vi.advanceTimersByTime(299) })
    // لم تُطبَّق الفلترة بعد — لا تزال كل النتائج ظاهرة
    expect(result.current.filteredExpenses).toHaveLength(3)
  })

  it('يرتّب تصاعدياً حسب التاريخ عند date_asc', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSortOrder('date_asc'))
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('يرتّب تنازلياً حسب المبلغ عند amount_desc', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSortOrder('amount_desc'))
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e3', 'e1', 'e2'])
  })

  it('يرتّب تصاعدياً حسب المبلغ عند amount_asc', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSortOrder('amount_asc'))
    expect(result.current.filteredExpenses.map(e => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('يُرجع مصفوفة فارغة عند عدم تطابق أي نتيجة', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('غير موجود إطلاقاً'))
    flushDebounce()
    expect(result.current.filteredExpenses).toEqual([])
  })

  it('بحث بمسافات فقط يُعامَل كبحث فارغ (كل النتائج)', () => {
    const { result } = renderHook(() => useFilteredExpenses(expenses, travelers))
    act(() => result.current.setSearchQuery('   '))
    flushDebounce()
    expect(result.current.filteredExpenses).toHaveLength(3)
  })
})
