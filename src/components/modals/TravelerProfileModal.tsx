// TravelerProfileModal.tsx
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Wallet, Receipt, Scale, Loader2, Download, Printer, HandCoins, DoorOpen, CalendarRange, RefreshCw } from '../../icons'
import type { Expense, Traveler, TravelerBalance, Settlement, PeriodKey } from '../../types'
import type { StatementRow } from '../../utils/reportData'
import { buildTravelerReport, buildAccountStatement } from '../../utils/reportData'
import { useDepositLogs } from '../../hooks/useDepositLogs'
import { exportTravelerToExcel } from '../../utils/reports'
import { settlementDirection, filterCycleExpenses, periodOpeningBalance, ROLLOVER_CATEGORY } from '../../utils/longTerm'
import { formatPeriodLabel } from '../../utils/period'
import { PrintableStatement } from '../reports/PrintDocs' // تأكد من صحة مسار استيراد مستند الطباعة

/** 🆕 حاضرة فقط في الرحلة الطويلة (مصدرها useAppCoordinator.longTerm عبر
 *  TravelerCard) — غيابها يعني رحلة قياسية، فلا يظهر قسم الخروج بحرف. مقصودة
 *  في «الخلاصة والتسويات» تحديداً: هنا يراجع من يديرها حصص العضو وتسوياته قبل
 *  أن يقرر، وهو نفس المكان الذي سيدخله العضو نفسه لاحقاً حين يُربط حسابه
 *  ويصير قادراً على خروج ذاتي — راجع نقاش docs/DECISIONS.md. */
interface LongTermExitProps {
  canManage: boolean
  isBusy: boolean
  onExit: () => void
}

interface TravelerProfileModalProps {
  traveler: Traveler
  balance: TravelerBalance
  expenses: Expense[]
  settlements: Settlement[]
  allTravelers: Traveler[]
  isAdmin: boolean
  onClose: () => void
  /** 🆕 التبويب الذي تُفتح عليه النافذة — 'statement' لزر "كشف حسابي" على بطاقة المستخدم نفسه (TravelerSection.tsx)، افتراضياً 'summary' لبقية نقاط الفتح. */
  initialTab?: TabType
  longTermExit?: LongTermExitProps
  /** 🆕 الفترات المتاحة للتصفية (تصاعدياً) — الرحلة الطويلة فقط، انظر ReportsView.tsx. */
  periods?: PeriodKey[]
  /** 🆕 آخر شهر أُغلق فعلاً — انظر تعليقها في ReportsView.tsx. */
  lastClosedPeriod?: PeriodKey | null
}

type TabType = 'summary' | 'statement'

const ALL_PERIODS = 'all' as const
type PeriodFilter = PeriodKey | typeof ALL_PERIODS

const MODE_LABELS: Record<string, string> = { add: 'إضافة', subtract: 'خصم', set: 'تحديد قيمة' }
const fmt = (n: number): string => n.toFixed(2)

