import { Loader2 } from '../../icons'

// 🆕 نفس شكل غلاف Modal (Bottom Sheet على الجوال / نافذة مركزية من sm فأكبر)
// دون أي حركة (framer-motion) — لأنها ظهور عابر جداً ريثما يُحمَّل جزء الكود
// الكسول (lazy chunk) فعلياً، فلا داعٍ لتعقيد Suspense بحركات دخول/خروج. الشكل
// المطابق يمنع أي "قفزة" بصرية عند استبدال هذا الغلاف بالنافذة الحقيقية.
const ModalFallback = () => (
  <div className="fixed inset-0 bg-slate-900/60 flex items-end sm:items-center justify-center z-[9999]">
    <div className="bg-white rounded-t-3xl sm:rounded-2xl p-8 w-full max-w-sm flex items-center justify-center gap-3 shadow-xl">
      <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
      <span className="text-sm text-slate-500 font-medium">جارٍ التحميل...</span>
    </div>
  </div>
)

export default ModalFallback
