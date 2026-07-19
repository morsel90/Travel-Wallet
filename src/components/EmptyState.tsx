import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { haptic } from '../utils/haptics'

// 🆕 حالة فارغة عامة (Empty State) قابلة لإعادة الاستخدام — تُعرض بدلاً من الشاشات
// البيضاء المربكة عندما لا توجد بيانات بعد (رحلة جديدة بلا مسافرين/مصاريف).
// تتضمّن أيقونة ودّية + عنوان ووصف بالعربية + زر إجراء أساسي اختياري.
// الأيقونات تُمرَّر من الأعلى (المستوردة من src/icons.ts) التزاماً بقاعدة المشروع
// بعدم استيراد أيقونات lucide-react مباشرةً داخل المكوّنات — هنا نستورد النوع فقط.

interface EmptyStateProps {
  Icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  ActionIcon?: LucideIcon
}

export const EmptyState = memo(({ Icon, title, description, actionLabel, onAction, ActionIcon }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-12 sm:py-16 animate-fadeIn">
    <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-500 flex items-center justify-center mb-4 shadow-sm ring-1 ring-teal-100">
      <Icon className="w-8 h-8" />
    </div>

    <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1.5">{title}</h3>
    <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-5">{description}</p>

    {actionLabel && onAction && (
      <button
        type="button"
        onClick={() => { haptic.light(); onAction() }}
        className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm"
      >
        {ActionIcon && <ActionIcon className="w-4 h-4" />}
        {actionLabel}
      </button>
    )}
  </div>
))

export default EmptyState
