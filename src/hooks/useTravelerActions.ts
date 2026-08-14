// 🆕 منطق/عمليات المسافر كاملاً — استُخرج من App.tsx (على غرار useExpenseActions).
// يملك حالة نموذج «إضافة مسافر» + معالجات الإضافة/الحذف/الاستعادة.
import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { travelerDoc, travelerNameDoc, depositLogsCol } from '../firestore'
import { haptic } from '../utils/haptics'
import { INITIAL_DEPOSIT_REASON } from '../utils/deposits'
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

    // 🆕 الرصيد الابتدائي مبلغ مالي، فيخضع للقاعدة ١٩ كغيره.
    //
    // ⚠️ كان `parseFloat(newTravelerDeposit) || 0`، وهو حارس يبدو كافياً وليس
    // كذلك: `||` يلتقط NaN و0 و'' — لكنه **يمرّر Infinity** لأنها قيمة صادقة
    // (truthy). فكتابة "Infinity" في الحقل تُنشئ مسافراً بـ deposited غير
    // منتهٍ، وقواعد Firestore تقبله (`Infinity >= 0` صحيح)، فيصير رصيده و
    // remaining و«إجمالي المودَع» في كل تقرير غير منتهٍ.
    //
    // وهذا هو بعينه العطل الذي أُصلح في handleAddExpense في 2026-08-11؛ مسار
    // المسافر لم يُشمل حينها. نفس الدرس المكتوب هناك: حين يعتمد مساران على نفس
    // الحقيقة، افحص الثاني.
    //
    // الحقل اختياري — الفارغ يعني صفراً — لذا نتحقق فقط إن كُتب فيه شيء.
    const depositRaw = newTravelerDeposit.trim()
    const deposited = depositRaw === '' ? 0 : parseFloat(depositRaw)
    if (!Number.isFinite(deposited) || deposited < 0) {
      haptic.error()
      setSyncError('الرصيد الابتدائي غير صالح — أدخل رقماً موجباً أو اترك الحقل فارغاً.')
      return
    }

    const id = newTravelerId()
    const traveler: Traveler = { id, name: newTravelerName.trim(), shortName, deposited, deletedAt: null }

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
    //
    // 🆕 والرصيد الابتدائي يمرّ من المسار الموثَّق لا من حقل الإنشاء:
    //
    // المستند يُنشأ بصفر (تفرضه firestore.rules)، ثم تُكتب حركة إيداع في
    // depositLogs ويُحدَّث الرصيد — **في نفس الدفعة الذرّية**. فإما أن يوجد
    // المسافر برصيده وسطرِه معاً، أو لا يوجد شيء. مسافرٌ برصيد بلا سطر تدقيق هو
    // بالضبط الحالة التي وُجد هذا التغيير لإغلاقها، ونفس مبدأ القاعدة ٦ مع
    // حجز الاسم.
    //
    // ⚠️ التجربة لا تتغيّر بحرف: نفس النموذج ونفس الحقل ونفس النتيجة. ما يُضاف
    // هو أن «٣٠٠٠ ريال ظهرت» صار لها جواب: من، ومتى، وبأي سبب.
    const batch = writeBatch(db)
    batch.set(travelerDoc(id), { ...traveler, deposited: 0 })
    batch.set(travelerNameDoc(shortName), { travelerId: id })

    if (deposited > 0) {
      // ⚠️ `changedByUid` يجب أن يطابق المنفِّذ فعلاً — القاعدة تفرضه، وهو ما
      // يمنع نسبة الحركة لغير صاحبها (نفس مبدأ createdByUid على المصاريف).
      batch.set(doc(depositLogsCol(id)), {
        travelerId:        id,
        previousDeposited: 0,
        newDeposited:      deposited,
        delta:             deposited,
        mode:              'set' as const,
        reason:            INITIAL_DEPOSIT_REASON,
        changedByEmail:    user.email ?? '',
        changedByUid:      user.uid,
        createdAt:         Date.now(),
      })
      batch.update(travelerDoc(id), { deposited })
    }

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
