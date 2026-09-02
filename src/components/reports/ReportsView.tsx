import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
// تمت إعادة استيراد أيقونة Printer
import { X, Download, Printer, BarChart3, Users, TrendingUp, Wallet, Receipt, Scale, ArrowRightLeft, CalendarRange } from '../../icons'
import type { Expense, Traveler, TravelerBalance, Settlement, CategoryTotal, ItinerarySegment, PeriodKey } from '../../types'
import { buildDailySummary, buildPeriodTravelerSummaries } from '../../utils/reportData'
import { exportTripToExcel } from '../../utils/reports'
import { calculateSettlements, calculateCategoryTotals } from '../../utils/calculations'
import { filterCycleExpenses } from '../../utils/longTerm'
import { formatPeriodLabel } from '../../utils/period'
import { PrintableTripReport } from './PrintDocs'
import { ItinerarySection } from '../ItinerarySection'

interface ReportsViewProps {
  travelers: Traveler[]
  expenses: Expense[]
  balances: TravelerBalance[]
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
  itinerary?: ItinerarySegment[]
  /**
   * 🆕 الفترات المتاحة للتصفية (تصاعدياً) — الرحلة الطويلة فقط. غيابها يخفي
   * مُصفّي الدورة بالكامل، فلا يتغيّر أي شيء في الرحلة القياسية. مصدرها
   * useAppCoordinator.longTerm.periods (انظر utils/period.ts: listPeriods).
   */
  periods?: PeriodKey[]
  /** 🆕 آخر شهر أُغلق فعلاً — لتمييز «افتتح بصفر معروف» عن «لا معلومة» في
   *  buildPeriodTravelerSummaries. مصدرها useAppCoordinator.longTerm.lastClosedPeriod. */
  lastClosedPeriod?: PeriodKey | null
  onClose: () => void
}

type ReportTab = 'summary' | 'daily'

const TABS: Array<{ key: ReportTab; label: string; Icon: typeof BarChart3 }> = [
  { key: 'summary',   label: 'ملخص الرحلة',  Icon: BarChart3 },
  { key: 'daily',     label: 'الملخص اليومي', Icon: TrendingUp },
]

const ALL_PERIODS = 'all' as const
type PeriodFilter = PeriodKey | typeof ALL_PERIODS

const fmt = (n: number): string => n.toFixed(2)

