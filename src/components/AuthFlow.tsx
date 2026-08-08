// 🆕 غلاف عرض تدفّق مصادقة المسؤول — استُخرج من App.tsx.
// يتكفّل بالتحميل الكسول (lazy) لنافذة الدخول وتغليفها بـ AnimatePresence + Suspense.
// المنطق والحالة يعيشان في hook useAdminAuth؛ هذا المكوّن عرضي بحت.
import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import ModalFallback from './modals/ModalFallback'
import type { AdminSignInModalProps } from './modals/AdminSignInModal'

const AdminSignInModal = lazy(() => import('./modals/AdminSignInModal'))

interface AuthFlowProps {
  open: boolean
  modalProps: AdminSignInModalProps
}

export default function AuthFlow({ open, modalProps }: AuthFlowProps) {
  return (
    <AnimatePresence>
      {open && (
        <Suspense key="admin-sign-in" fallback={<ModalFallback />}>
          <AdminSignInModal {...modalProps} />
        </Suspense>
      )}
    </AnimatePresence>
  )
}
