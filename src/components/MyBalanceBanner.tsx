import { Scale } from '../icons'
import type { TravelerBalance } from '../types'
import { haptic } from '../utils/haptics'

interface MyBalanceBannerProps {
  balance: TravelerBalance
}

// ─── MyBalanceBanner ────────────────────────────────────────────────────────
// 🆕 نموذج الهوية الهجين — ملخّص مضغوط لموقف المستخدم المالي الشخصي (لا موقف
// الرحلة ككل، الذي يبقى في حبّات الترويسة). يظهر فقط حين traveler.uid يطابق
// المستخدم الحالي فعلياً (ledger.myBalance في useAppCoordinator.ts) — أي أن
// من لا حساب له مربوط بمسافر لا يرى شيئاً هنا، بلا حاجة لفحص إضافي.
//
// الضغط يمرّر لبطاقته في قسم المسافرين (المثبَّتة أولاً — انظر
// travelersPanelBalances) بدل فتح نافذة كشف الحساب مباشرة من هنا: نفس نمط
// حبّات الترويسة (onStatClick في Header.tsx) بالضبط، فلا يحتاج هذا المكوّن
// أن يعرف شيئاً عن TravelerProfileModal أو حالته.
export default function MyBalanceBanner({ balance }: MyBalanceBannerProps) {
  const isNegative = balance.remaining < 0

  const scrollToMyCard = () => {
    haptic.light()
    document.getElementById('travelers-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <button
      type="button"
      onClick={scrollToMyCard}
      className={`w-full flex items-center justify-between gap-3 rounded-2xl p-4 border shadow-sm transition-colors text-start ${
        isNegative
          ? 'bg-rose-50 border-rose-200 hover:bg-rose-100'
          : 'bg-teal-50 border-teal-200 hover:bg-teal-100'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isNegative ? 'bg-rose-100 text-rose-600' : 'bg-teal-100 text-teal-700'
          }`}
        >
          <Scale className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-bold ${isNegative ? 'text-rose-700' : 'text-teal-700'}`}>
            {isNegative ? 'عليك للصندوق' : 'لك في الصندوق'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">موقفك المالي الشخصي في هذه الرحلة</p>
        </div>
      </div>
      <span
        className={`text-lg font-black tabular-nums shrink-0 ${isNegative ? 'text-rose-600' : 'text-teal-700'}`}
        dir="ltr"
      >
        {Math.abs(balance.remaining).toFixed(2)} ﷼
      </span>
    </button>
  )
}
