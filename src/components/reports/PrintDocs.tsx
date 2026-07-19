// 🆕 مستندات الطباعة (تقرير الرحلة + كشف الحساب) — مكوّنات عرض بحتة تُركَّب داخل
// #print-root (عبر Portal في ReportsView) وتظهر فقط عند الطباعة/حفظ PDF. تعتمد
// على الطباعة الأصلية للمتصفح لضمان تشكيل عربي مثالي (المتصفح يرسم النص).

import type { Traveler, TravelerBalance, Settlement, CategoryTotal, Expense, DepositLogEntry } from '../../types'
import { buildDailySummary, type AccountStatement } from '../../utils/reportData'

const fmt = (n: number): string => n.toFixed(2)

interface DocFrameProps {
  title: string
  subtitle?: string
  generatedAt: string
  children: React.ReactNode
}

const DocFrame = ({ title, subtitle, generatedAt, children }: DocFrameProps) => (
  <div dir="rtl" className="text-slate-900 font-[system-ui] p-2" style={{ fontSize: '12px', lineHeight: 1.5 }}>
    <div className="flex items-end justify-between border-b-2 border-teal-700 pb-2 mb-4">
      <div>
        <h1 className="text-xl font-black text-teal-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
      </div>
      <p className="text-[11px] text-slate-500">تاريخ الإصدار: {generatedAt}</p>
    </div>
    {children}
    <p className="text-[10px] text-slate-400 text-center mt-6 pt-2 border-t border-slate-200">
      مُصدَر من تطبيق مصاريف السفر — الأرقام بالريال السعودي (﷼)
    </p>
  </div>
)

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-sm font-bold text-teal-800 bg-teal-50 border border-teal-100 rounded px-2 py-1 mt-5 mb-2 print:break-inside-avoid">
    {children}
  </h2>
)

const th = 'border border-slate-300 px-2 py-1 text-right font-bold bg-slate-100'
const td = 'border border-slate-300 px-2 py-1 text-right tabular-nums'

// ─── تقرير الرحلة الكامل ─────────────────────────────────────────────────────
interface TripReportProps {
  tripName: string
  generatedAt: string
  travelers: Traveler[]
  expenses: Expense[]
  balances: TravelerBalance[]
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
}

