// 🆕 «هذا الشهر» كنافذة لا كقسم في الشاشة الرئيسية.
//
// LongTermPanel نفسه لم يتغيّر بحرف — يُغلَّف هنا فقط. سبب الغلاف بدل نقل
// محتواه: القسم يبقى صالحاً كما هو لو أُعيد يوماً إلى الشاشة، والميزة كلها
// تبقى معزولة في مجلّدها كما ينصّ تعليق LongTermPanel.tsx.
//
// 🆕 **تأكيد الإغلاق خطوة داخل هذه النافذة، لا نافذة تحلّ محلّها.** كان زرّ
// «إغلاق الشهر» يُغلق هذه النافذة ليفتح MonthlyRolloverModal — حالة في اتحاد
// ModalState لا يفتحها شيء سوى هذا الزرّ. الآن يتبدّل المحتوى وحده: العرض ←
// التأكيد ← (إلغاء: عودة للعرض | نجاح: تُغلق النافذة من onConfirmRollover في
// useTripWorkspace، وعند الفشل تبقى على التأكيد مع رسالة السبب).
//
// 🆕 **ومن شريط «انتهى الشهر» تبدأ بالتأكيد نفسه** (`startAtConfirm`): المسار
// كان أربع ضغطات — اسم الرحلة ← «هذا الشهر» ← «إغلاق…» ← «تأكيد» — لعملية
// تتكرّر كل شهر. الشريط يختصرها إلى ضغطتين، والتأكيد باقٍ لأن الإغلاق لا
// يُتراجع عنه. والإلغاء هنا يُغلق النافذة لا يعود للعرض: من جاء من الشاشة
// الرئيسية يعود إليها، لا إلى شاشة لم يطلبها.
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { X } from '../../icons'
import { Modal } from '../Modal'
import { LongTermPanel } from '../longterm/LongTermPanel'
import { RolloverConfirm } from '../longterm/RolloverConfirm'
import { formatPeriodLabel } from '../../utils/period'
import type { RolloverMovement } from '../../types'

interface LongTermModalProps extends Omit<ComponentProps<typeof LongTermPanel>, 'onCloseMonth'> {
  /** معاينة الترحيل وتنفيذه — تُعرض بعد «إغلاق الشهر» داخل نفس النافذة. */
  rollover: {
    movements: RolloverMovement[]
    isClosingMonth: boolean
    onConfirm: () => void
  }
  /** 🆕 تبدأ بخطوة التأكيد — من شريط «انتهى الشهر» (MonthDueBanner). */
  startAtConfirm?: boolean
  onClose: () => void
}

export default function LongTermModal({ onClose, rollover, startAtConfirm = false, ...panel }: LongTermModalProps) {
  const [confirming, setConfirming] = useState(startAtConfirm)

  return (
    <Modal
      onClose={onClose}
      label={confirming ? `إغلاق ${formatPeriodLabel(panel.period)}` : 'هذا الشهر'}
      maxWidth="max-w-lg"
    >
      <div className="flex items-center justify-end mb-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق نافذة هذا الشهر"
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {confirming ? (
        <RolloverConfirm
          period={panel.period}
          movements={rollover.movements}
          isSubmitting={rollover.isClosingMonth}
          onConfirm={rollover.onConfirm}
          onCancel={startAtConfirm ? onClose : () => setConfirming(false)}
        />
      ) : (
        <LongTermPanel {...panel} onCloseMonth={() => setConfirming(true)} />
      )}
    </Modal>
  )
}
