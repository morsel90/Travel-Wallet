// 🆕 قسم «الشهر المحاسبي» — يظهر في الرحلات طويلة المدى وحدها.
//
// ⚠️ **مكوّن مستقل تماماً لا شرط داخل مكوّن قائم.** لا سطر واحد في
// TravelersPanel/ExpensesPanel/ChartsPanel يعرف بوجود هذه الميزة، وApp.tsx
// يعرضه أو لا يعرضه بشرط واحد (`trip.tripType === 'long_term'`). السبب أن كود
// الرحلة القياسية استقرّ ونضج، وأي شرط يُدسّ داخله يجعل عطلاً في ميزة جديدة
// قادراً على كسر مسار قائم يعمل منذ شهور.
//
// عرضي بالكامل: لا Firestore، لا سياق، لا حساب. كل ما يعرضه محسوب في
// useAppCoordinator من الدوال النقية القائمة أصلاً (calculateBalances) — لا
// رياضيات مالية جديدة على العميل إطلاقاً.
import type { TravelerBalance, PeriodKey } from '../../types'
import { formatPeriodLabel } from '../../utils/period'
import { settlementDirection } from '../../utils/longTerm'
import { CalendarClock, CalendarCheck, DoorOpen, Loader2, Receipt } from '../../icons'

interface LongTermPanelProps {
  /** الشهر المفتوح حالياً — مصدره مستند الرحلة لا تقويم الجهاز. */
  period: PeriodKey
  lastClosedPeriod?: PeriodKey
  /** أرصدة الأعضاء النشطين — نفس المصفوفة التي تستهلكها بقية الشاشات. */
  balances: TravelerBalance[]
  /** إجمالي مصاريف هذا الشهر وعددها — محسوبان في المنسّق بتصفية بالتاريخ. */
  periodTotal: number
  periodCount: number
  /** منظّم الرحلة أو المسؤول — الوحيدان اللذان يريان أزرار الإغلاق والإخراج. */
  canManage: boolean
  isBusy: boolean
  onCloseMonth: () => void
  onExitTraveler: (traveler: TravelerBalance) => void
}

const money = (value: number) => `${value.toFixed(2)} ريال`

export function LongTermPanel({
  period, lastClosedPeriod, balances, periodTotal, periodCount,
  canManage, isBusy, onCloseMonth, onExitTraveler,
}: LongTermPanelProps) {
  return (
    <section id="long-term-section" className="scroll-mt-24">
      <div className="flex justify-between items-center mb-4 px-1">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-slate-500" /> الشهر المحاسبي
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
            {formatPeriodLabel(period)}
          </span>
        </h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
          <div className="p-4">
            <p className="text-[11px] text-slate-500 mb-1 flex items-center gap-1">
              <Receipt className="w-3 h-3" /> مصاريف {formatPeriodLabel(period)}
            </p>
            <p className="font-bold text-slate-800 tabular-nums">{money(periodTotal)}</p>
            <p className="text-[11px] text-slate-400 tabular-nums">{periodCount} عملية</p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-slate-500 mb-1">آخر شهر أُغلق</p>
            {/* غياب lastClosedPeriod يعني «لم يُغلق شيء بعد» — معلومة حقيقية
                تُعرض كما هي، لا تُستبدل بالشهر الجاري (انظر useTripConfig.ts). */}
            <p className="font-bold text-slate-800">
              {lastClosedPeriod ? formatPeriodLabel(lastClosedPeriod) : 'لم يُغلق شهر بعد'}
            </p>
          </div>
        </div>

        <ul className="divide-y divide-slate-100">
          {balances.map(traveler => {
            const direction = settlementDirection(traveler.remaining)
            return (
              <li key={traveler.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-bold text-sm text-slate-700 truncate">{traveler.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      direction === 'credit' ? 'text-teal-700'
                        : direction === 'debt' ? 'text-rose-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {money(traveler.remaining)}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onExitTraveler(traveler)}
                      disabled={isBusy}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600 disabled:opacity-40 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <DoorOpen className="w-3.5 h-3.5" /> إخراج
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {canManage && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              type="button"
              onClick={onCloseMonth}
              disabled={isBusy || balances.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {isBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإغلاق…</>
                : <><CalendarCheck className="w-4 h-4" /> إغلاق {formatPeriodLabel(period)} وترحيل الأرصدة</>}
            </button>
            <p className="text-[11px] text-slate-500 mt-2 text-center leading-relaxed">
              يُصفَّر رصيد كل عضو في الشهر المنتهي، ويُفتح الشهر التالي بنفس القيمة رصيداً افتتاحياً.
              الرصيد الصافي لا يتغيّر.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
