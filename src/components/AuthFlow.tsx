// 🆕 غلاف عرض تدفّق مصادقة المسؤول — استُخرج من App.tsx.
// يتكفّل بالتحميل الكسول (lazy) لنافذة الدخول وتغليفها بـ AnimatePresence + Suspense.
// المنطق والحالة يعيشان في hook useAdminAuth؛ هذا المكوّن عرضي بحت.
import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import ModalFallback from './modals/ModalFallback'
import type { AdminSignInModalProps } from './modals/AdminSignInModal'

const importAdminSignInModal = () => import('./modals/AdminSignInModal')

const AdminSignInModal = lazy(importAdminSignInModal)

/** 🆕 جزء نافذة دخول المسؤول للتحميل المسبق الهادئ — انظر modalImporters في ModalManager. */
// eslint-disable-next-line react-refresh/only-export-components -- نفس المقايضة الموثّقة في ModalManager.tsx
export const authImporters = [importAdminSignInModal]

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
