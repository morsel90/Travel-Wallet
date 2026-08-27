// 🆕 خروج منتدَب من رحلة طويلة المدى — بحساب مسوّى إلزاماً.
//
// ⚠️ **هذه الشاشة هي «الإرشاد» المطلوب، لا الحارس.** الحارس في exitTraveler
// (functions/index.js) التي تُعيد حساب الرصيد خادمياً وترفض بنفس الصياغة. ما
// تضيفه الشاشة أن المنظّم يرى المبلغ واتجاهه قبل أن يقرّر، وأن التسوية والخروج
// يقعان بضغطة واحدة في معاملة واحدة بدل خطوتين قد تنقطع إحداهما.
import { Modal } from '../Modal'
import { settlementDirection, describeOrganizerExitBlock } from '../../utils/longTerm'
import { DoorOpen, Loader2, AlertTriangle } from '../../icons'
import type { TravelerBalance } from '../../types'

interface ExitTravelerModalProps {
  traveler: TravelerBalance
  isSubmitting: boolean
  /** منظّم الرحلة الحالية (trips/{tripId}.organizerUid) — لمنع إخراج نفسه. */
  organizerUid?: string | null
  /** `settle` صحيحة حين يختار المنظّم تسوية الرصيد ضمن نفس العملية. */
  onConfirm: (settle: boolean) => void
  onClose: () => void
}

export default function ExitTravelerModal({
  traveler, isSubmitting, organizerUid, onConfirm, onClose,
}: ExitTravelerModalProps) {
  const direction = settlementDirection(traveler.remaining)
  const amount = Math.abs(traveler.remaining).toFixed(2)
  const organizerBlock = describeOrganizerExitBlock(traveler.uid, organizerUid, traveler.name)

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm" label={`إخراج ${traveler.name}`}>
      <h3 className="font-bold mb-1 flex items-center gap-2">
        <DoorOpen className="w-4 h-4 text-rose-600" /> إخراج {traveler.name}
      </h3>

      {organizerBlock ? (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 my-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">{organizerBlock}</p>
        </div>
      ) : direction === 'settled' ? (
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          حسابه مسوّى — يمكن إخراجه مباشرةً. سيُنقل إلى سلة المهملات ويبقى سجلّه المالي
          كاملاً للرجوع إليه.
        </p>
      ) : (
        <>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 my-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              {direction === 'credit'
                ? <>حسابه غير مسوّى: <span className="font-bold tabular-nums">له {amount} ريال</span>. لا يمكن إخراجه قبل تسوية هذا المبلغ.</>
                : <>حسابه غير مسوّى: <span className="font-bold tabular-nums">عليه {amount} ريال</span>. لا يمكن إخراجه قبل تسوية هذا المبلغ.</>}
            </p>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            «تسوية وخروج» تُنشئ معاملة التسوية التي تُصفّر الرصيد ثم تُخرجه — في عملية واحدة.
            {direction === 'credit'
              ? ' تُسجَّل بوصفها إعادة المبلغ المتبقّي له.'
              : ' تُسجَّل بوصفها استلام المبلغ منه.'}
          </p>
        </>
      )}

      <div className="flex gap-3">
        {!organizerBlock && (
          <button
            type="button"
            onClick={() => onConfirm(direction !== 'settled')}
            disabled={isSubmitting}
            className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التنفيذ…</>
              : direction === 'settled' ? 'إخراج' : 'تسوية وخروج'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold disabled:opacity-50"
        >
          {organizerBlock ? 'حسناً' : 'إلغاء'}
        </button>
      </div>
    </Modal>
  )
}
