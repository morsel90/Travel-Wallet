// 🆕 منطق/عمليات المسافر كاملاً — استُخرج من App.tsx (على غرار useExpenseActions).
// يملك حالة نموذج «إضافة مسافر» + معالجات الإضافة/الحذف/الاستعادة.
import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { travelerDoc, travelerNameDoc } from '../firestore'
import { haptic } from '../utils/haptics'
import { deriveShortName, isValidNameKey, newTravelerId } from '../utils/travelerName'
import type { Traveler, ToastMessage } from '../types'

// 🆕 تفرّد الاسم المختصر مفروض خادميًا عبر مستند حجز معرّفه هو الاسم نفسه
// (travelerNames/{shortName})، وقاعدة `allow update: if false` عليه — انظر
// firestore.rules. الفحص المحلي أدناه يبقى لأنه يعطي رداً فورياً في الحالة
// الشائعة، لكنه لا يرى إضافة جهاز آخر لم تصل بعد؛ الحجز هو الحاجز الفعلي.
//
// كل عملية تلمس المسافر واسمه تمرّ في writeBatch واحدة: إما أن ينجحا معاً أو
// يفشلا معاً، فلا يبقى حجز اسم بلا مسافر ولا مسافر بلا حجز.

// رفض القواعد يصل كخطأ صلاحيات عام. في هذا المسار تحديداً السبب الغالب أن اسماً
// سُجِّل من جهاز آخر قبل لحظات، فنترجمه لرسالة مفهومة بدل «لا تملك الصلاحية».
const nameConflictMessage = (shortName: string) =>
  `الاسم المختصر "${shortName}" أصبح مستخدماً للتو من جهاز آخر — اختر اسماً مختلفاً.`

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
    const traveler = travelers.find(t => t.id === id)
    if (!traveler) return

    showToast({ text: 'تم استعادة المسافر إلى القائمة النشطة', type: 'success' })

    // الاستعادة تُعيد حجز الاسم، وقد تفشل إن أخذه شخص آخر بينما كان المسافر في
    // السلة — وهو أثر مقصود لتحرير الاسم عند الحذف. الرسالة تشرح للمسؤول أن
    // عليه إعادة تسميته بدل أن يرى فشلاً غامضاً.
    const batch = writeBatch(db)
    batch.update(travelerDoc(id), { deletedAt: null })
    batch.set(travelerNameDoc(traveler.shortName), { travelerId: id })
    batch.commit().catch(err =>
      handleFirestoreError(
        err,
        `تعذّرت استعادة المسافر — قد يكون الاسم "${traveler.shortName}" مستخدماً الآن لمسافر آخر.`
      )
    )
  }, [user, travelers, showToast, handleFirestoreError])

  const startAddTraveler = useCallback(() => setIsAddingTraveler(true), [])
  const cancelAddTraveler = useCallback(() => {
    setIsAddingTraveler(false)
    setNewTravelerName('')
    setNewTravelerDeposit('')
  }, [])

  const handleAddTraveler = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newTravelerName.trim()) return
    const shortName = deriveShortName(newTravelerName)

    // الاسم يصبح معرّف مستند الحجز، فما لا يصلح معرّفاً يُرفض هنا برسالة واضحة
    // بدل أن يفشل عند المزامنة أو يُكتب في موضع غير المقصود.
    if (!isValidNameKey(shortName)) {
      haptic.error()
      setSyncError('الاسم غير صالح — تجنّب الشرطة المائلة (/) والأسماء الفارغة.')
      return
    }
    if (activeTravelers.some(t => t.shortName === shortName)) {
      haptic.error()
      setSyncError(`يوجد مسافر بنفس الاسم المختصر "${shortName}"، استخدم اسمًا مختلفًا.`)
      return
    }

    const id = newTravelerId()
    const traveler: Traveler = { id, name: newTravelerName.trim(), shortName, deposited: parseFloat(newTravelerDeposit) || 0, deletedAt: null }

    setNewTravelerName('')
    setNewTravelerDeposit('')
    setIsAddingTraveler(false)
    haptic.success()

    if (!user) {
      setTravelers(prev => [...prev, traveler])
      return
    }

    // المسافر وحجز اسمه معاً: نجاح الحجز هو ما يمنع التكرار، وفشله يمنع إنشاء
    // المسافر أصلاً بدل أن نحصل على اسمين متطابقين.
    const batch = writeBatch(db)
    batch.set(travelerDoc(id), traveler)
    batch.set(travelerNameDoc(shortName), { travelerId: id })
    batch.commit().catch(err => handleFirestoreError(err, nameConflictMessage(shortName)))
  }, [newTravelerName, newTravelerDeposit, activeTravelers, user, setTravelers, handleFirestoreError, setSyncError])

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

    const traveler = travelers.find(t => t.id === id)

    // النقل للسلة يُحرِّر الاسم — يطابق سلوك الفحص الذي يقارن مع النشطين فقط،
    // فلا يبقى اسم شخص محذوف حاجزاً للاسم إلى الأبد.
    const batch = writeBatch(db)
    batch.update(travelerDoc(id), { deletedAt: Date.now() })
    if (traveler) batch.delete(travelerNameDoc(traveler.shortName))
    batch.commit().catch(err => handleFirestoreError(err, 'تعذر حذف المسافر.'))
  }, [user, travelers, setTravelers, handleFirestoreError, showToast, handleRestoreTraveler, closeModal])

  return {
    isAddingTraveler,
    newTravelerName, setNewTravelerName,
    newTravelerDeposit, setNewTravelerDeposit,
    startAddTraveler, cancelAddTraveler,
    handleAddTraveler, handleRestoreTraveler, confirmDeleteTraveler,
  }
}
