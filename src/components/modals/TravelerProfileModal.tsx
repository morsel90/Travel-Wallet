// TravelerProfileModal.tsx
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Wallet, Receipt, Scale, Loader2, Download, Printer } from '../../icons'
import type { Expense, Traveler, TravelerBalance, Settlement } from '../../types'
import { buildTravelerReport, buildAccountStatement } from '../../utils/reportData'
import { useDepositLogs } from '../../hooks/useDepositLogs'
import { exportTravelerToExcel } from '../../utils/reports'
import { PrintableStatement } from '../reports/PrintDocs' // تأكد من صحة مسار استيراد مستند الطباعة

interface TravelerProfileModalProps {
  traveler: Traveler
  balance: TravelerBalance
  expenses: Expense[]
  settlements: Settlement[]
  allTravelers: Traveler[]
  isAdmin: boolean
  onClose: () => void
}

type TabType = 'summary' | 'statement'

const MODE_LABELS: Record<string, string> = { add: 'إضافة', subtract: 'خصم', set: 'تحديد قيمة' }
const fmt = (n: number): string => n.toFixed(2)

export default function TravelerProfileModal({
  traveler,
  balance,
  expenses,
  settlements,
  allTravelers,
  isAdmin,
  onClose
}: TravelerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary')

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    allTravelers.forEach(t => m.set(t.id, t.name))
    return m
  }, [allTravelers])
  
  const travelerReport = useMemo(() => buildTravelerReport(traveler, expenses), [traveler, expenses])
  const statement = useMemo(() => buildAccountStatement(balance.deposited, traveler, expenses), [balance, traveler, expenses])
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
              onClick={() => exportTravelerToExcel({ traveler, balance, statement })}
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* المؤشرات العلوية الأساسية */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard Icon={Wallet} label="المودَع" value={fmt(balance.deposited)} tone="teal" />
          <KpiCard Icon={Receipt} label="نصيبه" value={fmt(balance.totalExpenses)} tone="rose" />
          <KpiCard Icon={Scale} label="المتبقي" value={fmt(balance.remaining)} tone={balance.remaining < 0 ? 'rose' : 'teal'} />
        </div>

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
          </div>
        )}

        {/* محتوى: كشف الحساب التفصيلي */}
        {activeTab === 'statement' && statement && (
          <div className="space-y-5">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">حركة المصاريف — رصيد جارٍ</h3>
              </div>
              {statement.rows.length === 0 ? (
                <p className="text-center text-slate-400 font-medium text-sm py-8">لم يشارك في أي مصروف بعد.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {statement.rows.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{r.description}</p>
                        <p className="text-[11px] text-slate-400 font-bold">{r.date} · {r.category}</p>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="font-black text-rose-600 tabular-nums text-sm" dir="ltr">−{fmt(r.share)}</p>
                        <p className={`text-[11px] font-bold tabular-nums ${r.balanceAfter < 0 ? 'text-rose-500' : 'text-teal-600'}`} dir="ltr">
                          {fmt(r.balanceAfter)} ﷼
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
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
                tripName=""
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