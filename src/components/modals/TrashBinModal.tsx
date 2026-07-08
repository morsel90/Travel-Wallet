import { useState } from 'react'
import { X } from '../../icons'
import { Modal } from '../Modal'
import type { Expense, Traveler } from '../../types'

interface TrashBinModalProps {
  deletedExpenses: Expense[]
  deletedTravelers: Traveler[]
  onRestoreExpense: (id: string) => void
  onRestoreTraveler: (id: number) => void
  onClose: () => void
}

export default function TrashBinModal({
  deletedExpenses,
  deletedTravelers,
  onRestoreExpense,
  onRestoreTraveler,
  onClose
}: TrashBinModalProps) {
  const [activeTab, setActiveTab] = useState<'expenses' | 'travelers'>('expenses')

  return (
    <Modal maxWidth="max-w-2xl" onClose={onClose}>
      {/* زر الإغلاق الموحد باستخدام أيقونة النظام */}
      <button 
        type="button" 
        onClick={onClose} 
        className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* عنوان النافذة */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🗑️</span>
        <h3 className="font-bold text-slate-800">سلة المهملات (صلاحية المسؤول)</h3>
      </div>

      {/* أزرار التبويب (Tabs) للتبديل */}
      <div className="flex border-b border-slate-100 bg-slate-50 p-1.5 gap-2 rounded-xl mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'expenses' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          المصاريف المحذوفة ({deletedExpenses.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('travelers')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'travelers' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          المسافرون المحذوفون ({deletedTravelers.length})
        </button>
      </div>

      {/* قائمة العناصر القابلة للتمرير الداخلي المحمي */}
      <div className="overflow-y-auto max-h-[50vh] space-y-2.5 pl-1" dir="rtl">
        {activeTab === 'expenses' ? (
          deletedExpenses.length === 0 ? (
            <div className="text-center text-slate-400 py-12 text-sm font-medium">لا توجد مصاريف محذوفة حالياً.</div>
          ) : (
            deletedExpenses.map(exp => (
              <div key={exp.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">{exp.description}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{exp.date}</span>
                    <span>•</span>
                    <span className="text-rose-600 font-bold">{exp.amount.toFixed(2)} ريال</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRestoreExpense(exp.id)}
                  className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 9H18" />
                  </svg>
                  استعادة
                </button>
              </div>
            ))
          )
        ) : (
          deletedTravelers.length === 0 ? (
            <div className="text-center text-slate-400 py-12 text-sm font-medium">لا يوجد مسافرون محذوفون حالياً.</div>
          ) : (
            deletedTravelers.map(t => (
              <div key={t.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-400">الاسم المختصر: {t.shortName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRestoreTraveler(t.id)}
                  className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 9H18" />
                  </svg>
                  استعادة
                </button>
              </div>
            ))
          )
        )}
      </div>
    </Modal>
  )
}