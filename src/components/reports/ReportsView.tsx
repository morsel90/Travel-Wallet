// ReportsView.tsx
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
// تمت إعادة استيراد أيقونة Printer
import { X, Download, Printer, BarChart3, Users, TrendingUp, Wallet, Receipt, Scale, ArrowRightLeft } from '../../icons'
import type { Expense, Traveler, TravelerBalance, Settlement, CategoryTotal } from '../../types'
import { buildDailySummary } from '../../utils/reportData'
import { exportTripToExcel } from '../../utils/reports'
import { PrintableTripReport } from './PrintDocs'

interface ReportsViewProps {
  travelers: Traveler[]
  expenses: Expense[]
  balances: TravelerBalance[]
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
  onClose: () => void
}

type ReportTab = 'summary' | 'daily'

const TABS: Array<{ key: ReportTab; label: string; Icon: typeof BarChart3 }> = [
  { key: 'summary',   label: 'ملخص الرحلة',  Icon: BarChart3 },
  { key: 'daily',     label: 'الملخص اليومي', Icon: TrendingUp },
]

const fmt = (n: number): string => n.toFixed(2)

function ReportsView({ travelers, expenses, balances, settlements, categoryTotals, onClose }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('summary')

  const totals = useMemo(() => ({
    deposited: balances.reduce((s, b) => s + b.deposited, 0),
    spent:     balances.reduce((s, b) => s + b.totalExpenses, 0),
    remaining: balances.reduce((s, b) => s + b.remaining, 0),
    days:      new Set(expenses.map(e => e.date)).size,
  }), [balances, expenses])

  const categoriesTotal = useMemo(() => categoryTotals.reduce((s, c) => s + c.total, 0), [categoryTotals])
  const daily = useMemo(() => buildDailySummary(expenses), [expenses])
  const generatedAt = new Date().toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })

  // تمت إعادة دالة الطباعة لتتوافق مع iOS
  const handlePrint = () => {
    const root = document.getElementById('print-root')
    if (root) {
      root.className = `print-mode-trip`
    }
    void document.body.offsetHeight;
    try {
      const isPrinted = document.execCommand('print', false, undefined)
      if (!isPrinted) {
        window.print()
      }
    } catch (e) {
      window.print()
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[9998] bg-slate-50 overflow-y-auto"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <header className="sticky top-0 z-10 bg-teal-700 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-6 h-6 text-teal-100 shrink-0" />
            <h1 className="font-bold text-lg truncate">تقارير الرحلة</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            
            {/* تمت إعادة زر الـ PDF */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={expenses.length === 0}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>

            <button
              type="button"
              onClick={() => exportTripToExcel({ expenses, travelers, balances, settlements })}
              disabled={expenses.length === 0}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق التقارير"
              className="p-2 rounded-xl bg-teal-800/60 hover:bg-teal-800 text-teal-50 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === key ? 'bg-white text-teal-700 shadow-sm' : 'bg-teal-800/40 text-teal-50 hover:bg-teal-800/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard Icon={Wallet} label="إجمالي المودَع" value={fmt(totals.deposited)} tone="teal" />
              <KpiCard Icon={Receipt} label="إجمالي المصروف" value={fmt(totals.spent)} tone="rose" />
              <KpiCard Icon={Scale} label="المتبقي" value={fmt(totals.remaining)} tone={totals.remaining < 0 ? 'rose' : 'teal'} />
              <KpiCard Icon={Receipt} label="عدد المصاريف" value={String(expenses.length)} tone="slate" />
              <KpiCard Icon={Users} label="عدد المسافرين" value={String(travelers.length)} tone="slate" />
              <KpiCard Icon={TrendingUp} label="عدد الأيام" value={String(totals.days)} tone="slate" />
            </div>

            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                <ArrowRightLeft className="w-5 h-5 text-teal-600" /> التسويات المقترحة
              </h2>
              {settlements.length === 0 ? (
                <p className="text-center text-slate-400 font-medium text-sm py-4">🎉 لا توجد تسويات مطلوبة — الأرصدة متساوية.</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {settlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-sm font-bold text-slate-700">{s.fromName} ← {s.toName}</span>
                      <span className="font-black text-rose-600 tabular-nums text-sm">{fmt(s.amount)} ﷼</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {categoryTotals.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-teal-600" /> التوزيع حسب الفئة
                </h2>
                <div className="space-y-3.5">
                  {categoryTotals.map((item, i) => {
                    const pct = categoriesTotal > 0 ? (item.total / categoriesTotal) * 100 : 0
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between items-center text-sm px-1">
                          <span className="font-bold text-slate-800">{item.category}</span>
                          <span className="font-black text-slate-700 tabular-nums">
                            <span className="text-xs text-slate-400 me-1">({pct.toFixed(0)}%)</span>{fmt(item.total)} ﷼
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <div className="h-full bg-gradient-to-r from-teal-500 to-teal-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'daily' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {daily.length === 0 ? (
              <p className="text-center text-slate-400 font-medium text-sm py-10">لا توجد مصاريف بعد.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-slate-50/50 text-[11px] font-bold text-slate-400">
                  <span>التاريخ</span>
                  <span className="text-center">العدد</span>
                  <span className="text-left">اليوم</span>
                  <span className="text-left">التراكمي</span>
                </div>
                {daily.map(row => (
                  <div key={row.date} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center">
                    <span className="font-bold text-slate-700">{row.date}</span>
                    <span className="text-center text-slate-500 font-bold tabular-nums">{row.count}</span>
                    <span className="text-left font-black text-slate-800 tabular-nums">{fmt(row.total)}</span>
                    <span className="text-left font-bold text-teal-600 tabular-nums">{fmt(row.cumulative)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {createPortal(
        <div id="print-root" className="print-mode-trip">
          <style>
            {`
              @media screen {
                #print-root { display: none !important; }
              }
              @media print {
                html, body {
                  height: auto !important;
                  min-height: 100vh !important;
                  overflow: visible !important;
                  position: static !important;
                }
                body > *:not(#print-root):not(script):not(style) {
                  display: none !important;
                }
                #print-root {
                  display: block !important;
                  width: 100%;
                }
              }
            `}
          </style>
          <div className="print-doc-trip">
            <PrintableTripReport
              tripName=""
              generatedAt={generatedAt}
              travelers={travelers}
              expenses={expenses}
              balances={balances}
              settlements={settlements}
              categoryTotals={categoryTotals}
            />
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  )
}

const TONE: Record<'teal' | 'rose' | 'slate', string> = {
  teal:  'text-teal-700',
  rose:  'text-rose-600',
  slate: 'text-slate-800',
}

function KpiCard({ Icon, label, value, tone }: { Icon: typeof Wallet; label: string; value: string; tone: 'teal' | 'rose' | 'slate' }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className={`text-lg font-black tabular-nums ${TONE[tone]}`} dir="ltr">{value}</p>
    </div>
  )
}

export default ReportsView