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
    // ⚠️ التمركز الأفقي (left-1/2 + -translate-x-1/2) لا يجوز أن يعيش على نفس
    // العنصر الذي يحمل animate-bounce: كلاهما يكتب خاصية transform نفسها،
    // وإطارات الحركة (keyframes) تستبدل قيمة transform كاملة — لا تُضاف إليها.
    // فتُلغى الترجمة الأفقية عملياً (تبقى فقط حركة Y من الارتداد)، ويُثبَّت
    // الصندوق بحافته اليسرى عند نقطة المنتصف بدل أن يتمركز حولها. غير ملحوظ
    // مع رسالة قصيرة، لكنه يصبح صندوقاً ملاصقاً لحافة الشاشة مع رسالة طويلة —
    // بالضبط ما كشفه توست تحذير دمج الحساب الجديد (utils/mergeNotice.ts).
    // الحل: التمركز على غلاف كامل العرض بلا transform، والحركة/اللون على
    // العنصر الداخلي وحده.
    // ⚠️ z-[10000] لا z-[9999] — أعلى صراحةً من خلفية Modal (z-[9999]). منذ أن
    // صار Modal يُنقَل عبر createPortal إلى نهاية document.body، صار ترتيبه في
    // DOM لاحقاً لعنصر Toast (الذي يبقى في مكانه الطبيعي داخل الشجرة)، فتساوي
    // z-index بينهما يُحسَم لصالح Modal (الأحدث في ترتيب DOM) أثناء نافذة
    // حركة خروجه القصيرة — فيغطّي طبقة Toast بخلفيته `fixed inset-0`، ويلتقط
    // أي نقرة (ولو بـ force:true في الاختبارات) بدل الوصول لأزرار Toast تحته،
    // مثل "تراجع". هذا بالضبط ما كان يمنع استعادة مصروف محذوف حديثاً عبر
    // "تراجع" الفوري إن سبقه إغلاق نافذة تأكيد — انظر docs/DECISIONS.md.
    <div className="fixed bottom-6 inset-x-0 z-[10000] flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto max-w-full text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 ${
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
    </div>
  )
}

export default Toast