import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
// تمت إعادة استيراد أيقونة Printer
import { X, Download, Printer, BarChart3, TrendingUp, Wallet, Receipt, Scale, ArrowRightLeft, CalendarRange } from '../../icons'
import type { Expense, Traveler, TravelerBalance, Settlement, CategoryTotal, ItinerarySegment, PeriodKey } from '../../types'
import { buildDailySummary, buildPeriodOverview, buildCurrentPeriodTravelerSummaries } from '../../utils/reportData'
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
   * 🆕 الفترات المتاحة (تصاعدياً) — الرحلة الطويلة فقط. غيابها يُبقي الشاشة
   * على تبويبَي «ملخص الرحلة»/«الملخص اليومي» كما كانت قبل ميزة الفترات
   * تماماً. حضورها يستبدلهما بـ«ملخص الفترة الحالية»/«تفصيل كامل الرحلة» —
   * مصدرها useAppCoordinator.longTerm.periods (انظر utils/period.ts: listPeriods).
   *
   * ⚠️ **لا مُصفّي دورة يدوي بعد الآن** — كان يسمح بعرض دورة سابقة بعينها،
   * لكن لا فائدة عملية منه: دورة سابقة *مُغلقة* عرضها التاريخي متاح أصلاً في
   * تبويب «تفصيل كامل الرحلة» (ملخص الفترة لكل دورة)، ومسافر واحد يراجع
   * تفاصيله في ملفه الشخصي. نفس القرار المُتّخذ في TravelerProfileModal
   * (commit c3acfbf) — الخلاصة للدورة الحالية دوماً، والتفصيلي تراكمي دوماً.
   */
  periods?: PeriodKey[]
  onClose: () => void
}

type ReportTab = 'current' | 'full' | 'daily'

const fmt = (n: number): string => n.toFixed(2)

