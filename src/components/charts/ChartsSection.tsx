import { memo, useState } from 'react'
import { CategoryPieChart } from './CategoryPieChart'
import { SpendingTrendChart } from './SpendingTrendChart'
import { SettlementFlowChart } from './SettlementFlowChart'
import { PieChart, TrendingUp, ArrowRightLeft } from '../../icons'
import type { Settlement, CategoryTotal, SpendingTrendPoint } from '../../types'

interface ChartsSectionProps {
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
  spendingTrend: SpendingTrendPoint[]
}

type ChartTab = 'settlements' | 'categories' | 'trend'

const TABS: Array<{ key: ChartTab; label: string; icon: typeof PieChart }> = [
  { key: 'settlements', label: 'من يدفع لمن',        icon: ArrowRightLeft },
  { key: 'categories',  label: 'حسب الفئة',          icon: PieChart },
  { key: 'trend',       label: 'تطوّر الإجمالي',      icon: TrendingUp },
]

/**
 * 🆕 قسم التصوّر البياني للأرصدة — يعرض ثلاثة رسوم بيانية (Recharts) عبر تبويبات:
 * تدفّق التسويات المقترحة (Sankey)، توزيع المصاريف حسب الفئة (Pie)، وتطوّر
 * الإجمالي عبر الزمن (Bar + Line تراكمي). البيانات كلها مشتقة (derived) من
 * travelers/expenses الموجودة أصلاً عبر utils/calculations.ts — لا تُقرأ أو
 * تُكتب لـ Firestore مباشرة. مُحمَّل بتكاسل (lazy) من App.tsx لأن Recharts تبعية
 * كبيرة نسبياً لا يجب أن تُحمَّل ضمن الحزمة الرئيسية.
 */
function ChartsSection({ settlements, categoryTotals, spendingTrend }: ChartsSectionProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>('settlements')

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 me-2">
          <PieChart className="w-5 h-5 text-slate-500" /> تصوّر بياني للأرصدة
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'settlements' && <SettlementFlowChart settlements={settlements} />}
        {activeTab === 'categories'  && <CategoryPieChart data={categoryTotals} />}
        {activeTab === 'trend'       && <SpendingTrendChart data={spendingTrend} />}
      </div>
    </section>
  )
}

export default memo(ChartsSection)
