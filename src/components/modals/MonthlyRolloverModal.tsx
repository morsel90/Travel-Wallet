// 🆕 تأكيد إغلاق الشهر وترحيل الأرصدة — الرحلات طويلة المدى وحدها.
//
// ⚠️ ما يُعرض هنا **معاينة محلية لا أمر تنفيذ**: تُبنى من planRollover على
// الأرصدة المعروضة أصلاً في الشاشة. الخطة المنفَّذة تُحسب من جديد داخل
// closeMonth على بيانات الخادم لحظة الضغط، ولا يُرسَل من هنا سوى معرّف الرحلة
// والشهر. أي اختلاف بين المعروض والمنفَّذ يعني أن أحدهم سجّل مصروفاً في هذه
// الأثناء — وهو سبب وجيه لأن يكون الخادم هو الحاسب لا المتصفح.
import { Modal } from '../Modal'
import { formatPeriodLabel, nextPeriod } from '../../utils/period'
import { countRolloverMovements } from '../../utils/longTerm'
import { CalendarCheck, Loader2, AlertTriangle } from '../../icons'
import type { PeriodKey, RolloverMovement } from '../../types'

interface MonthlyRolloverModalProps {
  period: PeriodKey
  movements: RolloverMovement[]
  isSubmitting: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function MonthlyRolloverModal({
  period, movements, isSubmitting, onConfirm, onClose,
}: MonthlyRolloverModalProps) {
  const opening = nextPeriod(period)
  const affected = countRolloverMovements(movements)

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" label={`إغلاق ${formatPeriodLabel(period)}`}>
      <h3 className="font-bold mb-1 flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-indigo-600" />
        إغلاق {formatPeriodLabel(period)}
      </h3>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        سيُصفَّر رصيد كل عضو في {formatPeriodLabel(period)}، ويُفتح {formatPeriodLabel(opening)} بنفس
        القيمة رصيداً افتتاحياً. <span className="font-bold text-slate-600">الرصيد الصافي لأي عضو لا يتغيّر</span> —
        الإغلاق يرسم خطاً بين الشهرين لا أكثر.
      </p>

      {affected === 0 ? (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            كل الأرصدة مسوّاة — لن تُكتب أي حركة مالية. الإغلاق سيمضي بالشهر إلى {formatPeriodLabel(opening)} فقط.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-4 max-h-64 overflow-y-auto">
          <ul className="divide-y divide-slate-100 text-xs">
            {movements.map(m => (
              <li key={m.travelerId} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-bold text-slate-700 truncate">{m.travelerName}</span>
                {m.direction === 'settled' ? (
                  <span className="text-slate-400 shrink-0">مسوّى — بلا حركة</span>
                ) : (
                  <span className={`shrink-0 tabular-nums ${m.direction === 'credit' ? 'text-teal-700' : 'text-rose-600'}`}>
                    {m.direction === 'credit' ? 'يُرحَّل له ' : 'يُرحَّل عليه '}
                    {Math.abs(m.remaining).toFixed(2)} ريال
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2"
        >
          {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإغلاق…</> : 'تأكيد الإغلاق'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold disabled:opacity-50"
        >
          إلغاء
        </button>
      </div>
    </Modal>
  )
}
