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
//
// 🆕 لا يعرض قائمة مسافرين بعد الآن — كانت هذه القائمة تكرّر حرفياً ما تعرضه
// «أرصدة المسافرين» فوقها (نفس travelersPanelBalances)، فبدت الشاشة مزدوجة.
// زرّ الخروج انتقل إلى TravelerCard نفسه (longTermExit prop في
// TravelerSection.tsx)، وbقي هنا فقط ما لا يُعرض في مكان آخر: إحصائيات الشهر
// وزرّ إغلاقه.
import type { PeriodKey } from '../../types'
import { formatPeriodLabel } from '../../utils/period'
import { CalendarClock, CalendarCheck, Loader2, Receipt } from '../../icons'

interface LongTermPanelProps {
  /** الشهر المفتوح حالياً — مصدره مستند الرحلة لا تقويم الجهاز. */
  period: PeriodKey
  lastClosedPeriod?: PeriodKey
  /** إجمالي مصاريف هذا الشهر وعددها — محسوبان في المنسّق بتصفية بالتاريخ. */
  periodTotal: number
  periodCount: number
  /** منظّم الرحلة أو المسؤول — الوحيد الذي يرى زرّ الإغلاق. */
  canManage: boolean
  isBusy: boolean
  /** لا معنى لإغلاق شهر بلا أعضاء نشطين — نفس الشرط الذي كان `balances.length === 0`. */
  hasActiveTravelers: boolean
  onCloseMonth: () => void
}

const money = (value: number) => `${value.toFixed(2)} ريال`

export function LongTermPanel({
  period, lastClosedPeriod, periodTotal, periodCount,
  canManage, isBusy, hasActiveTravelers, onCloseMonth,
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

        {/* ⚠️ هذا العنوان ليس تزييناً. بطاقة المسافر في «أرصدة المسافرين» **لا
            تعرض زرّ حذف إطلاقاً لمن له مصاريف** (تعرض «مربوط بمصاريف») في
            الرحلة القياسية — قاعدة قائمة ومنطقية فيها. في الرحلة الطويلة تحلّ
            محلّها بطاقة خروج دائمة الظهور (longTermExit)، فذلك الطريق المسدود
            لا وجود له هنا. */}
        {canManage && (
          <p className="px-4 pt-3 pb-2 text-[11px] text-slate-500 leading-relaxed">
            لإخراج عضو مغادر: سوِّ حسابه وأخرجه بضغطة واحدة من زرّ «تسوية وخروج» في بطاقته أعلاه ضمن «أرصدة المسافرين».
          </p>
        )}

        {canManage && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              type="button"
              onClick={onCloseMonth}
              disabled={isBusy || !hasActiveTravelers}
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
