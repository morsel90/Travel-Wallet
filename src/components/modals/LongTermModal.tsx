// 🆕 «الشهر المحاسبي» كنافذة لا كقسم في الشاشة الرئيسية.
//
// LongTermPanel نفسه لم يتغيّر بحرف — يُغلَّف هنا فقط. سبب الغلاف بدل نقل
// محتواه: القسم يبقى صالحاً كما هو لو أُعيد يوماً إلى الشاشة، والميزة كلها
// تبقى معزولة في مجلّدها كما ينصّ تعليق LongTermPanel.tsx.
import { X } from '../../icons'
import { Modal } from '../Modal'
import { LongTermPanel } from '../longterm/LongTermPanel'
import type { ComponentProps } from 'react'

interface LongTermModalProps extends ComponentProps<typeof LongTermPanel> {
  onClose: () => void
}

export default function LongTermModal({ onClose, ...panel }: LongTermModalProps) {
  return (
    <Modal onClose={onClose} label="الشهر المحاسبي" maxWidth="max-w-lg">
      <div className="flex items-center justify-end mb-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الشهر المحاسبي"
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* إغلاق الشهر يُغلق النافذة أيضاً: مودال التأكيد (MonthlyRolloverModal)
          يحلّ محلّها، ومودالان مفتوحان معاً يخالفان عقد ModalState الموحّد. */}
      <LongTermPanel {...panel} onCloseMonth={() => { onClose(); panel.onCloseMonth() }} />
    </Modal>
  )
}
