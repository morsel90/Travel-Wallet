// 🆕 منطق/عمليات الإيداع كاملاً — استُخرج من App.tsx (على غرار useExpenseActions).
// يملك حقول نموذج الإيداع + الإرسال (تحديث الرصيد وتسجيل السجل) + إغلاق المودال مع تصفير النموذج.
// المسافر المستهدَف (depositTraveler) يُمرَّر من App مشتقّاً من حالة المودال (useModals).
import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { travelerDoc, depositLogsCol } from '../firestore'
import { haptic } from '../utils/haptics'
import { applyDepositMode } from '../utils/deposits'
import type { Traveler, DepositMode, ToastMessage } from '../types'

interface UseDepositActionsParams {
  depositTraveler: Traveler | null
  user: User | null
  setTravelers: Dispatch<SetStateAction<Traveler[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
  closeModal: () => void
}

export interface UseDepositActionsResult {
  depositAmount: string
  setDepositAmount: Dispatch<SetStateAction<string>>
  depositMode: DepositMode
  setDepositMode: Dispatch<SetStateAction<DepositMode>>
  depositReason: string
  setDepositReason: Dispatch<SetStateAction<string>>
  handleAddDeposit: (e: FormEvent<HTMLFormElement>) => void
  closeDeposit: () => void
}

export function useDepositActions({
  depositTraveler, user, setTravelers, showToast, handleFirestoreError, closeModal,
}: UseDepositActionsParams): UseDepositActionsResult {
  const [depositAmount, setDepositAmount] = useState('')
  const [depositMode,   setDepositMode]   = useState<DepositMode>('add')
  const [depositReason, setDepositReason] = useState('')

  // إغلاق مودال الإيداع مع تصفير حقول نموذجه
  const closeDeposit = useCallback(() => {
    closeModal()
    setDepositAmount(''); setDepositMode('add'); setDepositReason('')
  }, [closeModal])

  const handleAddDeposit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!depositTraveler) return
    const amt = parseFloat(depositAmount)
    if (isNaN(amt) || (depositMode !== 'set' && amt <= 0) || (depositMode === 'set' && amt < 0)) return

    const previousDeposited = depositTraveler.deposited
    const travelerId = depositTraveler.id
    // 🆕 المنطق نفسه، مستخرَجاً إلى دالة نقية يشاركها مسار الرصيد الابتدائي —
    // وهو ما يجعل «الرصيد = مجموع الحركات الموثّقة» قابلاً للاختبار أصلاً.
    const newAmount = applyDepositMode(previousDeposited, depositMode, amt)

    closeDeposit()
    showToast({ text: 'تم تحديث الرصيد', type: 'success' })
    haptic.success()

    if (!user) {
      setTravelers(prev => prev.map(t => t.id === travelerId ? { ...t, deposited: newAmount } : t))
      return
    }

    const batch = writeBatch(db)
    batch.update(travelerDoc(travelerId), { deposited: newAmount })
    batch.set(doc(depositLogsCol(travelerId)), {
      travelerId,
      previousDeposited,
      newDeposited:   newAmount,
      delta:          newAmount - previousDeposited,
      mode:           depositMode,
      reason:         depositReason.trim() || null,
      changedByEmail: user.email ?? '',
      changedByUid:   user.uid,
      createdAt:      Date.now(),
    })
    batch.commit().catch(err => handleFirestoreError(err, 'تعذر تحديث الرصيد.'))
  }, [depositAmount, depositMode, depositTraveler, depositReason, user, setTravelers, showToast, handleFirestoreError, closeDeposit])

  return {
    depositAmount, setDepositAmount,
    depositMode, setDepositMode,
    depositReason, setDepositReason,
    handleAddDeposit, closeDeposit,
  }
}