function ReportsView({ travelers, expenses, balances, settlements, categoryTotals, itinerary, periods, onClose }: ReportsViewProps) {
  const hasPeriods = !!periods && periods.length > 0
  // 🆕 آخر عنصر في periods هو الدورة الحالية (المفتوحة) دائماً — نفس مبدأ
  // TravelerProfileModal (ثابتة من بناء listPeriods، تنتهي القائمة عند
  // currentPeriod دوماً ولو بلا مصروف واحد بعد).
  const currentPeriod: PeriodKey | null = hasPeriods ? periods![periods!.length - 1] : null

  // 🆕 تبويبان فقط دائماً — لا ثلاثة: «ملخص الفترة الحالية» و«تفصيل كامل
  // الرحلة» في الرحلة الطويلة (periods)، أو «ملخص الرحلة» و«الملخص اليومي»
  // في الرحلة القياسية كما كانا قبل ميزة الفترات تماماً.
  const TABS: Array<{ key: ReportTab; label: string; Icon: typeof BarChart3 }> = hasPeriods
    ? [
        { key: 'current', label: 'ملخص الفترة الحالية', Icon: CalendarRange },
        { key: 'full',    label: 'تفصيل كامل الرحلة',   Icon: BarChart3 },
      ]
    : [
        { key: 'full',  label: 'ملخص الرحلة',    Icon: BarChart3 },
        { key: 'daily', label: 'الملخص اليومي', Icon: TrendingUp },
      ]

  const [activeTab, setActiveTab] = useState<ReportTab>(hasPeriods ? 'current' : 'full')

  // ─── الدورة الحالية (الرحلة الطويلة فقط) ────────────────────────────────
  //
  // ⚠️ **إصلاح: إجمالي المودَع كان يختفي جزئياً لدورة حالية أُضيف خلالها
  // إيداع.** buildPeriodTravelerSummaries القديمة كانت تقرأ رصيد حدّ الإغلاق
  // الجامد (periodOpeningBalance) — لا يعرف شيئاً عن إيداعات أُضيفت *بعده* في
  // دورة ما زالت مفتوحة. الحل: اشتقاق جبري من balances الحيّة
  // (buildCurrentPeriodTravelerSummaries، نفس حيلة TravelerProfileModal —
  // commit 974db32). صيغة TravelerBalance المُعادة متوافقة تماماً (deposited/
  // totalExpenses/remaining) فتُستهلك في التسويات والفئات كأي أرصدة عادية.
  const currentPeriodExpenses = useMemo(
    () => (hasPeriods ? filterCycleExpenses(expenses, currentPeriod!) : []),
    [hasPeriods, expenses, currentPeriod],
  )
  const currentPeriodBalances = useMemo<TravelerBalance[]>(() => {
    if (!hasPeriods) return []
    const summaries = buildCurrentPeriodTravelerSummaries(travelers, balances, expenses, currentPeriod!)
    return summaries.map(s => {
      const traveler = travelers.find(t => t.id === s.id)
      return { ...(traveler as Traveler), deposited: s.opening, totalExpenses: s.spent, remaining: s.closing }
    })
  }, [hasPeriods, travelers, balances, expenses, currentPeriod])
  const currentSettlements = useMemo(
    () => (hasPeriods ? calculateSettlements(currentPeriodBalances) : []),
    [hasPeriods, currentPeriodBalances],
  )
  const currentCategoryTotals = useMemo(
    () => (hasPeriods ? calculateCategoryTotals(currentPeriodExpenses) : []),
    [hasPeriods, currentPeriodExpenses],
  )
  const currentTotals = useMemo(() => ({
    deposited: currentPeriodBalances.reduce((s, b) => s + b.deposited, 0),
    spent:     currentPeriodBalances.reduce((s, b) => s + b.totalExpenses, 0),
    remaining: currentPeriodBalances.reduce((s, b) => s + b.remaining, 0),
    days:      new Set(currentPeriodExpenses.map(e => e.date)).size,
  }), [currentPeriodBalances, currentPeriodExpenses])

  // ─── تفصيل كامل الرحلة — تراكمي دوماً بلا أي تصفية ──────────────────────
  const fullTotals = useMemo(() => ({
    deposited: balances.reduce((s, b) => s + b.deposited, 0),
    spent:     balances.reduce((s, b) => s + b.totalExpenses, 0),
    remaining: balances.reduce((s, b) => s + b.remaining, 0),
    days:      new Set(expenses.map(e => e.date)).size,
  }), [balances, expenses])
  const daily = useMemo(() => buildDailySummary(expenses), [expenses])
  // 🆕 ملخّص كل دورة عبر الرحلة كلها — جزء من «تفصيل كامل الرحلة»، بديل
  // «الملخص اليومي» غير المفيد لرحلة تمتد أشهراً.
  const periodOverview = useMemo(() => (hasPeriods ? buildPeriodOverview(expenses, periods!) : []), [hasPeriods, expenses, periods])
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

            {/* تمت إعادة زر الـ PDF — يطبع تفصيل الرحلة الكامل دائماً (تراكمي)
                بصرف النظر عن التبويب المفتوح، مطابقةً لـexportTripToExcel أدناه. */}
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
              onClick={() => exportTripToExcel({ expenses, travelers, balances, settlements, periods })}
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-24">
        {/* أزرار التبديل — نفس نمط التبويب في TravelerProfileModal.tsx */}
        <div className="flex bg-slate-200/70 p-1 rounded-xl">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
                activeTab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'current' && (
          <SummaryBody
            depositLabel="المودَع"
            remainingLabel="المتبقي"
            deposited={currentTotals.deposited}
            spent={currentTotals.spent}
            remaining={currentTotals.remaining}
            caption={`دورة ${formatPeriodLabel(currentPeriod!)} · ${currentPeriodExpenses.length} مصروف · ${travelers.length} مسافر · ${currentTotals.days} يوم`}
            settlements={currentSettlements}
            categoryTotals={currentCategoryTotals}
          />
        )}

        {activeTab === 'full' && (
          <div className="space-y-5">
            {/* قسم مسار الرحلة التفصيلي على الشاشة (بطاقة) — عنصر رحلة كاملة
                لا دورة واحدة، فمكانه هنا في التفصيل الكامل تحديداً. */}
            <ItinerarySection itinerary={itinerary} />

            <SummaryBody
              depositLabel="إجمالي المودَع"
              remainingLabel="المتبقي"
              deposited={fullTotals.deposited}
              spent={fullTotals.spent}
              remaining={fullTotals.remaining}
              caption={`${expenses.length} مصروف · ${travelers.length} مسافر · ${fullTotals.days} يوم`}
              settlements={settlements}
              categoryTotals={categoryTotals}
            />

            {hasPeriods && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                  <CalendarRange className="w-4 h-4 text-teal-600" />
                  <h2 className="text-sm font-bold text-slate-800">ملخص الفترة</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-slate-50/50 text-[11px] font-bold text-slate-400">
                    <span>الدورة</span>
                    <span className="text-center">العدد</span>
                    <span className="text-left">إجمالي الدورة</span>
                    <span className="text-left">التراكمي</span>
                  </div>
                  {periodOverview.map(row => {
                    const isCurrent = row.period === currentPeriod
                    return (
                      <div
                        key={row.period}
                        className={`grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center ${isCurrent ? 'bg-teal-50/60' : ''}`}
                      >
                        <span className="font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                          {row.label}
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full shrink-0">الحالية</span>
                          )}
                        </span>
                        <span className="text-center text-slate-500 font-bold tabular-nums">{row.count}</span>
                        <span className="text-left font-black text-slate-800 tabular-nums">{fmt(row.spent)}</span>
                        <span className="text-left font-bold text-teal-600 tabular-nums">{fmt(row.cumulative)}</span>
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
            {/* مسار الرحلة صار قسماً رسمياً داخل PrintableTripReport (أسلوب موحّد مع بقية التقرير).
                تراكمي دائماً — نفس بيانات تبويب «تفصيل كامل الرحلة» بالضبط. */}
            <PrintableTripReport
              tripName=""
              generatedAt={generatedAt}
              travelers={travelers}
              expenses={expenses}
              balances={balances}
              settlements={settlements}
              categoryTotals={categoryTotals}
              itinerary={itinerary}
              periods={periods}
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className={`text-base font-black tabular-nums ${TONE[tone]}`} dir="ltr">{value}</p>
    </div>
  )
}

/** جسد مشترك بين تبويبَي «ملخص الفترة الحالية» و«تفصيل كامل الرحلة» — نفس
 *  ثلاث بطاقات الرصيد وقسمي التسويات/الفئات، تختلف فقط بيانات المصدر
 *  (الدورة الحالية أو الرحلة كاملة) والتسميات. */
function SummaryBody({
  depositLabel, remainingLabel, deposited, spent, remaining, caption, settlements, categoryTotals,
}: {
  depositLabel: string
  remainingLabel: string
  deposited: number
  spent: number
  remaining: number
  caption: string
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
}) {
  const categoriesTotal = useMemo(() => categoryTotals.reduce((s, c) => s + c.total, 0), [categoryTotals])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard Icon={Wallet} label={depositLabel} value={fmt(deposited)} tone="teal" />
        <KpiCard Icon={Receipt} label="إجمالي المصروف" value={fmt(spent)} tone="rose" />
        <KpiCard Icon={Scale} label={remainingLabel} value={fmt(remaining)} tone={remaining < 0 ? 'rose' : 'teal'} />
      </div>
      {/* 🆕 وصف مختصر بدل ثلاث بطاقات ثانوية إضافية — نفس مبدأ "أرقام دورة X"
          في TravelerProfileModal: سطر واحد خفيف تحت المؤشرات. */}
      <p className="text-[11px] text-slate-400 font-bold text-center -mt-2">{caption}</p>

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
  )
}

export default ReportsView
