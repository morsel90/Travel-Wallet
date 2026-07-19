import { memo, useState } from 'react'
import { PieChart, TrendingUp, ArrowRightLeft } from '../../icons'
import { useData } from '../../context/DataContext'
import { cn } from '../../utils/cn'
import { haptic } from '../../utils/haptics'
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
  { key: 'trend',       label: 'التطور الزمني',      icon: TrendingUp },
]

function ChartsSection({ settlements, categoryTotals, spendingTrend }: ChartsSectionProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>('settlements')
  const { travelers } = useData()

  const getShortName = (idOrName: any) => {
    const traveler = travelers.find(t => t.id === Number(idOrName) || t.name === String(idOrName))
    return traveler ? traveler.shortName : String(idOrName)
  }

  const totalCategoriesAmount = categoryTotals.reduce((sum, item) => sum + item.total, 0)

  // 🆕 تتبّع محلي للتسويات التي "تم تحويلها" (لتظليلها بعد إتمام الدفع). هذه حالة
  // واجهة بحتة غير محفوظة في Firestore — تُصفَّر عند إعادة تحميل الصفحة.
  const [paidSettlements, setPaidSettlements] = useState<Set<string>>(new Set())
  const settlementKey = (s: Settlement) => `${s.fromName}→${s.toName}`
  const togglePaid = (key: string) => {
    haptic.light()
    setPaidSettlements(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-teal-600" /> ملخص وإحصائيات الرحلة
        </h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
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

      <div className="p-5">
        
        {/* 1. تبويب التسويات الذكية (من يدفع لمن) */}
        {activeTab === 'settlements' && (
          <div className="space-y-3">
            {settlements.length === 0 ? (
              <div className="text-center py-6 text-slate-400 font-medium text-sm">
                🎉 جميع الحسابات مصفّاة والأرصدة متساوية تماماً!
              </div>
            ) : (
              <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
                {settlements.map((s, idx) => {
                  const key = settlementKey(s)
                  const isPaid = paidSettlements.has(key)
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'flex flex-col gap-3 border rounded-2xl p-4 transition-all shadow-sm',
                        isPaid ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* ✅ استخدام s.fromName و s.toName لمطابقة نوع Settlement */}
                          <span className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {getShortName(s.fromName).charAt(0)}
                          </span>
                          <span className="font-bold text-slate-800 text-sm truncate">{getShortName(s.fromName)}</span>
                          <span className="text-slate-300 font-medium px-1 shrink-0">←</span>
                          <span className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {getShortName(s.toName).charAt(0)}
                          </span>
                          <span className="font-bold text-slate-800 text-sm truncate">{getShortName(s.toName)}</span>
                        </div>

                        <span className="font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-xl text-sm tracking-tight tabular-nums border border-rose-100 shrink-0">
                          {s.amount.toFixed(2)} <span className="text-xs font-bold opacity-80">﷼</span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => togglePaid(key)}
                        className={cn(
                          'w-full py-2 rounded-xl text-xs font-bold transition-all active:scale-95',
                          isPaid
                            ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                            : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100'
                        )}
                      >
                        {isPaid ? 'تم التحويل ✓ (تراجع)' : 'تحديد كمُحوَّل'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. تبويب التوزيع حسب الفئة */}
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

        {/* 3. تبويب التطور الزمني */}
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
    </section>
  )
}

export default memo(ChartsSection)