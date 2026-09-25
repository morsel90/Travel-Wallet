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
import { callable } from './callables'
import { callableMessage } from '../utils/callableErrors'
import { TRIP_ID } from '../utils/tripId'
import type { Traveler, DepositMode, ToastMessage } from '../types'

interface UseDepositActionsParams {
  user: User | null
  /**
   * 🆕 منظّم الرحلة (لا المسؤول): المودَع يمرّ من recordDeposit الخادمية، التي
   * تكتب الرصيد وسطر تدقيقه في معاملة واحدة — القواعد لا تسمح له بلمس
   * `deposited` مباشرة (انظر firestore.rules وdocs/DECISIONS.md). المسؤول يبقى
   * على الدفعة المحلية لأنها تعمل بلا اتصال.
   */
  viaServer: boolean
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
  /** 🆕 المودَع الابتدائي لمسافر أُنشئ للتوّ بصفر — مسار المنظّم (انظر useTravelerActions). */
  recordDepositViaServer: (travelerId: number, mode: DepositMode, amount: number, reason: string | null) => Promise<void>
}

export function useDepositActions({
  user, viaServer, setTravelers, showToast, handleFirestoreError,
}: UseDepositActionsParams): UseDepositActionsResult {
  const recordDepositViaServer = useCallback(async (
    travelerId: number, mode: DepositMode, amount: number, reason: string | null,
  ) => {
    await callable('recordDeposit')({ tripId: TRIP_ID, travelerId, mode, amount, reason })
  }, [])

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

    // 🆕 مسار المنظّم: لا تحديث متفائل — الخادم يحسب على آخر رصيد فعلي، والنتيجة
    // تصل عبر onSnapshot. التنبيه بعد النجاح لا قبله، فلا يُقال «تم» لما رُفض.
    if (viaServer && user) {
      recordDepositViaServer(travelerId, mode, amount, reason.trim() || null)
        .then(() => {
          haptic.success()
          showToast({ text: 'تم تحديث الرصيد', type: 'success' })
        })
        .catch(err => {
          haptic.error()
          const message = callableMessage(err)
          if (message) showToast({ text: message, type: 'error' }, 6000)
          else handleFirestoreError(err, 'تعذر تحديث الرصيد.')
        })
      return true
    }

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
  }, [user, viaServer, recordDepositViaServer, setTravelers, showToast, handleFirestoreError])

  return { submitDeposit, recordDepositViaServer }
}
