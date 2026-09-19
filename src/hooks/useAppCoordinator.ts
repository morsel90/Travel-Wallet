import { useState, useRef, useCallback, useEffect } from 'react'
import * as Sentry from '@sentry/react'
import type { ToastMessage } from '../types'
import { useModals } from './index'
import { useAppSession } from './useAppSession'
import { useAppTrip } from './useAppTrip'
import { useTripWorkspace } from './useTripWorkspace'
import { describeWriteError, writeErrorCode } from '../utils/writeErrors'
import { onIdle, preloadAll } from '../utils/preload'
import { modalImporters } from '../components/ModalManager'
import { tripPickerImporters } from '../components/TripPicker'

// ─── منسّق التطبيق ────────────────────────────────────────────────────────────
//
// تجميع لا أكثر. مسار التطبيق كله ثلاث خطوات تُقرأ من أعلى لأسفل:
//
//   session   → useAppSession     من أنا، وهل أدخل هذه الرحلة؟
//   trip      → useAppTrip        أيّ رحلة، ومن يديرها؟ (+ قائمة «رحلاتي»)
//   workspace → useTripWorkspace  ما بداخلها: الدفتر وأرقامه وأفعاله
//
// كل خطوة تستهلك ناتج ما قبلها بحقول مسمّاة صراحةً في الاستدعاء — فالاعتماديات
// بين المجموعات مرئية هنا في سطر واحد لكل منها، لا مدفونة في ٦٠٠ سطر.
//
// الذي يعيش هنا فعلاً هو ما تحتاجه الثلاث معاً: التوست، وخطأ المزامنة
// ومعالج أخطاء الكتابة، والمودالات. وفيما عدا ذلك، مكان أي خطاف جديد إحدى
// المجموعات الثلاث — لا هذا الملف.
//
// ⚠️ ما لا يعيش هنا عمداً:
//   • مخزن الرحلة (data/actions) → store/TripStoreProvider.tsx، لأن
//     الفصل بينها حسب التقلّب حِمل أداء يجب أن يُقرأ في ملف واحد بالعين
//     المجرّدة.
//   • قرار أي شاشة تُعرض → App.tsx، فذلك توجيه لا تركيب.
//
// ⚠️ شكل الناتج (session/ledger/trip/...) عقد مع App.tsx، لا انعكاس للمجموعات
// الثلاث: `session.isOrganizer` مثلاً مصدره useAppTrip. غيّر أحدهما دون الآخر.

// 🆕 كل الأجزاء المؤجّلة في التطبيق، للتحميل المسبق الهادئ بعد أول عرض.
// كل مالك جزء مؤجّل يُصدّر مستورداته بنفسه، فمن يضيف جزءاً يضيفه في ملفه.
// 🆕 لا chartsImporters منفصلة بعد الآن: ChartsSection انتقل خلف زرّ «المزيد»
// داخل ChartsModal، وهذا الأخير من modalImporters — فيظلّ مغطّى بالتحميل
// المسبق بلا قائمة ثانية (انظر ModalManager.tsx وutils/preload.ts).
const LAZY_IMPORTERS = [...modalImporters, ...tripPickerImporters]