export default function TravelerProfileModal({
  traveler,
  balance,
  expenses,
  settlements,
  allTravelers,
  isAdmin,
  onClose,
  initialTab = 'summary',
  longTermExit,
  periods,
  lastClosedPeriod = null,
}: TravelerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>(ALL_PERIODS)

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    allTravelers.forEach(t => m.set(t.id, t.name))
    return m
  }, [allTravelers])

  // 🆕 تصفية الدورة — periods غائبة في الرحلة القياسية فيسقط isFiltered دائماً
  // إلى false، وdisplayExpenses/opening يساويان expenses/balance.deposited
  // حرفياً كما كانا قبل هذه الميزة.
  const isFiltered = !!periods && selectedPeriod !== ALL_PERIODS
  const displayExpenses = useMemo(
    () => (isFiltered ? filterCycleExpenses(expenses, selectedPeriod as PeriodKey) : expenses),
    [isFiltered, expenses, selectedPeriod],
  )
  // 🆕 opening غير مبنيّ على balance.deposited (تراكمي) حين تُصفَّى دورة —
  // periodOpeningBalance تقرأ رصيد افتتاحها الحقيقي من مصروف الترحيل الذي
  // كتبه closeMonth (انظر تعليقها في utils/longTerm.ts). null (لا صفر) يعني
  // «غير معروف» — أول دورة في الرحلة، أو الدورة السابقة لم تُغلق بعد.
  const openingLookup = useMemo(
    () => (isFiltered ? periodOpeningBalance(traveler.id, expenses, selectedPeriod as PeriodKey, lastClosedPeriod) : null),
    [isFiltered, traveler.id, expenses, selectedPeriod, lastClosedPeriod],
  )
  const opening = isFiltered ? (openingLookup ?? 0) : balance.deposited
  const hasUnknownOpening = isFiltered && openingLookup === null

  const travelerReport = useMemo(() => buildTravelerReport(traveler, displayExpenses), [traveler, displayExpenses])
  const statement = useMemo(() => buildAccountStatement(opening, traveler, displayExpenses), [opening, traveler, displayExpenses])
  const pays = useMemo(() => settlements.filter(s => s.fromId === traveler.id), [settlements, traveler.id])
  const receives = useMemo(() => settlements.filter(s => s.toId === traveler.id), [settlements, traveler.id])
  const { logs, error: logsError } = useDepositLogs(traveler.id, isAdmin && activeTab === 'statement')

  // إعادة حيلة محرك WebKit لتجاوز حظر الطباعة التلقائي في iOS Safari
  const handlePrint = () => {
    const root = document.getElementById('print-root')
    if (root) {
      root.className = `print-mode-statement`
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

  const generatedAt = new Date().toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <motion.div
      className="fixed inset-0 z-[9998] bg-slate-50 overflow-y-auto"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      {/* هيدر ثابت كامل الشاشة لمنع التداخل مع كيبورد الجوال أو أزرار السفاري */}
      <header className="sticky top-0 z-10 bg-teal-700 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="font-bold text-base sm:text-lg truncate">
            ملف المسافر: {traveler.name}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!statement}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              type="button"
              onClick={() => exportTravelerToExcel({
                traveler,
                balance: { ...traveler, deposited: opening, totalExpenses: statement.totalShare, remaining: statement.remaining },
                statement,
                filenameSuffix: isFiltered ? `_دورة_${formatPeriodLabel(selectedPeriod as PeriodKey)}` : undefined,
              })}
              className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-teal-800/60 hover:bg-teal-800 text-teal-50 transition-colors flex items-center justify-center min-h-[36px] min-w-[36px]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 🆕 مُصفّي الدورة — الرحلة الطويلة فقط (periods). يؤثّر في التبويبين معاً. */}
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
        {/* المؤشرات العلوية الأساسية */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard Icon={Wallet} label={isFiltered ? 'رصيد الافتتاح' : 'المودَع'} value={fmt(opening)} tone="teal" />
          <KpiCard Icon={Receipt} label="نصيبه" value={fmt(statement.totalShare)} tone="rose" />
          <KpiCard Icon={Scale} label={isFiltered ? 'رصيد الإغلاق' : 'المتبقي'} value={fmt(statement.remaining)} tone={statement.remaining < 0 ? 'rose' : 'teal'} />
        </div>

        {hasUnknownOpening && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            هذه أول دورة مسجَّلة له — لا رصيد افتتاحي سابق معروف، فـ«رصيد الافتتاح/الإغلاق» أعلاه صافي حركة هذه الدورة وحدها لا رصيداً نهائياً حقيقياً.
          </p>
        )}

        {/* أزرار التبديل */}
        <div className="flex bg-slate-200/70 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-colors ${activeTab === 'summary' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            الخلاصة والتسويات
          </button>
          <button
            onClick={() => setActiveTab('statement')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-colors ${activeTab === 'statement' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            كشف الحساب التفصيلي
          </button>
        </div>

        {/* محتوى: الخلاصة والتسويات */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            {(pays.length > 0 || receives.length > 0) && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-2">
                {pays.map((s, i) => (
                  <div key={`p${i}`} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-700">عليه تحويل إلى {nameById.get(s.toId) ?? s.toName}</span>
                    <span className="font-black text-rose-600 tabular-nums">{fmt(s.amount)} ﷼</span>
                  </div>
                ))}
                {receives.map((s, i) => (
                  <div key={`r${i}`} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-700">له عند {nameById.get(s.fromId) ?? s.fromName}</span>
                    <span className="font-black text-teal-600 tabular-nums">{fmt(s.amount)} ﷼</span>
                  </div>
                ))}
              </section>
            )}

            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">تفاصيل حصصه ({travelerReport.lines.length})</h3>
                <span className="text-xs font-black text-slate-700 tabular-nums">{fmt(travelerReport.totalShare)} ﷼</span>
              </div>
              {travelerReport.lines.length === 0 ? (
                <p className="text-center text-slate-400 font-medium text-sm py-8">لم يشارك في أي مصروف بعد.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {travelerReport.lines.map(line => (
                    <div key={line.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{line.description}</p>
                        <p className="text-[11px] text-slate-400 font-bold">{line.date} · {line.category}</p>
                      </div>
                      <span className="font-black text-slate-800 tabular-nums text-sm shrink-0 ms-3">{fmt(line.share)} ﷼</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 🆕 خروج المنتدَب — أسفل الخلاصة والتسويات عمداً: بعد أن يراجع من
                يديرها حصصه فقط، لا زرّ عابر على بطاقة مضغوطة. نفس المكان الذي
                سيفتحه العضو نفسه مستقبلاً حين يُربط حسابه ويصير قادراً على
                مراجعة مصروفاته ثم تسوية حسابه والخروج ذاتياً. */}
            {longTermExit?.canManage && (
              <section className="bg-white rounded-2xl shadow-sm border border-rose-200 p-4">
                <button
                  type="button"
                  onClick={longTermExit.onExit}
                  disabled={longTermExit.isBusy}
                  className="w-full flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-600 disabled:opacity-40 text-rose-700 hover:text-white font-bold text-sm py-3 rounded-xl transition-colors"
                >
                  <DoorOpen className="w-4 h-4" />
                  {settlementDirection(balance.remaining) === 'settled' ? 'إخراج من الرحلة' : 'تسوية وخروج من الرحلة'}
                </button>
                <p className="text-[11px] text-slate-500 mt-2 text-center leading-relaxed">
                  يُسوَّى حسابه فوراً ويخرج من قائمة الأعضاء النشطين — سجلّه المالي يبقى محفوظاً.
                </p>
              </section>
            )}
          </div>
        )}

        {/* محتوى: كشف الحساب التفصيلي */}
        {activeTab === 'statement' && statement && (
          <div className="space-y-5">
            {/* 🆕 صيغة الرصيد كاملة حين دفع مصروفاً واحداً على الأقل من جيبه — لا
                تُعرض لغيره تفادياً لتكرار ما تقوله بطاقات "الخلاصة" أعلاه بالفعل. */}
            {statement.totalPaidByPocket !== 0 && (
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiCard Icon={Wallet} label={isFiltered ? 'رصيد الافتتاح' : 'المودَع'} value={fmt(statement.opening)} tone="teal" />
                <KpiCard Icon={HandCoins} label="دفعه من جيبه" value={fmt(statement.totalPaidByPocket)} tone="teal" />
                <KpiCard Icon={Receipt} label="نصيبه من المصاريف" value={fmt(statement.totalShare)} tone="rose" />
                <KpiCard Icon={Scale} label={isFiltered ? 'رصيد الإغلاق' : 'المتبقي'} value={fmt(statement.remaining)} tone={statement.remaining < 0 ? 'rose' : 'teal'} />
              </section>
            )}

            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-1">حركة المصاريف — رصيد جارٍ</h3>
              {statement.rows.length === 0 ? (
                <p className="text-center text-slate-400 font-medium text-sm py-8">لم يشارك في أي مصروف بعد.</p>
              ) : (
                <StatementTimeline
                  opening={statement.opening}
                  openingLabel={isFiltered ? 'رصيد الافتتاح' : 'المودَع الابتدائي'}
                  rows={statement.rows}
                  closing={statement.remaining}
                  closingLabel={isFiltered ? 'رصيد الإغلاق' : 'الرصيد الحالي'}
                />
              )}
            </section>

            {isAdmin && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-slate-800">سجل تعديلات الرصيد</h3>
                </div>
                {logsError ? (
                  <p className="text-center text-rose-500 text-sm py-6">تعذّر تحميل السجل — تحقّق من صلاحياتك.</p>
                ) : logs === null ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>
                ) : logs.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">لا توجد تعديلات مسجّلة على الرصيد.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-3 gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-700">{MODE_LABELS[log.mode] ?? log.mode}</p>
                          <p className="text-[11px] text-slate-400 font-bold">
                            {new Date(log.createdAt).toLocaleDateString('ar-SA', { dateStyle: 'medium' })}
                            {log.reason ? ` · ${log.reason}` : ''}
                          </p>
                        </div>
                        <span className={`font-black tabular-nums shrink-0 ${log.delta >= 0 ? 'text-teal-600' : 'text-rose-600'}`} dir="ltr">
                          {log.delta >= 0 ? '+' : ''}{fmt(log.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* بوابات الحقن للطباعة المتوافقة بالكامل مع نظام خيارات حظر سفاري في نظام iOS */}
      {createPortal(
        <div id="print-root" className="print-mode-statement">
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

          {traveler && statement && (
            <div className="print-doc-statement">
              <PrintableStatement
                tripName={isFiltered ? `دورة ${formatPeriodLabel(selectedPeriod as PeriodKey)}` : ''}
                generatedAt={generatedAt}
                traveler={traveler}
                statement={statement}
                logs={logs}
                isAdmin={isAdmin}
              />
            </div>
          )}
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
      <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold">{label}</span>
      </div>
      <p className={`text-base font-black tabular-nums ${TONE[tone]}`} dir="ltr">{value}</p>
    </div>
  )
}

// ─── خط زمني كشف الحساب ───────────────────────────────────────────────────────
// 🆕 استُبدلت به قائمة صفوف مسطّحة (bullet list) كانت تكرر نفس المعلومة
// (تاريخ/وصف/مبلغ/رصيد) في أربعة أعمدة بلا رابط بصري بينها — القراءة تتطلب
// تتبّع عمود "الرصيد الجاري" يدوياً سطراً سطراً. خط عمودي متصل بنقاط ملوّنة
// (نمط سجلّ Git الشائع) يجعل القصة الزمنية الكاملة مقروءة بنظرة واحدة: يبدأ
// برصيد الافتتاح، ينتهي بالرصيد الحالي، وكل حركة بينهما نقطة على نفس الخط.
//
// ⚠️ لا حساب مالي جديد هنا — عرضي بحت فوق statement.rows/opening/remaining
// المحسوبة أصلاً في buildAccountStatement.

/** لون/أيقونة كل نقطة — يميّز مصروف الترحيل الشهري (ROLLOVER_CATEGORY) عن
 *  الصرف الحقيقي بلون مستقل (indigo)، هو نفسه لون "الميزة الطويلة" في بقية
 *  التطبيق (LongTermPanel/الهيدر)، فلا يُقرأ كخطأ أو صرف عادي بالخطأ. */
function timelineRowStyle(row: StatementRow): { Icon: typeof Wallet; dot: string; amountColor: string; sign: string; badge?: string } {
  if (row.category === ROLLOVER_CATEGORY) {
    return { Icon: RefreshCw, dot: 'bg-indigo-500', amountColor: 'text-indigo-600', sign: '−', badge: 'ترحيل شهري' }
  }
  if (row.kind === 'paidByPocket') {
    return { Icon: HandCoins, dot: 'bg-teal-500', amountColor: 'text-teal-600', sign: '+', badge: 'دفعها من جيبه' }
  }
  return { Icon: Receipt, dot: 'bg-rose-500', amountColor: 'text-rose-600', sign: '−' }
}

/** "١٠ يوليو" — تُبنى من مكوّنات التاريخ مباشرة (Date محلّي، لا new Date(iso))
 *  لتفادي فخّ منطقة زمنية UTC الموصوف في utils/period.ts؛ نفس المبدأ هنا. */
function formatRowDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(y, m - 1, d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' })
}

interface StatementTimelineProps {
  opening: number
  openingLabel: string
  rows: StatementRow[]
  closing: number
  closingLabel: string
}

function StatementTimeline({ opening, openingLabel, rows, closing, closingLabel }: StatementTimelineProps) {
  const closingNegative = closing < 0
  return (
    <ol className="relative">
      {/* الخط العمودي المتصل — خلف كل النقاط، بعرض النقطة بالضبط (26px) لتتمركز فوقه. */}
      <div className="absolute top-1 bottom-1 start-[13px] w-0.5 bg-slate-200" aria-hidden="true" />

      <li className="relative flex gap-3 pb-5 ps-9">
        <span className="absolute start-0 top-0.5 w-[26px] h-[26px] rounded-full bg-slate-600 text-white flex items-center justify-center ring-4 ring-white shrink-0">
          <Wallet className="w-3 h-3" />
        </span>
        <div className="flex-1 flex items-center justify-between min-w-0 gap-2 pt-1">
          <p className="font-bold text-slate-700 text-sm">{openingLabel}</p>
          <p className="font-black tabular-nums text-sm text-slate-700 shrink-0" dir="ltr">{fmt(opening)} ﷼</p>
        </div>
      </li>

      {rows.map(r => {
        const { Icon, dot, amountColor, sign, badge } = timelineRowStyle(r)
        return (
          <li key={r.id} className="relative flex gap-3 pb-5 ps-9">
            <span className={`absolute start-0 top-0.5 w-[26px] h-[26px] rounded-full ${dot} text-white flex items-center justify-center ring-4 ring-white shrink-0`}>
              <Icon className="w-3 h-3" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate flex items-center gap-1.5 flex-wrap">
                    {r.description}
                    {badge && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                        {badge}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">{formatRowDate(r.date)} · {r.category}</p>
                </div>
                <p className={`font-black tabular-nums text-sm shrink-0 ${amountColor}`} dir="ltr">
                  {sign}{fmt(r.amount)}
                </p>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-1" dir="ltr">
                الرصيد: <span className={r.balanceAfter < 0 ? 'text-rose-500' : 'text-teal-600'}>{fmt(r.balanceAfter)} ﷼</span>
              </p>
            </div>
          </li>
        )
      })}

      <li className="relative flex gap-3 ps-9">
        <span className={`absolute start-0 top-0.5 w-[26px] h-[26px] rounded-full ${closingNegative ? 'bg-rose-600' : 'bg-teal-600'} text-white flex items-center justify-center ring-4 ring-white shrink-0`}>
          <Scale className="w-3 h-3" />
        </span>
        <div className="flex-1 flex items-center justify-between min-w-0 gap-2 pt-1">
          <p className="font-bold text-slate-800 text-sm">{closingLabel}</p>
          <p className={`font-black tabular-nums text-sm shrink-0 ${closingNegative ? 'text-rose-600' : 'text-teal-600'}`} dir="ltr">
            {fmt(closing)} ﷼
          </p>
        </div>
      </li>
    </ol>
  )
}