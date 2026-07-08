import type { FormEvent, Dispatch, SetStateAction } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Plus, Minus, Target, X, Check } from '../../icons'
import { Modal } from '../Modal'
import type { Traveler, DepositMode } from '../../types'

interface DepositModeOption {
  key: DepositMode
  label: string
  Icon: LucideIcon
}

const DEPOSIT_MODES: DepositModeOption[] = [
  { key: 'add',      label: 'إضافة',        Icon: Plus   },
  { key: 'subtract', label: 'خصم',           Icon: Minus  },
  { key: 'set',      label: 'تحديد القيمة', Icon: Target },
]

interface DepositModalProps {
  traveler: Traveler
  amount: string
  setAmount: Dispatch<SetStateAction<string>>
  mode: DepositMode
  setMode: Dispatch<SetStateAction<DepositMode>>
  // 🆕 سبب اختياري للتعديل — يُحفظ بسجل التدقيق لتفادي نزاعات لاحقة
  reason: string
  setReason: Dispatch<SetStateAction<string>>
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

const DepositModal = ({
  traveler, amount, setAmount,
  mode, setMode, reason, setReason, onSubmit, onClose,
}: DepositModalProps) => (
  <Modal onClose={onClose}>
    <h3 className="font-bold mb-4">تعديل رصيد {traveler.name}</h3>
    <div className="flex gap-2 mb-4">
      {DEPOSIT_MODES.map(({ key, label, Icon }) => (
        <button
          key={key} type="button" onClick={() => setMode(key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${
            mode === key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
    <p className="text-xs text-slate-400 mb-3">الرصيد الحالي: {traveler.deposited.toFixed(2)} ريال</p>
    <form onSubmit={onSubmit}>
      <input
        type="number" required min="0" step="0.01" autoFocus value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={mode === 'set' ? 'الرصيد الجديد (ريال)' : 'المبلغ (ريال)'}
        className="w-full border rounded-xl p-3 mb-3 focus:ring-2 outline-none font-bold"
      />
      <input
        type="text" value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="سبب التعديل (اختياري) — مثال: دفع نقدي إضافي، تصحيح خطأ"
        maxLength={300}
        className="w-full border rounded-xl p-2.5 mb-4 text-xs focus:ring-2 outline-none"
      />
      <div className="flex gap-3">
        <button type="submit" className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 text-white py-2.5 rounded-xl font-bold">
          <Check className="w-4 h-4" /> حفظ
        </button>
        <button type="button" onClick={onClose} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold">
          <X className="w-4 h-4" /> إلغاء
        </button>
      </div>
    </form>
  </Modal>
)

export default DepositModal
