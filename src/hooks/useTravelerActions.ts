// 🆕 منطق/عمليات المسافر كاملاً — استُخرج من App.tsx (على غرار useExpenseActions).
// يملك حالة نموذج «إضافة مسافر» + معالجات الإضافة/الحذف/الاستعادة.
import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { setDoc, updateDoc } from 'firebase/firestore'
import { travelerDoc } from '../firestore'
import { haptic } from '../utils/haptics'
import type { Traveler, ToastMessage } from '../types'

interface UseTravelerActionsParams {
  travelers: Traveler[]
  activeTravelers: Traveler[]
  user: User | null
  setTravelers: Dispatch<SetStateAction<Traveler[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
  setSyncError: Dispatch<SetStateAction<string | null>>
  // لإغلاق مودال تأكيد الحذف (من useModals) بعد تأكيد نقل المسافر للمهملات
  closeModal: () => void
}

export interface UseTravelerActionsResult {
  isAddingTraveler: boolean
  newTravelerName: string
  setNewTravelerName: Dispatch<SetStateAction<string>>
  newTravelerDeposit: string
  setNewTravelerDeposit: Dispatch<SetStateAction<string>>
  startAddTraveler: () => void
  cancelAddTraveler: () => void
  handleAddTraveler: (e: FormEvent<HTMLFormElement>) => void
  handleRestoreTraveler: (id: number) => void
  confirmDeleteTraveler: (id: number) => void
}

export function useTravelerActions({
  travelers, activeTravelers, user, setTravelers, showToast, handleFirestoreError, setSyncError, closeModal,
}: UseTravelerActionsParams): UseTravelerActionsResult {
  const [isAddingTraveler,   setIsAddingTraveler]   = useState(false)
  const [newTravelerName,    setNewTravelerName]    = useState('')
  const [newTravelerDeposit, setNewTravelerDeposit] = useState('')

  const handleRestoreTraveler = useCallback((id: number) => {
    if (!user) return
    showToast({ text: 'تم استعادة المسافر إلى القائمة النشطة', type: 'success' })
    updateDoc(travelerDoc(id), { deletedAt: null })
      .catch(err => handleFirestoreError(err, 'تعذر استعادة المسافر.'))
  }, [user, showToast, handleFirestoreError])

  const startAddTraveler = useCallback(() => setIsAddingTraveler(true), [])
  const cancelAddTraveler = useCallback(() => {
    setIsAddingTraveler(false)
    setNewTravelerName('')
    setNewTravelerDeposit('')
  }, [])

  const handleAddTraveler = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newTravelerName.trim()) return
    const shortName = newTravelerName.trim().split(' ')[0]
    if (activeTravelers.some(t => t.shortName === shortName)) {
      haptic.error()
      setSyncError(`يوجد مسافر بنفس الاسم المختصر "${shortName}"، استخدم اسمًا مختلفًا.`)
      return
    }
    const id = travelers.length ? Math.max(...travelers.map(t => t.id)) + 1 : 1
    const traveler: Traveler = { id, name: newTravelerName.trim(), shortName, deposited: parseFloat(newTravelerDeposit) || 0, deletedAt: null }

    setNewTravelerName('')
    setNewTravelerDeposit('')
    setIsAddingTraveler(false)
    haptic.success()

    if (!user) {
      setTravelers(prev => [...prev, traveler])
      return
    }
    setDoc(travelerDoc(id), traveler)
      .catch(err => handleFirestoreError(err, 'تعذر إضافة المسافر.'))
  }, [newTravelerName, newTravelerDeposit, travelers, activeTravelers, user, setTravelers, handleFirestoreError, setSyncError])

  const confirmDeleteTraveler = useCallback((id: number) => {
    closeModal()
    haptic.medium()
    showToast(
      { text: 'تم نقل المسافر إلى سلة المهملات', type: 'success', onUndo: () => handleRestoreTraveler(id) },
      5000
    )
    if (!user) {
      setTravelers(prev => prev.filter(t => t.id !== id))
      return
    }
    updateDoc(travelerDoc(id), { deletedAt: Date.now() })
      .catch(err => handleFirestoreError(err, 'تعذر حذف المسافر.'))
  }, [user, setTravelers, handleFirestoreError, showToast, handleRestoreTraveler, closeModal])

  return {
    isAddingTraveler,
    newTravelerName, setNewTravelerName,
    newTravelerDeposit, setNewTravelerDeposit,
    startAddTraveler, cancelAddTraveler,
    handleAddTraveler, handleRestoreTraveler, confirmDeleteTraveler,
  }
}
