// 🆕 **لا تبويب «من يدفع لمن» هنا بعد الآن** — التسويات صارت قسماً رئيسياً
// مستقلاً في الشاشة (SettlementsPanel.tsx). كانت أكثر ما يُفتح في هذا المكوّن
// وأقلّ ما يُرى فيه: مدفونةً خلف تبويب داخل بطاقة أسفل الصفحة. ما بقي هنا
// رسمان يُنظر إليهما مرة أو مرتين في الرحلة كلها، ولهذا انتقل المكوّن كاملاً
// خلف زرّ «المزيد» (ChartsModal). انظر docs/DECISIONS.md.
import { memo, useState } from 'react'
import { PieChart, TrendingUp } from '../../icons'
import type { CategoryTotal, SpendingTrendPoint } from '../../types'

interface ChartsSectionProps {
  categoryTotals: CategoryTotal[]
  spendingTrend: SpendingTrendPoint[]
}

type ChartTab = 'categories' | 'trend'

const TABS: Array<{ key: ChartTab; label: string; icon: typeof PieChart }> = [
  { key: 'categories',  label: 'حسب الفئة',          icon: PieChart },
  { key: 'trend',       label: 'التطور الزمني',      icon: TrendingUp },
]

function ChartsSection({ categoryTotals, spendingTrend }: ChartsSectionProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>('categories')

  const totalCategoriesAmount = categoryTotals.reduce((sum, item) => sum + item.total, 0)

  // ⚠️ بلا بطاقة بيضاء خارجية ولا عنوان: المكوّن يُعرض الآن داخل ChartsModal
  // الذي يوفّر الاثنين (Modal بيضاء أصلاً — بطاقة داخل بطاقة كانت ستُنتج
  // إطارَين متداخلَين، نفس الملاحظة الموثّقة في ExpensesPanel.tsx).
  return (
    <div>
      <div className="mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        
        {/* 1. تبويب التوزيع حسب الفئة */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-bold text-slate-400">الفئة ومستوى الصرف</span>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">إجمالي المصاريف: {totalCategoriesAmount.toFixed(2)} ﷼</span>
            </div>
            <div className="space-y-3.5">
              {categoryTotals.map((item, idx) => {
                const percentage = totalCategoriesAmount > 0 ? (item.total / totalCategoriesAmount) * 100 : 0
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="font-bold text-slate-800">{item.category}</span>
                      <div className="flex items-center gap-2 font-black text-slate-700">
                        <span className="text-xs font-bold text-slate-400">({percentage.toFixed(0)}%)</span>
                        <span>{item.total.toFixed(2)} <span className="text-xs font-bold opacity-60">﷼</span></span>
                      </div>
                    </div>
                    <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                      <div 
                        className="h-full bg-gradient-to-r from-teal-500 to-teal-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. تبويب التطور الزمني */}
        {activeTab === 'trend' && (
          <div className="relative border-r-2 border-slate-100 ms-3 space-y-5 py-2">
            {spendingTrend.length === 0 ? (
              <div className="text-center py-6 text-slate-400 font-medium text-sm border-r-0">
                لا توجد بيانات زمنية متاحة بعد.
              </div>
            ) : (
              spendingTrend.map((point, idx) => (
                <div key={idx} className="relative pr-6">
                  <span className="absolute -right-[7px] top-1.5 w-3 h-3 rounded-full bg-teal-500 ring-4 ring-white border border-teal-600" />
                  
                  <div className="flex items-center justify-between bg-slate-50/50 border border-slate-100 rounded-2xl p-3 hover:bg-slate-50 transition-colors">
                    <span className="text-sm font-bold text-slate-700">{point.date}</span>
                    <div className="text-left">
                      <span className="text-xs font-bold text-slate-400 block mb-0.5">صرفيات اليوم</span>
                      <span className="font-black text-slate-800 text-base tracking-tight tabular-nums">
                        {point.total.toFixed(2)} <span className="text-xs font-bold opacity-70">﷼</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default memo(ChartsSection)