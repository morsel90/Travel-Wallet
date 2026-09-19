// 🆕 تسجيل تحويل بين مسافرَين — استدعاء واحد لدالة `recordSettlement` السحابية.
//
// ⚠️ **لا كتابة Firestore هنا، وهذا هو جوهر الملف** (القاعدة ٤): الحركة تكتب
// `deposited` لطرفَين وسطرَي تدقيق، وكلها `isAdmin()` في firestore.rules —
// فمنظّم الرحلة، وهو من يدير التحويلات فعلاً، لا يملك المسار من متصفحه. السبب
// الكامل في تعليق `recordSettlement` في functions/index.js.
//
// ⚠️ ولا تحديث متفائل (استثناء واعٍ من القاعدة ١٠، نفس استثناء
// useLongTermActions): الخادم يُعيد حساب الرصيدَين ويفحص سقف التحويل لحظة
// التنفيذ، وعرض اختفاء التسوية قبل وصول النتيجة يعني احتمال إظهار دفترٍ لم
// يُكتب. المستمعون الحيّون (onSnapshot) يُحدّثون الشاشة بعد النجاح بلا عمل هنا.
import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import { haptic } from '../utils/haptics'
import { callableMessage } from '../utils/callableErrors'
import type { ToastMessage } from '../types'

/** يطابق ما تقرأه recordSettlement في functions/index.js حرفاً بحرف. */
interface RecordSettlementRequest {
  tripId: string
  fromId: number
  toId: number
  amount: number
}

interface RecordSettlementResponse {
  success: boolean
  tripId: string
  fromId: number
  toId: number
  /** المبلغ كما سجّله الخادم بعد التقريب — لا كما أرسله العميل. */
  amount: number
}

interface UseSettlementActionsParams {
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export interface UseSettlementActionsResult {
  /** معرّف التسوية الجاري تسجيلها (`fromId→toId`)، أو null — لتعطيل زرّها وحده. */
  recordingKey: string | null
  recordSettlement: (
    tripId: string, fromId: number, toId: number, amount: number, toName: string,
  ) => Promise<boolean>
}

export function useSettlementActions({
  showToast, handleFirestoreError,
}: UseSettlementActionsParams): UseSettlementActionsResult {
  const [recordingKey, setRecordingKey] = useState<string | null>(null)

  const recordSettlement = useCallback(async (
    tripId: string, fromId: number, toId: number, amount: number, toName: string,
  ): Promise<boolean> => {
    setRecordingKey(`${fromId}→${toId}`)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      // الدالة تقرأ دور المنظّم من سجلّ العضوية لا من التوكن، لكن التوكن هو ما
      // يُثبت الهوية أصلاً — نفس ترتيب useLongTermActions.
      await user.getIdToken(true)

      const call = httpsCallable<RecordSettlementRequest, RecordSettlementResponse>(
        functions, 'recordSettlement',
      )
      const { data } = await call({ tripId, fromId, toId, amount })

      haptic.success()
      showToast({ text: `سُجّل تحويل ${data.amount.toFixed(2)} ريال إلى ${toName}`, type: 'success' }, 5000)
      return true
    } catch (err) {
      // رسائل الخادم عربية ومحدّدة السبب (ليس مديناً، تجاوز السقف، رحلة غير
      // نشطة) — تُعرض كما هي. نفس معالجة useLongTermActions ولنفس السبب:
      // الخادم وحده يعرف *لماذا* رُفض التحويل.
      haptic.error()
      const message = callableMessage(err)
      if (message) {
        showToast({ text: message, type: 'error' }, 6000)
      } else {
        handleFirestoreError(err, 'تعذّر تسجيل التحويل — تحقّق من اتصالك.')
      }
      return false
    } finally {
      setRecordingKey(null)
    }
  }, [showToast, handleFirestoreError])

  return { recordingKey, recordSettlement }
}
