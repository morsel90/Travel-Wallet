import { useState, useMemo } from 'react'
import type { Expense, Traveler, SortOrder } from '../types'
import { toDisplayNames } from '../utils/participants'
import { useDebounce } from './useDebounce'

// 🆕 مهلة التأخير (Debounce) لحقل البحث — تكفي لتفادي إعادة حساب التصفية عند
// كل ضغطة مفتاح على قائمة طويلة، دون أن يشعر المستخدم بتأخير ملموس في النتائج.
const SEARCH_DEBOUNCE_MS = 300

export function useFilteredExpenses(expenses: Expense[], travelers: Traveler[]) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('date_desc')

  // 🆕 searchQuery نفسه يبقى فورياً (مربوط بحقل الإدخال مباشرةً — لا تأخير على
  // الكتابة)، بينما التصفية الفعلية (والفرز المصاحب لها) تعتمد على النسخة
  // المؤخَّرة فقط، فلا تُعاد كل عملية expensive filter/sort إلا بعد توقّف
  // المستخدم عن الكتابة لمدة SEARCH_DEBOUNCE_MS.
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS)

  const filteredExpenses = useMemo(() =>
    expenses
      .filter(exp => {
        if (!debouncedSearchQuery.trim()) return true
        const q = debouncedSearchQuery.toLowerCase()
        return (
          exp.description.toLowerCase().includes(q) ||
          toDisplayNames(exp.participants, travelers).some(n => n.toLowerCase().includes(q)) ||
          exp.date.includes(q)
        )
      })
      .sort((a, b) => {
        if (sortOrder === 'date_desc')   return b.createdAt - a.createdAt
        if (sortOrder === 'date_asc')    return a.createdAt - b.createdAt
        if (sortOrder === 'amount_desc') return b.amount - a.amount
        if (sortOrder === 'amount_asc')  return a.amount - b.amount
        return 0
      }),
  [expenses, debouncedSearchQuery, sortOrder, travelers])

  return {
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    filteredExpenses
  }
}