import { CheckCircle2, Sparkles, Pencil, AlertTriangle, RefreshCw } from '../icons'
import type { LucideIcon } from 'lucide-react'
import type { ToastMessage } from '../types'

// تم توسيع السجل ليشمل أيقونة حالة الخطأ
const ICONS: Record<string, LucideIcon> = {
  new:     Sparkles,
  edit:    Pencil,
  success: CheckCircle2,
  error:   AlertTriangle, 
}

interface ToastProps {
  message: ToastMessage
}

const Toast = ({ message }: ToastProps) => {
  const Icon = ICONS[message.type] || Sparkles
  const isError = message.type === 'error'

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 ${
      // إيقاف حركة الارتداد (bounce) وتغيير اللون للوردي الغامق في حالة الخطأ ليكون واضحاً وجاداً
      isError ? 'bg-rose-600 animate-none' : 'bg-teal-600 animate-bounce'
    }`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{message.text}</span>
      
      {/* زر التراجع الحالي */}
      {message.onUndo && (
        <button
          type="button"
          onClick={message.onUndo}
          className="underline underline-offset-2 decoration-teal-200 hover:decoration-white transition-colors shrink-0"
        >
          تراجع
        </button>
      )}

      {/* 🆕 زر إعادة المحاولة — مخصص لحالات فشل الاتصال بالإنترنت */}
      {message.onRetry && (
        <button
          type="button"
          onClick={message.onRetry}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          إعادة المحاولة
        </button>
      )}
    </div>
  )
}

export default Toast