export const PrintableTripReport = ({ tripName, generatedAt, travelers, expenses, balances, settlements, categoryTotals }: TripReportProps) => {
  const deposited = balances.reduce((s, b) => s + b.deposited, 0)
  const spent = balances.reduce((s, b) => s + b.totalExpenses, 0)
  const remaining = balances.reduce((s, b) => s + b.remaining, 0)
  const days = new Set(expenses.map(e => e.date)).size
  const daily = buildDailySummary(expenses)
  const catTotal = categoryTotals.reduce((s, c) => s + c.total, 0)

  return (
    <DocFrame title="تقرير الرحلة" subtitle={tripName} generatedAt={generatedAt}>
      {/* ملخص علوي */}
      <div className="grid grid-cols-3 gap-2 text-center print:break-inside-avoid">
        {[
          ['إجمالي المودَع', fmt(deposited)],
          ['إجمالي المصروف', fmt(spent)],
          ['المتبقي', fmt(remaining)],
          ['عدد المصاريف', String(expenses.length)],
          ['عدد المسافرين', String(travelers.length)],
          ['عدد أيام الصرف', String(days)],
        ].map(([label, value]) => (
          <div key={label} className="border border-slate-300 rounded p-2">
            <div className="text-[10px] text-slate-500">{label}</div>
            <div className="font-black text-teal-800" dir="ltr">{value}</div>
          </div>
        ))}
      </div>

      <SectionTitle>ملخص المسافرين</SectionTitle>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>المسافر</th>
            <th className={th}>المودَع</th>
            <th className={th}>نصيبه من المصاريف</th>
            <th className={th}>المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {balances.map(b => (
            <tr key={b.id}>
              <td className={td}>{b.name}</td>
              <td className={td} dir="ltr">{fmt(b.deposited)}</td>
              <td className={td} dir="ltr">{fmt(b.totalExpenses)}</td>
              <td className={td} dir="ltr">{fmt(b.remaining)}</td>
            </tr>
          ))}
          <tr className="font-black bg-slate-50">
            <td className={td}>الإجمالي</td>
            <td className={td} dir="ltr">{fmt(deposited)}</td>
            <td className={td} dir="ltr">{fmt(spent)}</td>
            <td className={td} dir="ltr">{fmt(remaining)}</td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>التسويات المقترحة</SectionTitle>
      {settlements.length === 0 ? (
        <p className="text-slate-500">لا توجد تسويات مطلوبة — الأرصدة متساوية.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>مِن</th>
              <th className={th}>إلى</th>
              <th className={th}>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => (
              <tr key={`${s.fromName}-${s.toName}`}>
                <td className={td}>{s.fromName}</td>
                <td className={td}>{s.toName}</td>
                <td className={td} dir="ltr">{fmt(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {categoryTotals.length > 0 && (
        <>
          <SectionTitle>التوزيع حسب الفئة</SectionTitle>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>الفئة</th>
                <th className={th}>المبلغ</th>
                <th className={th}>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((c) => (
                <tr key={c.category}>
                  <td className={td}>{c.category}</td>
                  <td className={td} dir="ltr">{fmt(c.total)}</td>
                  <td className={td} dir="ltr">
                    {catTotal > 0 ? ((c.total / catTotal) * 100).toFixed(0) : '0'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <SectionTitle>الملخص اليومي</SectionTitle>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>التاريخ</th>
            <th className={th}>العدد</th>
            <th className={th}>إجمالي اليوم</th>
            <th className={th}>التراكمي</th>
          </tr>
        </thead>
        <tbody>
          {daily.map(r => (
            <tr key={r.date}>
              <td className={td}>{r.date}</td>
              <td className={td} dir="ltr">{r.count}</td>
              <td className={td} dir="ltr">{fmt(r.total)}</td>
              <td className={td} dir="ltr">{fmt(r.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocFrame>
  )
}

// ─── كشف حساب مسافر ──────────────────────────────────────────────────────────
const MODE_LABELS: Record<string, string> = { add: 'إضافة', subtract: 'خصم', set: 'تحديد قيمة' }

interface StatementProps {
  tripName: string
  generatedAt: string
  traveler: Traveler
  statement: AccountStatement
  logs: DepositLogEntry[] | null
  isAdmin: boolean
}

export const PrintableStatement = ({ tripName, generatedAt, traveler, statement, logs, isAdmin }: StatementProps) => (
  <DocFrame title={`كشف حساب — ${traveler.name}`} subtitle={tripName} generatedAt={generatedAt}>
    <div className="grid grid-cols-3 gap-2 text-center print:break-inside-avoid">
      {[
        ['المودَع', fmt(statement.opening)],
        ['إجمالي حصصه', fmt(statement.totalShare)],
        ['المتبقي', fmt(statement.remaining)],
      ].map(([label, value]) => (
        <div key={label} className="border border-slate-300 rounded p-2">
          <div className="text-[10px] text-slate-500">{label}</div>
          <div className="font-black text-teal-800" dir="ltr">{value}</div>
        </div>
      ))}
    </div>

    <SectionTitle>حركة المصاريف (حصصه)</SectionTitle>
    {statement.rows.length === 0 ? (
      <p className="text-slate-500">لم يشارك في أي مصروف بعد.</p>
    ) : (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>التاريخ</th>
            <th className={th}>الوصف</th>
            <th className={th}>الفئة</th>
            <th className={th}>حصته</th>
            <th className={th}>الرصيد بعده</th>
          </tr>
        </thead>
        <tbody>
          {statement.rows.map(r => (
            <tr key={r.id}>
              <td className={td}>{r.date}</td>
              <td className={td}>{r.description}</td>
              <td className={td}>{r.category}</td>
              <td className={td} dir="ltr">{fmt(r.share)}</td>
              <td className={td} dir="ltr">{fmt(r.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    {isAdmin && logs && logs.length > 0 && (
      <>
        <SectionTitle>سجل تعديلات الرصيد</SectionTitle>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>التاريخ</th>
              <th className={th}>النوع</th>
              <th className={th}>مِن ← إلى</th>
              <th className={th}>الفرق</th>
              <th className={th}>السبب</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td className={td}>{new Date(log.createdAt).toLocaleDateString('ar-SA', { dateStyle: 'medium' })}</td>
                <td className={td}>{MODE_LABELS[log.mode] ?? log.mode}</td>
                <td className={td} dir="ltr">{fmt(log.previousDeposited)} ← {fmt(log.newDeposited)}</td>
                <td className={td} dir="ltr">{log.delta >= 0 ? '+' : ''}{fmt(log.delta)}</td>
                <td className={td}>{log.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </DocFrame>
)