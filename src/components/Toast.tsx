import { CheckCircle2, Sparkles, Pencil } from '../icons'
import type { LucideIcon } from 'lucide-react'
import type { ToastMessage, ToastType } from '../types'

const ICONS: Record<ToastType, LucideIcon> = {
  new:     Sparkles,
  edit:    Pencil,
  success: CheckCircle2,
}

interface ToastProps {
  message: ToastMessage
}

const Toast = ({ message }: ToastProps) => {
  const Icon = ICONS[message.type]
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-teal-600 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
      <Icon className="w-4 h-4 shrink-0" />
      <span>{message.text}</span>
      {/* 🆕 زر تراجع — لتوستات الحذف الليّن القابلة للتراجع فقط (انظر onUndo في types.ts) */}
      {message.onUndo && (
        <button
          type="button"
          onClick={message.onUndo}
          className="underline underline-offset-2 decoration-teal-200 hover:decoration-white transition-colors shrink-0"
        >
          تراجع
        </button>
      )}
    </div>
  )
}

export default Toast
