// 🆕 عملية تعديل رصيد مسافر — **فعلٌ واحد بلا أي حالة نموذج**.
//
// ⚠️ كان هذا الـ hook يملك حقول النموذج نفسها (`depositAmount`/`depositMode`/
// `depositReason`) ويمرّرها عبر سلسلة كاملة: useAppCoordinator → App.tsx →
// ModalManager → DepositModal. صارت الحقول تعيش في `DepositEditor` داخل
// TravelerProfileModal مباشرةً — حيث تُكتب وتُقرأ ولا مكان غيره — فسقطت
// السلسلة كلها، وسقط معها مودال `DepositModal` وحالته في `useModals`.
//
// وهذا هو تطبيق القاعدة ١٦ حرفياً (الحقل يعيش حيث تقول تقلّبيته لا حيث يقول
// موضوعه): قيمة تتغيّر مع كل ضغطة مفتاح كانت تعيش في منسّق التطبيق، وكل تغيّر
// فيها يمرّ بـApp.tsx. الآن لا يعرف عنها أحد خارج الحقل الذي يكتبها.
//
// ما بقي هنا هو ما يلمس Firestore وحده: الدفعة الذرّية التي تُحدّث الرصيد
// وتكتب سجلّ التدقيق معاً. مرجعها ثابت (useCallback بلا اعتماد متقلّب)، فمكانها
// شريحة `actions` في المتجر لا `data` — انظر store/tripStore.ts.
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { User } from 'firebase/auth'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { travelerDoc, depositLogsCol } from '../firestore'
import { haptic } from '../utils/haptics'
import { applyDepositMode } from '../utils/deposits'
import type { Traveler, DepositMode, ToastMessage } from '../types'

interface UseDepositActionsParams {
  user: User | null
  setTravelers: Dispatch<SetStateAction<Traveler[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

/** ما يُدخله المستخدم في `DepositEditor` — لا أكثر. */
export interface DepositSubmission {
  mode: DepositMode
  /** المبلغ **مُحوَّلاً ومُتحقَّقاً منه في الحقل نفسه**؛ هنا يُرفض غير المنتهي فقط (القاعدة ١٩). */
  amount: number
  reason: string
}

export interface UseDepositActionsResult {
  /** يعيد true حين قُبل الإدخال وأُرسل — false حين رُفض المبلغ، فيبقى الحقل مفتوحاً. */
  submitDeposit: (traveler: Traveler, submission: DepositSubmission) => boolean
}

export function useDepositActions({
  user, setTravelers, showToast, handleFirestoreError,
}: UseDepositActionsParams): UseDepositActionsResult {
  const submitDeposit = useCallback((traveler: Traveler, { mode, amount, reason }: DepositSubmission) => {
    // القاعدة ١٩: لا مال يدخل التطبيق بلا تحقّق. نفس الشروط السابقة حرفياً —
    // «تحديد القيمة» يقبل الصفر (تصفير رصيد)، و«إضافة»/«خصم» لا تقبلان صفراً.
    if (!Number.isFinite(amount)) return false
    if (mode !== 'set' && amount <= 0) return false
    if (mode === 'set' && amount < 0) return false

    const previousDeposited = traveler.deposited
    const travelerId = traveler.id
    // 🆕 المنطق نفسه، مستخرَجاً إلى دالة نقية يشاركها مسار الرصيد الابتدائي —
    // وهو ما يجعل «الرصيد = مجموع الحركات الموثّقة» قابلاً للاختبار أصلاً.
    const newAmount = applyDepositMode(previousDeposited, mode, amount)

    showToast({ text: 'تم تحديث الرصيد', type: 'success' })
    haptic.success()

    if (!user) {
      setTravelers(prev => prev.map(t => t.id === travelerId ? { ...t, deposited: newAmount } : t))
      return true
    }

    const batch = writeBatch(db)
    batch.update(travelerDoc(travelerId), { deposited: newAmount })
    batch.set(doc(depositLogsCol(travelerId)), {
      travelerId,
      previousDeposited,
      newDeposited:   newAmount,
      delta:          newAmount - previousDeposited,
      mode,
      reason:         reason.trim() || null,
      changedByEmail: user.email ?? '',
      changedByUid:   user.uid,
      createdAt:      Date.now(),
    })
    batch.commit().catch(err => handleFirestoreError(err, 'تعذر تحديث الرصيد.'))
    return true
  }, [user, setTravelers, showToast, handleFirestoreError])

  return { submitDeposit }
}
