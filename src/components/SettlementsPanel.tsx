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
  /**
   * 🆕 منظّم الرحلة أو المسؤول وحدهما — نفس حدّ `callerManagesTrip` خادمياً.
   * غيابه يُخفي الزرّ: بقية المسافرين يقرأون «من يدفع لمن» ولا يسجّلون.
   */
  onRecordTransfer?: (settlement: Settlement) => void
  /** مفتاح التسوية الجاري تسجيلها (`fromId→toId`) — يعطّل زرّها وحده. */
  recordingKey?: string | null
}

export const SettlementsPanel = ({
  isInitialLoading, settlements, travelers, hasExpenses, onRecordTransfer, recordingKey,
}: SettlementsPanelProps) => {
  // 🆕 خطوة التأكيد وحدها هي ما يعيش محلياً هنا — التحويل نفسه يُسجَّل في الدفتر.
  //
  // ⚠️ كان هذا `paidSettlements: Set<string>` يُظلِّل السطر ولا شيء غير ذلك:
  // «تم التحويل ✓» تُقرأ كأن الحركة سُجّلت، والدفتر لا يعرف عنها شيئاً، والتأشير
  // يزول بإعادة التحميل ولا يراه جهاز آخر. الآن يكتب الخادم حركة موثّقة
  // (recordSettlement) فتختفي التسوية من القائمة لأن الرصيدَين صارا صحيحَين.
  //
  // والتأكيد خطوة لأن الحركة مالية غير قابلة للتراجع بضغطة: نقرة واحدة تكشف
  // «تأكيد» في السطر نفسه بلا نافذة — لا حقل ولا سؤال إضافي (القاعدة ٢٥).
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const settlementKey = (s: Settlement) => `${s.fromId}→${s.toId}`

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
          description="تظهر بعد أول مصروف."
        />
      ) : settlements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 py-8 text-center text-slate-400 font-medium text-sm">
          🎉 الحسابات مصفّاة
        </div>
      ) : (
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {settlements.map((s, idx) => {
            const key = settlementKey(s)
            const isPending = pendingKey === key
            const isRecording = recordingKey === key
            return (
              <div
                key={idx}
                className={cn(
                  'flex flex-col gap-3 border rounded-2xl p-4 transition-all shadow-xs',
                  isRecording ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300'
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

                {onRecordTransfer && (
                  isPending ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isRecording}
                        onClick={() => { haptic.light(); setPendingKey(null); onRecordTransfer(s) }}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-60"
                      >
                        {isRecording ? 'جارٍ التسجيل…' : `تأكيد تسجيل ${s.amount.toFixed(2)} ﷼`}
                      </button>
                      <button
                        type="button"
                        onClick={() => { haptic.light(); setPendingKey(null) }}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all active:scale-95"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => { haptic.light(); setPendingKey(key) }}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100 transition-all active:scale-95 disabled:opacity-60"
                    >
                      {isRecording ? 'جارٍ التسجيل…' : 'تسجيل التحويل'}
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
