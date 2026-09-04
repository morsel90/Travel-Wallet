import { useMemo } from 'react'
import type { Traveler, TravelerBalance, Expense } from '../types'
import {
  calculateBalances,
  calculateTotalSpent,
  calculateTotalDeposited,
} from '../utils/calculations'

// ─── useBalances ──────────────────────────────────────────────────────────────
// غلاف React رفيع حول دوال الحساب النقية في utils/calculations.
// يحفظ النتيجة بـ useMemo ويُعاد حسابها فقط عند تغيّر travelers أو expenses.
export interface UseBalances {
  balances: TravelerBalance[]
  totalSpent: number
  totalDeposited: number
  totalRemaining: number
}

export function useBalances(travelers: Traveler[], expenses: Expense[]): UseBalances {
  return useMemo<UseBalances>(() => {
    const balances        = calculateBalances(travelers, expenses)
    const totalSpent      = calculateTotalSpent(expenses)
    const totalDeposited  = calculateTotalDeposited(travelers)
    // ⚠️ **إصلاح: لا `totalDeposited − totalSpent`** — تلك تتجاهل مصاريف
    // "دفعها فلان" (Expense.paidBy) كلياً. calculateBalances تُقيِّد المبلغ
    // كاملاً لحساب الدافع *قبل* خصم نصيبه (انظر تعليقها)، فمجموع remaining
    // الحقيقي = totalDeposited + إجمالي ما دُفع من الجيب − totalSpent، لا
    // totalDeposited − totalSpent وحدهما. من دفع أي مبلغ من جيبه كان "المتبقي"
    // الإجمالي في هيدر الرحلة (Header.tsx: stats/cycleStats.totalRemaining)
    // يظهر أقلّ من مجموع أرصدة المسافرين الفعلي بقيمة ذلك المبلغ بالضبط —
    // بينما بطاقة كل مسافر ورقة "تقارير الرحلة" (مبنيّتان على balances[i].remaining
    // مباشرة) كانتا صحيحتين دائماً. الجمع من balances هنا مصدر واحد لا يمكن أن
    // ينحرف عن الأرقام المعروضة فعلياً لكل مسافر.
    const totalRemaining = balances.reduce((sum, b) => sum + b.remaining, 0)
    return { balances, totalSpent, totalDeposited, totalRemaining }
  }, [travelers, expenses])
}
