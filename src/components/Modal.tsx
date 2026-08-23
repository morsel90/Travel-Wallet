import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useDialogA11y } from '../hooks/useDialogA11y'

interface ModalProps {
  children: ReactNode
  maxWidth?: string
  onClose: () => void
  /**
   * 🆕 اسم النافذة لقارئ الشاشة — **مطلوب**.
   *
   * ⚠️ لا يُشتقّ من العنوان الظاهر تلقائياً: كل نافذة ترسم عنوانها داخل
   * `children` بشكل مختلف، فربطه بـ aria-labelledby يفرض على كل نافذة أن تعرف
   * معرّفاً تولّده هذه. جعله خاصية صريحة أوضح وأقلّ هشاشة — وكونه إلزامياً
   * يمنع نافذة جديدة من الوصول بلا اسم، وهي الحالة التي يسمعها المستخدم
   * «مربع حوار» بلا أي سياق.
   */
  label: string
}

// ─── Modal / Bottom Sheet ───────────────────────────────────────────────────
// 🆕 Bottom Sheet: تنبثق كل النوافذ من الأسفل على الجوال (نمط تطبيقات الجوال
// الأصلية) بدل نافذة مركزية تقليدية — من عرض sm فأكبر (شاشات أوسع) تبقى
// نافذة مركزية عادية بزوايا كاملة الاستدارة (لا فائدة من Bottom Sheet على
// شاشة عريضة). framer-motion (motion.div + drag="y") يوفّر حركة دخول/خروج
// طبيعية بفيزياء حركة حقيقية (spring)، وسحب لأسفل بما يكفي (أو بسرعة كافية)
// يُغلق النافذة كما في تطبيقات الجوال المعتادة.
//
// onClose يُستدعى من ثلاث طرق: الضغط خلف النافذة (الخلفية الداكنة)، السحب
// لأسفل بما يكفي (offset.y > 120px أو سرعة > 500px/ث)، أو أي زر إغلاق صريح
// (X/إلغاء) داخل كل نافذة على حدة كما كان سابقاً — كلها تستدعي نفس onClose.
//
// ⚠️ يجب إحاطة أي استخدام لهذا المكوّن (أو النوافذ التي تبنى عليه) بـ
// <AnimatePresence> في نقطة العرض الشرطي في App.tsx (مثال:
// <AnimatePresence>{condition && <DepositModal .../>}</AnimatePresence>)
// حتى تُشغَّل حركة الخروج (exit) قبل إزالة العنصر من الشجرة فعلياً — بدونها
// يختفي بلا أي حركة إغلاق (نفس مبدأ AnimatePresence في أي React app).
//
// 🆕 createPortal إلى document.body — لا رسم في مكانه الطبيعي داخل شجرة
// المكوّنات. رغم fixed inset-0، أي سلف (ancestor) بقيمة transform/translate/
// rotate/scale ليست none (حتى لو بلا أثر بصري كـ translateY(0px)) يُنشئ
// containing block جديداً حسب مواصفة CSS، فيُحسَب موضع fixed نسبةً لصندوق ذلك
// السلف لا نسبةً لإطار العرض الفعلي — هذا بالضبط ما كان يُخفي ExpenseForm خارج
// نطاق الرؤية على الجوال حين أصبح Modal-based، لأن PullToRefresh.tsx يُغلِّف
// <main> بأكمله بـ transform دائم (لازم لتأثير السحب المطاطي). portal إلى
// document.body يحلّ التعارض جذرياً: Modal لم يعد سليلاً لأي عنصر متحوّل
// إطلاقاً، بصرف النظر عمّا يتغيّر مستقبلاً في أسلافه — لا حاجة لتتبّع كل سلف
// محتمل بحثاً عن transform. z-[9999] يبقى كافياً للطبقة العليا فوق أي محتوى.
// (انظر أيضاً ExpensesPanel.tsx: نداء scrollTo لقائمة react-virtuoso، مطلوب
// بصرف النظر عن هذا التغيير — انظر docs/DECISIONS.md للتفاصيل الكاملة.)
export const Modal = ({ children, maxWidth = 'max-w-sm', onClose, label }: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  // Escape، وحصر التركيز، ودخوله وعودته — انظر hooks/useDialogA11y.ts
  useDialogA11y(panelRef, onClose)

  return createPortal(
  <motion.div
    className="fixed inset-0 bg-slate-900/60 flex items-end sm:items-center justify-center z-[9999]"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
  >
    <motion.div
      ref={panelRef}
      // ⚠️ الثلاثة معاً لا واحد منها: role يقول إنه حوار، وaria-modal يخبر قارئ
      // الشاشة أن ما خلفه غير متاح (وإلا تجوّل فيه رغم حصر التركيز البصري)،
      // وtabIndex={-1} يجعل الحاوية نفسها قابلة للتركيز البرمجي حين لا يوجد
      // داخلها أي عنصر تفاعلي.
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`bg-white rounded-t-3xl sm:rounded-2xl p-6 pt-3 sm:pt-6 w-full ${maxWidth} relative max-h-[92vh] overflow-y-auto outline-none`}
      onClick={(e) => e.stopPropagation()}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 600 }}
      dragSnapToOrigin
      onDragEnd={(_e, info) => {
        if (info.offset.y > 120 || info.velocity.y > 500) onClose()
      }}
    >
      {/* 🆕 مقبض السحب المرئي — إشارة بصرية أن النافذة قابلة للسحب لأسفل
          لإغلاقها؛ يظهر فقط على الجوال (sm:hidden) حيث لا معنى له في نافذة مركزية */}
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
      {children}
    </motion.div>
  </motion.div>,
  document.body
  )
}

interface ConfirmModalProps {
  title: string
  message?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'نعم، احذف',
  onConfirm,
  onCancel,
}: ConfirmModalProps) => (
  // العنوان هو اسم النافذة نفسه هنا — نافذة التأكيد لا تحمل غيره.
  <Modal onClose={onCancel} label={title}>
    <h3 className={`font-bold ${message ? 'mb-2' : 'mb-4'}`}>{title}</h3>
    {message && <p className="text-xs text-slate-500 mb-4">{message}</p>}
    <div className="flex gap-3">
      {/* ⚠️ type="button" صراحةً: الافتراضي في HTML هو submit، وهذه النافذة قد
          تُعرض يوماً داخل <form> فيصير «إلغاء» إرسالاً صامتاً للنموذج. */}
      <button type="button" onClick={onConfirm} className="flex-1 bg-rose-600 text-white py-2 rounded-xl font-bold">{confirmLabel}</button>
      <button type="button" onClick={onCancel}  className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold">إلغاء</button>
    </div>
  </Modal>
)
