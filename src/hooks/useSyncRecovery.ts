import { useEffect, useRef } from 'react'

// ─── useSyncRecovery ──────────────────────────────────────────────────────────
// يفرض قراءة طازجة من الخادم حين يعود التطبيق للواجهة: يسدّ انقطاع الاتصال
// الصامت (نوم الجهاز، تجميد تبويب PWA) الذي لا يراه الـ SDK. القياسات والبدائل
// المرفوضة في docs/DECISIONS.md («useSyncRecovery»).
//
// ⚠️ لا يستمع لحدث online عمداً — الـ SDK يعيد تشغيل الاتصال عنده بنفسه، وقراءة
// في اللحظة نفسها تكرار يحمل خطر محو الكتابات المعلّقة.
//
// 🔴 القراءة من الخادم تتجاوز الكاش فتمحو من الشاشة أي كتابة لم تُؤكَّد بعد —
// لذا يمرّر useAppCoordinator `enabled` مطفأً ما دام هناك صفّ `_pending`.

/** تبديل التبويبات شائع وكل تعافٍ قراءة كاملة. أقل من 10 ثوانٍ لا ينقطع فيها
 *  الاتصال غالباً (نافذة انتزاع العقد المقاسة ~4.4 s). */
const RECOVERY_COOLDOWN_MS = 10_000

/**
 * @param enabled  مطفأ بلا صلاحية وصول أو مع كتابة معلّقة (انظر أعلاه).
 * @param refresh  جلب طازج من الخادم؛ نداء واحد فقط مهما تلاحقت الأحداث.
 */
export function useSyncRecovery(enabled: boolean, refresh: () => Promise<void>): void {
  // يُضبط داخل التأثير لا في useRef(Date.now()) — انظر DECISIONS.md.
  const lastRecoveredAtRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    // ⚠️ قبل حارس enabled: التهدئة تبدأ من التركيب (المستمعون قرؤوا للتوّ) حتى
    // لو بدأ الخطّاف معطّلاً، و`??=` مرّة واحدة مهما تذبذب enabled مع _pending.
    lastRecoveredAtRef.current ??= Date.now()

    if (!enabled) return

    const recover = () => {
      // visibilitychange يُطلق عند الإخفاء أيضاً.
      if (document.visibilityState !== 'visible') return
      if (inFlightRef.current) return

      const now = Date.now()
      if (now - (lastRecoveredAtRef.current ?? 0) < RECOVERY_COOLDOWN_MS) return

      lastRecoveredAtRef.current = now
      inFlightRef.current = true

      refresh()
        // صامت عمداً: إجراء لم يطلبه المستخدم، والمستمع الحيّ سيلحق. سحب-للتحديث
        // هو من يُبلغ عن الأخطاء.
        .catch(() => {})
        .finally(() => { inFlightRef.current = false })
    }

    document.addEventListener('visibilitychange', recover)
    return () => document.removeEventListener('visibilitychange', recover)
  }, [enabled, refresh])
}