export function useAppCoordinator() {
  // ─── المشترك بين المجموعات الثلاث ──────────────────────────────────────────
  const [syncError, setSyncError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const modals = useModals()

  const showToast = useCallback((msg: ToastMessage, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    if (durationMs !== Infinity) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), durationMs)
    }
  }, [])

  // 🆕 يعتمد على كود خطأ Firestore لا على البحث في نص الرسالة: النص غير موثوق
  // (يتغيّر بين إصدارات SDK وقد يكون مترجَماً)، والكود ثابت ومحدَّد.
  // fallback يُستخدم فقط حين لا يكون الخطأ من Firestore أصلاً — انظر utils/writeErrors.ts.
  const handleFirestoreError = useCallback((err: unknown, fallback: string) => {
    const code = writeErrorCode(err)
    Sentry.captureException(err, { tags: { source: 'firestore-write' } })
    setSyncError(code ? describeWriteError(err, 'generic').text : fallback)
  }, [])

  // ─── المسار: الجلسة ← الرحلة ← مساحة العمل ─────────────────────────────────
  const session = useAppSession({ showToast })

  const trip = useAppTrip({
    user: session.user, isAdmin: session.isAdmin, hasAccess: session.hasAccess,
    authLoading: session.authLoading, joinedTripIds: session.joinedTripIds,
    showToast, handleFirestoreError,
  })

  const workspace = useTripWorkspace({
    user: session.user, isAdmin: session.isAdmin, hasAccess: session.hasAccess,
    profileDisplayName: session.profile.profile.displayName,
    config: trip.config, isOrganizer: trip.isOrganizer,
    modals, showToast, handleFirestoreError, setSyncError,
  })

  // 🆕 سحب الأجزاء المؤجّلة بهدوء بعد أن يصبح التطبيق تفاعلياً، حتى تكون حاضرة
  // إن انقطع الاتصال لاحقاً. لولا هذا، أول مصروف يُسجَّل في رحلة أثناء الانقطاع
  // يستدعي ChartsSection لأول مرة فيفشل استيرادها وتنهار الواجهة إلى
  // ErrorBoundary (كشفه اختبار E2E فعلياً — انظر utils/preload.ts).
  //
  // ⚠️ موضعه هنا يضمن أنه يسبق أي `return` مشروط في App (قواعد الـ Hooks) —
  // وهذا سبب إضافي لبقاء التوجيه في App والتركيب هنا.
  // ولا نسحب شيئاً قبل ثبوت الوصول: لا معنى لتحميل مودالات لمن لم يجتز البوابة.
  const { hasAccess } = session
  useEffect(() => {
    if (!hasAccess) return
    return onIdle(() => preloadAll(LAZY_IMPORTERS))
  }, [hasAccess])

  return {
    /** 🆕 رابط دعوة بنقرة واحدة — App.tsx يعرض InviteJoinScreen طالما 'joining' أو 'needsName'. */
    invite: session.invite,
    /** المصادقة والوصول وحالة الشبكة. */
    session: {
      user: session.user, isAdmin: session.isAdmin, hasAccess, isOnline: session.isOnline,
      authLoading: session.authLoading, joinedTripIds: session.joinedTripIds,
      // 🆕 لا PIN بعد الآن — تسجيل الدخول (AuthGate) هو الحارس الوحيد المتبقي.
      signInError: session.signInError, isSigningIn: session.isSigningIn,
      signInWithGoogle: session.signInWithGoogle, signInWithEmail: session.signInWithEmail,
      // 🆕 الخروج من نفس خطّاف الدخول — لا خطّاف مصادقة ثانٍ بعد اليوم.
      signOut: session.signOut,
      /** 🆕 منظّم الرحلة الحالية (لا مسؤول عالمي) — مصدره useAppTrip. */
      isOrganizer: trip.isOrganizer,
    },
    ledger: workspace.ledger,
    trip: trip.trip,
    longTerm: workspace.longTerm,
    /** 🆕 بيانات بنك منظّم الرحلة الحالية — حيّة من users/{organizerUid}. */
    organizerBank: trip.organizerBank,
    rates: workspace.rates,
    /** حالة المزامنة والتنبيهات. */
    status: {
      isSyncing: workspace.isSyncing, syncError, toast,
      handlePullToRefresh: workspace.handlePullToRefresh,
      hasUnsavedData: workspace.hasUnsavedData,
      // 🆕 مُصدَّرة لاستخدامها خارج هذا الملف عند الحاجة إلى توست من مكوّن لا
      // يملك مساراً خادمياً خاصاً به يُطلقه بنفسه (مثال: نسخ رابط دعوة احتياطياً
      // حين لا يدعم الجهاز Web Share API — انظر TripDetailPanel.tsx).
      showToast,
    },
    picker: trip.picker,
    tripEdit: trip.tripEdit,
    /** 🆕 بروفايل المستخدم العام — لشاشة البروفايل، وهو مصدر بيانات البنك
     * الوحيد لأي رحلة ينظّمها هذا المستخدم (انظر organizerBank أعلاه). */
    profile: session.profile.profile,
    isSavingProfile: session.profile.isSaving,
    saveProfile: session.profile.saveProfile,
    filter: workspace.filter,
    modals,
    requestDeleteTraveler: workspace.requestDeleteTraveler,
    /** 🆕 يُمرَّر إلى AuthGate — استرداد كلمة المرور قبل تسجيل الدخول. */
    passwordReset: session.passwordReset,
    expense: workspace.expense,
    traveler: workspace.traveler,
    deposit: workspace.deposit,
  }
}
