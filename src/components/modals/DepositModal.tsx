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

// دالة تحويل الأرقام الهندية/الشرقية (١٢٣) إلى أرقام غربية (123) تلقائياً
const convertArabicNumerals = (str: string): string => {
  const map: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' }
  return str.replace(/[٠-٩]/g, ch => map[ch] ?? ch)
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
      {/* 🆕 تم إضافة text-base هنا لمنع الزوم تلقائياً في الآيفون */}
      <input
        type="text"
        inputMode="decimal"
        required 
        autoFocus 
        value={amount}
        onChange={(e) => {
          const converted = convertArabicNumerals(e.target.value);
          const sanitized = converted.replace(/[^0-9.]/g, '');
          const parts = sanitized.split('.');
          const finalValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
          
          setAmount(finalValue);
        }}
        placeholder={mode === 'set' ? 'الرصيد الجديد (ريال)' : 'المبلغ (ريال)'}
        className="w-full border rounded-xl p-3 mb-3 text-base focus:ring-2 outline-none font-bold"
      />
      {/* 🆕 تم تعديل الحجم هنا من text-xs إلى text-base لغلق ثغرة الزوم نهائياً */}
      <input
        type="text" value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="سبب التعديل (اختياري) — مثال: دفع نقدي إضافي، تصحيح خطأ"
        maxLength={300}
        className="w-full border rounded-xl p-3 mb-4 text-base focus:ring-2 outline-none"
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