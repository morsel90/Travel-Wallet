// 🆕 قسم «الأرصدة» — التسويات (من يدفع لمن) كقسم رئيسي مستقلّ في الشاشة.
//
// ⚠️ كان تبويباً أوّلَ داخل «ملخص وإحصائيات الرحلة» (ChartsSection)، أي أن الفعل
// الأكثر تكراراً في رحلة جماعية — «كم أدين ولمن أُحوِّل؟» — كان مدفوناً بجانب
// رسمَين بيانيَّين يُنظر إليهما مرة أو مرتين في الرحلة كلها. الشاشة الرئيسية
// صارت ثلاثة أقسام لا أكثر: المصاريف ← الأرصدة ← المسافرون، وبقية التبويبات
// (حسب الفئة، التطور الزمني) انتقلت خلف زرّ «المزيد». انظر docs/DECISIONS.md.
//
// عرضي بالكامل: لا يقرأ سياقاً ولا يكتب إلى Firestore — نفس عقد بقية
// مكوّنات *Panel.tsx. المسافرون يُمرَّرون كخاصية (لا `useTripData`) لأن
// الحاجة إليهم هنا سطر واحد: تحويل معرّف/اسم إلى الاسم المختصر.
import { useState } from 'react'
import type { Settlement, Traveler } from '../types'
import { cn } from '../utils/cn'
import { haptic } from '../utils/haptics'
import { ArrowRightLeft } from '../icons'
import EmptyState from './EmptyState'
import { SettlementsPanelSkeleton } from './Skeleton'

interface SettlementsPanelProps {
  isInitialLoading: boolean
  settlements: Settlement[]
  travelers: Traveler[]
  /** لا مصاريف بعد = لا معنى لعرض «كل الحسابات مصفّاة» (لا حسابات أصلاً). */
  hasExpenses: boolean
}

export const SettlementsPanel = ({
  isInitialLoading, settlements, travelers, hasExpenses,
}: SettlementsPanelProps) => {
  // 🆕 تتبّع محلي للتسويات التي "تم تحويلها" (لتظليلها بعد إتمام الدفع). هذه حالة
  // واجهة بحتة غير محفوظة في Firestore — تُصفَّر عند إعادة تحميل الصفحة.
  const [paidSettlements, setPaidSettlements] = useState<Set<string>>(new Set())
  const settlementKey = (s: Settlement) => `${s.fromName}→${s.toName}`
  const togglePaid = (key: string) => {
    haptic.light()
    setPaidSettlements(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // المشاركون قد يُخزَّنون كمعرّف رقمي (الصيغة الحالية) أو كاسم مختصر نصي
  // (مصاريف قديمة) — نفس اتحاد الأنواع المستخدم في Expense['participants'].
  const getShortName = (idOrName: number | string) => {
    const traveler = travelers.find(t => t.id === Number(idOrName) || t.name === String(idOrName))
    return traveler ? traveler.shortName : String(idOrName)
  }

  return (
    <section id="settlements-section" className="scroll-mt-24">
      <div className="flex justify-between items-center mb-4 px-1">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-slate-500" /> الأرصدة — من يدفع لمن
          {!isInitialLoading && settlements.length > 0 && (
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full tabular-nums">
              {settlements.length}
            </span>
          )}
        </h2>
      </div>

      {isInitialLoading ? (
        <SettlementsPanelSkeleton />
      ) : !hasExpenses ? (
        <EmptyState
          Icon={ArrowRightLeft}
          title="لا توجد أرصدة بعد"
          description="سجّل أول مصروف للرحلة، وسيحسب التطبيق تلقائياً من يدين لمن وبكم — بأقل عدد ممكن من التحويلات."
        />
      ) : settlements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 py-8 text-center text-slate-400 font-medium text-sm">
          🎉 جميع الحسابات مصفّاة والأرصدة متساوية تماماً!
        </div>
      ) : (
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {settlements.map((s, idx) => {
            const key = settlementKey(s)
            const isPaid = paidSettlements.has(key)
            return (
              <div
                key={idx}
                className={cn(
                  'flex flex-col gap-3 border rounded-2xl p-4 transition-all shadow-xs',
                  isPaid ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* ✅ استخدام s.fromName و s.toName لمطابقة نوع Settlement */}
                    <span className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {getShortName(s.fromName).charAt(0)}
                    </span>
                    <span className="font-bold text-slate-800 text-sm truncate">{getShortName(s.fromName)}</span>
                    <span className="text-slate-300 font-medium px-1 shrink-0">←</span>
                    <span className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {getShortName(s.toName).charAt(0)}
                    </span>
                    <span className="font-bold text-slate-800 text-sm truncate">{getShortName(s.toName)}</span>
                  </div>

                  <span className="font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-xl text-sm tracking-tight tabular-nums border border-rose-100 shrink-0">
                    {s.amount.toFixed(2)} <span className="text-xs font-bold opacity-80">﷼</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => togglePaid(key)}
                  className={cn(
                    'w-full py-2 rounded-xl text-xs font-bold transition-all active:scale-95',
                    isPaid
                      ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                      : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100'
                  )}
                >
                  {isPaid ? 'تم التحويل ✓ (تراجع)' : 'تحديد كمُحوَّل'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
