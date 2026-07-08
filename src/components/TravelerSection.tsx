import { memo } from 'react'
import { Pencil, Trash2, Plus, X, History, Loader2 } from '../icons'
import type { TravelerBalance } from '../types'
import { useData } from '../context/DataContext'
import { useUI } from '../context/UIContext'
import { matchesTraveler } from '../utils/participants'

interface TravelerCardProps {
  traveler: TravelerBalance
}

export const TravelerCard = memo(({ traveler }: TravelerCardProps) => {
  const { isAdmin, expenses } = useData()
  const { openDeposit, requestDeleteTraveler, openDepositHistory } = useUI()
  
  // تحديد أنواع البارامترات (e, p) لتجنب أخطاء Implicit Any في TS
  const hasExpenses = expenses.some((e: any) => e.participants.some((p: any) => matchesTraveler(traveler, p)))
  const isNegative = traveler.remaining < 0
  const percentage = Math.min(100, Math.max(0, (traveler.remaining / traveler.deposited) * 100)) || 0

  return (
    <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-slate-100 flex flex-col justify-between gap-2.5 transition-all">
      {/* القسم العلوي: توزيع أفقي مريح للعين على الجوال */}
      <div className="flex justify-between items-center gap-3 min-w-0 w-full">
        
        {/* اليمين: الأفتار الدائري + تفاصيل الاسم والدفع المسبق */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
            {traveler.name[0]}
          </div>
          
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-1.5 min-w-0">
              <span className="truncate min-w-0 text-slate-900 font-bold">{traveler.name}</span>
              {traveler._pending && (
                <span className="flex items-center gap-1 text-[9px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full font-medium shrink-0 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> مزامنة
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums truncate">
              المسبق: <span className="font-semibold text-slate-500">{traveler.deposited.toFixed(2)}</span>
            </p>
          </div>
        </div>

        {/* اليسار: حاوية الرصيد المتبقي بمظهر كبسولة مدمجة وأنيقة */}
        <div className="text-left shrink-0 bg-slate-50/60 px-3 py-1 rounded-lg border border-slate-100 min-w-[80px] sm:min-w-0">
          <p className="text-[10px] sm:text-xs font-medium text-slate-400 mb-0.5 text-center sm:text-left">المتبقي</p>
          <p className={`text-sm sm:text-base font-black tabular-nums text-center sm:text-left ${isNegative ? 'text-rose-600' : 'text-teal-600'}`} dir="ltr">
            {traveler.remaining.toFixed(2)}
          </p>
        </div>

      </div>

      {/* المنتصف: شريط مؤشر النسبة المئوية مرن ومدمج وبدون هدر مساحة */}
      <div className="w-full flex items-center gap-2 mt-0.5" dir="ltr">
        <div className="flex-1 bg-slate-100 rounded-full h-1 sm:h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isNegative ? 'bg-rose-500' : 'bg-teal-500'}`}
            style={{ width: `${isNegative ? 100 : percentage}%` }}
          />
        </div>
        {!isNegative && (
          <span className="text-[9px] text-slate-400 font-mono hidden sm:inline shrink-0">
            {Math.round(percentage)}%
          </span>
        )}
      </div>

      {/* القسم السفلي: أزرار التحكم الخاصة بالمسؤول عند تفعيل وضع المسؤول */}
      {isAdmin && (
        <div className="flex flex-col gap-1.5 pt-2 mt-0.5 border-t border-slate-50 w-full animate-fadeIn">
          <div className="flex gap-1.5 w-full">
            <button
              onClick={() => openDeposit(traveler)}
              className="flex-1 justify-center flex items-center gap-1 text-teal-700 bg-teal-50 hover:bg-teal-100 active:scale-95 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-teal-100"
            >
              <Pencil className="w-3 h-3" /> تعديل الرصيد
            </button>
            <button
              onClick={() => openDepositHistory(traveler)}
              title="سجل تعديلات الرصيد"
              className="flex items-center justify-center text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-95 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="w-full">
            {hasExpenses ? (
              <span className="block text-center text-[10px] text-slate-400 bg-slate-50 py-1.5 rounded-lg border border-slate-100">
                لا يمكن الحذف (مرتبط بمصاريف)
              </span>
            ) : (
              <button
                onClick={() => requestDeleteTraveler(traveler)}
                className="w-full flex items-center justify-center gap-1 text-rose-600 bg-rose-50 hover:bg-rose-100 active:scale-95 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-rose-100"
              >
                <Trash2 className="w-3 h-3" /> حذف المسافر
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

interface AddTravelerFormProps {
  newTravelerName: string
  setNewTravelerName: (v: string) => void
  newTravelerDeposit: string
  setNewTravelerDeposit: (v: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  cancelAddTraveler: () => void
}

export const AddTravelerForm = memo(({
  newTravelerName, setNewTravelerName,
  newTravelerDeposit, setNewTravelerDeposit,
  onSubmit, cancelAddTraveler
}: AddTravelerFormProps) => {
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap items-end gap-3 mt-4 animate-fadeIn">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">اسم المسافر الجديد</label>
        <input
          type="text" required autoFocus value={newTravelerName}
          onChange={(e) => setNewTravelerName(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          placeholder="مثال: سعد الغامدي"
        />
      </div>
      <div className="w-[140px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">الدفع المسبق (اختياري)</label>
        <input
          type="number" min="0" step="0.01" value={newTravelerDeposit}
          onChange={(e) => setNewTravelerDeposit(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          placeholder="0.00"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="flex items-center gap-1.5 bg-teal-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-teal-700 active:scale-95 transition-all text-sm shadow-sm shadow-teal-100">
          <Plus className="w-3.5 h-3.5" /> إضافة
        </button>
        <button type="button" onClick={cancelAddTraveler} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-xl active:scale-95 transition-all text-sm">
          <X className="w-3.5 h-3.5" /> إلغاء
        </button>
      </div>
    </form>
  )
})