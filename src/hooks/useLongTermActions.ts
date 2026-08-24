// 🆕 عمليات الرحلات طويلة المدى — إغلاق الشهر وخروج المنتدَبين.
//
// ⚠️ **لا كتابة Firestore واحدة في هذا الملف، وهذا هو جوهره.** كل ما هنا
// استدعاء دالة سحابية عبر httpsCallable (القاعدة ٤). السبب مفصَّل في تعليق
// closeMonth في functions/index.js، وخلاصته أن الترحيل من المتصفح **مرفوض
// بقواعد المشروع القائمة أصلاً**: كتابة `deposited` وسطر التدقيق كلاهما
// isAdmin()، وحدّ المعدّل يرفض عشرين مصروفاً في دفعة واحدة. لا يُضعَّف أي من
// هذه القيود لأجل هذه الميزة.
//
// ⚠️ ولا تحديث متفائل هنا (استثناء واعٍ من القاعدة ١٠): القاعدة تصف كتابة
// واحدة يعرف العميل نتيجتها سلفاً. الترحيل عملية مالية مركّبة يحسبها الخادم من
// جديد لحظة التنفيذ، وعرض نتيجة مفترضة قبل وصولها يعني احتمال عرض مبالغ لم
// تُكتب. المستمعون الحيّون (onSnapshot) يُحدّثون الشاشة بعد نجاح الاستدعاء بلا
// أي عمل إضافي هنا.
import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import { haptic } from '../utils/haptics'
import { formatPeriodLabel } from '../utils/period'
import type { PeriodKey, RolloverResult, ToastMessage } from '../types'

// عقود الاستدعاء — تطابق ما تقرأه الدالتان في functions/index.js
interface CloseMonthRequest { tripId: string; period: PeriodKey }
interface ExitTravelerRequest { tripId: string; travelerId: number; settle: boolean }
interface ExitTravelerResponse {
  success: boolean
  tripId: string
  travelerId: number
  /** المبلغ الذي سُوّي فعلاً (صفر إن كان الحساب مسوّى أصلاً). */
  settledAmount: number
  direction: 'credit' | 'debt' | 'settled'
}

interface UseLongTermActionsParams {
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export interface UseLongTermActionsResult {
  isClosingMonth: boolean
  isExitingTraveler: boolean
  /** يُرجع ملخّص ما نُفِّذ فعلاً، أو null عند الفشل (التوست يُعرض هنا). */
  closeMonth: (tripId: string, period: PeriodKey) => Promise<RolloverResult | null>
  /**
   * `settle: false` يطلب الخروج ويترك الخادم يرفض إن كان الرصيد غير مسوّى —
   * ورسالة الرفض هي الإرشاد نفسه. `settle: true` يُسوّي ثم يُخرج في معاملة واحدة.
   */
  exitTraveler: (tripId: string, travelerId: number, settle: boolean) => Promise<boolean>
}

/**
 * الدالتان ترسلان رسائل عربية مفهومة في `message` ضمن FunctionsError — نعرضها
 * كما هي بدل رسالة عامة. نفس معالجة callManageTrip في useTripAdminActions.ts
 * بالضبط، ولنفس السبب: الخادم وحده يعرف *لماذا* رُفضت العملية (شهر مُغلق
 * سلفاً، رصيد غير مسوّى، رحلة قياسية)، وأي إعادة صياغة هنا تُفقد ذلك السبب.
 */
function showCallableError(
  err: unknown,
  fallback: string,
  showToast: UseLongTermActionsParams['showToast'],
  handleFirestoreError: UseLongTermActionsParams['handleFirestoreError'],
): void {
  haptic.error()
  const message = (err as { message?: string })?.message
  const code = (err as { code?: string })?.code
  const isFunctionsError = typeof code === 'string' && code.startsWith('functions/')

  if (isFunctionsError && message) showToast({ text: message, type: 'error' }, 6000)
  else handleFirestoreError(err, fallback)
}

export function useLongTermActions({
  showToast, handleFirestoreError,
}: UseLongTermActionsParams): UseLongTermActionsResult {
  const [isClosingMonth, setIsClosingMonth] = useState(false)
  const [isExitingTraveler, setIsExitingTraveler] = useState(false)

  const closeMonth = useCallback(async (tripId: string, period: PeriodKey): Promise<RolloverResult | null> => {
    setIsClosingMonth(true)
    try {
      // تحديث التوكن قبل الاستدعاء — الدالة تفحص دور المنظّم من سجلّ العضوية
      // لا من التوكن، لكن التوكن هو ما يُثبت الهوية أصلاً. نفس ترتيب
      // callManageTrip في useTripAdminActions.ts.
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const call = httpsCallable<CloseMonthRequest, RolloverResult>(functions, 'closeMonth')
      const { data } = await call({ tripId, period })

      haptic.success()
      showToast({
        text: `تم إغلاق ${formatPeriodLabel(data.closedPeriod)} وترحيل ${data.written.deposits} رصيداً إلى ${formatPeriodLabel(data.openedPeriod)}`,
        type: 'success',
      }, 5000)
      return data
    } catch (err) {
      showCallableError(err, 'تعذّر إغلاق الشهر — تحقّق من اتصالك.', showToast, handleFirestoreError)
      return null
    } finally {
      setIsClosingMonth(false)
    }
  }, [showToast, handleFirestoreError])

  const exitTraveler = useCallback(async (
    tripId: string, travelerId: number, settle: boolean,
  ): Promise<boolean> => {
    setIsExitingTraveler(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('غير مسجّل الدخول.')
      await user.getIdToken(true)

      const call = httpsCallable<ExitTravelerRequest, ExitTravelerResponse>(functions, 'exitTraveler')
      const { data } = await call({ tripId, travelerId, settle })

      haptic.success()
      showToast({
        text: data.settledAmount > 0
          ? `تمت تسوية ${data.settledAmount.toFixed(2)} ريال وإخراج العضو من الرحلة`
          : 'تم إخراج العضو من الرحلة',
        type: 'success',
      }, 4000)
      return true
    } catch (err) {
      showCallableError(err, 'تعذّر إخراج العضو — تحقّق من اتصالك.', showToast, handleFirestoreError)
      return false
    } finally {
      setIsExitingTraveler(false)
    }
  }, [showToast, handleFirestoreError])

  return { isClosingMonth, isExitingTraveler, closeMonth, exitTraveler }
}
