import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface ModalProps {
  children: ReactNode
  maxWidth?: string
  onClose: () => void
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
export const Modal = ({ children, maxWidth = 'max-w-sm', onClose }: ModalProps) => (
  <motion.div
    className="fixed inset-0 bg-slate-900/60 flex items-end sm:items-center justify-center z-[9999]"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
  >
    <motion.div
      className={`bg-white rounded-t-3xl sm:rounded-2xl p-6 pt-3 sm:pt-6 w-full ${maxWidth} relative max-h-[92vh] overflow-y-auto`}
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
  </motion.div>
)

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
  <Modal onClose={onCancel}>
    <h3 className={`font-bold ${message ? 'mb-2' : 'mb-4'}`}>{title}</h3>
    {message && <p className="text-xs text-slate-500 mb-4">{message}</p>}
    <div className="flex gap-3">
      <button onClick={onConfirm} className="flex-1 bg-rose-600 text-white py-2 rounded-xl font-bold">{confirmLabel}</button>
      <button onClick={onCancel}  className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold">إلغاء</button>
    </div>
  </Modal>
)
