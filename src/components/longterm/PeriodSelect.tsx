// 🆕 مُصفّي الدورة — قائمة منسدلة مخصَّصة بدل <select> أصلي.
//
// ⚠️ استُبدل بها <select> الأصلي الذي كان يظهر في ReportsView.tsx وTravelerProfileModal.tsx:
// شريط تيل عريض بامتداد الشاشة بمظهر عنصر نظام التشغيل الافتراضي، لا يشبه بقية
// عناصر التطبيق. هذا المكوّن يطابق نمط AccountMenu.tsx الموجود أصلاً (نفس آلية
// الفتح/الإغلاق بالضغط خارجاً أو Escape، ونفس شكل القائمة البيضاء المنسدلة) —
// لا نمط جديد على مستخدم التطبيق، فقط إعادة استخدام لما هو مألوف له أصلاً.
import { useEffect, useRef, useState } from 'react'
import { CalendarRange, ChevronDown, Check } from '../../icons'
import { formatPeriodLabel } from '../../utils/period'
import type { PeriodKey } from '../../types'

export const ALL_PERIODS = 'all' as const
export type PeriodFilter = PeriodKey | typeof ALL_PERIODS

interface PeriodSelectProps {
  /** الفترات المتاحة — تصاعدياً (الأقدم أولاً)، تُعرض معكوسة (الأحدث أولاً). */
  periods: PeriodKey[]
  value: PeriodFilter
  onChange: (value: PeriodFilter) => void
}

const optionLabel = (opt: PeriodFilter): string => (opt === ALL_PERIODS ? 'جميع الفترات' : `دورة ${formatPeriodLabel(opt)}`)

export function PeriodSelect({ periods, value, onChange }: PeriodSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // نفس آلية AccountMenu.tsx بالحرف — إغلاق عند الضغط خارج القائمة أو Escape.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  if (periods.length === 0) return null

  const options: PeriodFilter[] = [ALL_PERIODS, ...[...periods].reverse()]

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 bg-teal-800/60 hover:bg-teal-800 text-teal-50 text-xs font-bold rounded-xl px-3 py-2 transition-colors"
      >
        <CalendarRange className="w-3.5 h-3.5 shrink-0" />
        {optionLabel(value)}
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="تصفية الدورة"
          className="absolute start-0 top-full mt-2 min-w-[11rem] max-h-64 overflow-y-auto bg-white rounded-2xl shadow-lg border border-slate-200 py-1.5 z-20 text-right"
        >
          {options.map(opt => {
            const isSelected = opt === value
            return (
              <button
                key={opt}
                type="button"
                role="menuitem"
                onClick={() => { setIsOpen(false); onChange(opt) }}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm font-bold transition-colors ${
                  isSelected ? 'text-teal-700 bg-teal-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {optionLabel(opt)}
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
