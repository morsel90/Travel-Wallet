import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'motion/react'
import { useDialogA11y } from '../hooks/useDialogA11y'

interface ModalProps {
  children: ReactNode
  maxWidth?: string
  onClose: () => void
  /** اسم النافذة لقارئ الشاشة. إلزامي كي لا تصل نافذة جديدة بلا اسم. */
  label: string
}

// ─── Modal / Bottom Sheet ───────────────────────────────────────────────────
// Bottom Sheet على الجوال، ونافذة مركزية من sm فأكبر. onClose من الخلفية أو
// السحب لأسفل أو أزرار الإغلاق داخل كل نافذة.
//
// ⚠️ أحِط موضع العرض الشرطي بـ <AnimatePresence> وإلا لا حركة خروج.
// ⚠️ createPortal إلى body: سلف بـ transform (PullToRefresh دائماً) يجعل
// `fixed` نسبياً له لا لإطار العرض — DECISIONS.md.
export const Modal = ({ children, maxWidth = 'max-w-sm', onClose, label }: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogA11y(panelRef, onClose)
  const dragControls = useDragControls()

  return createPortal(
  <motion.div
    className="fixed inset-0 bg-slate-900/60 flex items-end sm:items-center justify-center z-9999"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
  >
    <motion.div
      ref={panelRef}
      // ⚠️ الثلاثة معاً: aria-modal يمنع قارئ الشاشة من التجوّل خلفها، وtabIndex
      // يجعل الحاوية قابلة للتركيز حين لا عنصر تفاعلياً فيها.
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      // ⚠️ dvh لا vh: على iOS تصير اللوحة أطول من غلافها فيخرج رأسها من الشاشة (DECISIONS.md).
      className={`bg-white rounded-t-3xl sm:rounded-2xl p-6 pt-3 sm:pt-6 w-full ${maxWidth} relative max-h-[92dvh] overflow-y-auto outline-hidden`}
      onClick={(e) => e.stopPropagation()}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 600 }}
      dragSnapToOrigin
      onDragEnd={(_e, info) => {
        if (info.offset.y > 120 || info.velocity.y > 500) onClose()
      }}
    >
      {/* ⚠️ السحب-للإغلاق يبدأ من المقبض وحده (dragListener={false}): السحب من
          اللوحة كلها كان يلتهم تمرير المحتوى الطويل (بلاغ مستخدم). */}
      <div
        className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => dragControls.start(e)}
      />
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
      {/* type="button": الافتراضي submit لو عُرضت يوماً داخل <form>. */}
      <button type="button" onClick={onConfirm} className="flex-1 bg-rose-600 text-white py-2 rounded-xl font-bold">{confirmLabel}</button>
      <button type="button" onClick={onCancel}  className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold">إلغاء</button>
    </div>
  </Modal>
)