function ReportsView({ travelers, expenses, balances, settlements, categoryTotals, itinerary, periods, lastClosedPeriod = null, onClose }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('summary')
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>(ALL_PERIODS)

  // 🆕 تصفية الدورة — periods غائبة في الرحلة القياسية فيسقط isFiltered دائماً
  // إلى false، ويبقى كل ما يلي مطابقاً حرفياً لسلوكه قبل هذه الميزة.
  //
  // ⚠️ **بديل كامل لا تصحيح جزئي**: expenses/balances/settlements/categoryTotals
  // الأصلية لا تُلمَس؛ display* هي ما يُستهلك في كل مكان أدناه (الشاشة والطباعة
  // والتصدير معاً) — مصدر واحد للأرقام المعروضة أياً كانت الدورة المختارة.
  const isFiltered = !!periods && selectedPeriod !== ALL_PERIODS

  const displayExpenses = useMemo(
    () => (isFiltered ? filterCycleExpenses(expenses, selectedPeriod as PeriodKey) : expenses),
    [isFiltered, expenses, selectedPeriod],
  )
  // 🆕 صيغة TravelerBalance متوافقة (deposited=افتتاح الدورة، remaining=إغلاقها)
  // كي تعمل PrintableTripReport وbuildTravelerRows/exportTripToExcel كما هي
  // تماماً بلا أي تغيير — انظر تعليق buildPeriodTravelerSummaries في reportData.ts
  // لماذا opening/closing غير موثوقين لدورة لم يُعرف افتتاحها الحقيقي.
  const periodSummaries = useMemo(
    () => (isFiltered ? buildPeriodTravelerSummaries(travelers, expenses, selectedPeriod as PeriodKey, lastClosedPeriod) : null),
    [isFiltered, travelers, expenses, selectedPeriod, lastClosedPeriod],
  )
  const displayBalances = useMemo<TravelerBalance[]>(() => {
    if (!periodSummaries) return balances
    return periodSummaries.map(s => {
      const traveler = travelers.find(t => t.id === s.id)
      return { ...(traveler as Traveler), deposited: s.opening, totalExpenses: s.spent, remaining: s.closing }
    })
  }, [periodSummaries, travelers, balances])
  // 🆕 أول دورة في الرحلة (لا حدّ إغلاق سابق) — رصيد الافتتاح/الإغلاق أعلاه
  // حينها ليسا رصيدين حقيقيين، بل صافي حركة الدورة فوق صفر مفترض. انظر
  // hasKnownOpening في reportData.ts.
  const hasUnknownOpening = periodSummaries?.some(s => !s.hasKnownOpening) ?? false
  const displaySettlements = useMemo(
    () => (isFiltered ? calculateSettlements(displayBalances) : settlements),
    [isFiltered, displayBalances, settlements],
  )
  const displayCategoryTotals = useMemo(
    () => (isFiltered ? calculateCategoryTotals(displayExpenses) : categoryTotals),
    [isFiltered, displayExpenses, categoryTotals],
  )

  const totals = useMemo(() => ({
    deposited: displayBalances.reduce((s, b) => s + b.deposited, 0),
    spent:     displayBalances.reduce((s, b) => s + b.totalExpenses, 0),
    remaining: displayBalances.reduce((s, b) => s + b.remaining, 0),
    days:      new Set(displayExpenses.map(e => e.date)).size,
  }), [displayBalances, displayExpenses])

  const categoriesTotal = useMemo(() => displayCategoryTotals.reduce((s, c) => s + c.total, 0), [displayCategoryTotals])
  const daily = useMemo(() => buildDailySummary(displayExpenses), [displayExpenses])
  const generatedAt = new Date().toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })
  const periodSubtitle = isFiltered ? `دورة ${formatPeriodLabel(selectedPeriod as PeriodKey)}` : ''

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
              disabled={displayExpenses.length === 0}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>

            <button
              type="button"
              onClick={() => exportTripToExcel({
                expenses: displayExpenses, travelers, balances: displayBalances, settlements: displaySettlements,
                filenameSuffix: isFiltered ? `_دورة_${formatPeriodLabel(selectedPeriod as PeriodKey)}` : undefined,
              })}
              disabled={displayExpenses.length === 0}
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

        {/* 🆕 مُصفّي الدورة — الرحلة الطويلة فقط (periods). يؤثّر في التبويبين
            معاً، ولذا يعيش هنا في الهيدر الثابت لا داخل تبويب واحد. */}
        {periods && periods.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 pb-3 flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-teal-200 shrink-0" />
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value as PeriodFilter)}
              className="flex-1 sm:flex-none bg-teal-800/60 text-teal-50 text-xs font-bold rounded-xl px-3 py-2 border-none outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value={ALL_PERIODS}>جميع الفترات</option>
              {[...periods].reverse().map(p => (
                <option key={p} value={p}>دورة {formatPeriodLabel(p)}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            
            {/* قسم مسار الرحلة التفصيلي على الشاشة (بطاقة) */}
            <ItinerarySection itinerary={itinerary} />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard Icon={Wallet} label={isFiltered ? 'رصيد الافتتاح' : 'إجمالي المودَع'} value={fmt(totals.deposited)} tone="teal" />
              <KpiCard Icon={Receipt} label="إجمالي المصروف" value={fmt(totals.spent)} tone="rose" />
              <KpiCard Icon={Scale} label={isFiltered ? 'رصيد الإغلاق' : 'المتبقي'} value={fmt(totals.remaining)} tone={totals.remaining < 0 ? 'rose' : 'teal'} />
              <KpiCard Icon={Receipt} label="عدد المصاريف" value={String(displayExpenses.length)} tone="slate" />
              <KpiCard Icon={Users} label="عدد المسافرين" value={String(travelers.length)} tone="slate" />
              <KpiCard Icon={TrendingUp} label="عدد الأيام" value={String(totals.days)} tone="slate" />
            </div>

            {/* 🆕 تنبيه لأول دورة في الرحلة — لا حدّ إغلاق سابق يُعرَف منه رصيد
                افتتاحها الحقيقي، فرصيد «رصيد الافتتاح/الإغلاق» أعلاه صافي
                حركة الدورة فوق صفر مفترض لا رصيداً حقيقياً. */}
            {isFiltered && hasUnknownOpening && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 -mt-2">
                هذه أول دورة مسجَّلة في الرحلة — لا رصيد افتتاحي سابق معروف لها، فـ«رصيد الافتتاح/الإغلاق» أعلاه صافي حركة هذه الدورة وحدها لا رصيداً نهائياً حقيقياً.
              </p>
            )}

            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                <ArrowRightLeft className="w-5 h-5 text-teal-600" /> التسويات المقترحة
              </h2>
              {displaySettlements.length === 0 ? (
                <p className="text-center text-slate-400 font-medium text-sm py-4">🎉 لا توجد تسويات مطلوبة — الأرصدة متساوية.</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {displaySettlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-sm font-bold text-slate-700">{s.fromName} ← {s.toName}</span>
                      <span className="font-black text-rose-600 tabular-nums text-sm">{fmt(s.amount)} ﷼</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {displayCategoryTotals.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-teal-600" /> التوزيع حسب الفئة
                </h2>
                <div className="space-y-3.5">
                  {displayCategoryTotals.map((item, i) => {
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
            {/* مسار الرحلة صار قسماً رسمياً داخل PrintableTripReport (أسلوب موحّد مع بقية التقرير) */}
            <PrintableTripReport
              tripName={periodSubtitle}
              generatedAt={generatedAt}
              travelers={travelers}
              expenses={displayExpenses}
              balances={displayBalances}
              settlements={displaySettlements}
              categoryTotals={displayCategoryTotals}
              itinerary={isFiltered ? undefined : itinerary}
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