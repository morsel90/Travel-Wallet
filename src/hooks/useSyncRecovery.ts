import { useEffect, useRef } from 'react'

// ─── useSyncRecovery ──────────────────────────────────────────────────────────
// 🆕 يفرض قراءة طازجة من الخادم حين يعود التطبيق للواجهة أو تعود الشبكة.
//
// **لماذا يلزم هذا أصلاً، ما دام onSnapshot "فورياً":** لأن الفورية مشروطة
// ببقاء اتصال الشبكة حيّاً، وهو شرط لا يصمد على الجوال. مع
// persistentMultipleTabManager (انظر src/firebase.ts) يملك **تبويب واحد فقط**
// اتصال Firestore، وبقية التبويبات تقرأ عبر IndexedDB. حين يختفي ذلك التبويب
// دون تسليم نظيف — وهو بالضبط ما يفعله نظام الجوال بتبويب PWA في الخلفية:
// يجمّده أو يتخلّص منه — تبقى كل التبويبات الأخرى على بيانات قديمة حتى تنتهي
// صلاحية "عقد" التبويب الأساسي وينتزعه غيره. قياس فعلي على المحاكي: 32 ms
// والأساسي حيّ، مقابل ~4.4 s بعد موته فجأة، وذلك على جهاز مكتبي وشبكة محلية.
// والتبويب المجمَّد أسوأ من المغلق: يظل ممسكاً بالعقد عاجزاً عن تجديده، وعند
// إيقاظه يظن أنه ما زال يملك اتصالاً قتله النظام أصلاً.
//
// ⚠️ الانقطاع "النظيف" (الذي يُطلق فيه المتصفح حدثي offline/online) ليس
// المشكلة ولم يكن قط: الـ SDK يستمع لحدث online بنفسه ويستأنف خلال ~93 ms
// (مقاس). هذا الخطاف موجود للحالات التي **لا يُعلن عنها المتصفح**: نوم الجهاز،
// تبديل الشبكة، تجميد تبويب. لذا لا يكفي الاعتماد على حدث online وحده هنا.
//
// ⚠️ هذا ليس طابور إعادة محاولة فوق طابور Firestore — الممنوع صراحةً في
// docs/DECISIONS.md. لا يُعيد أي كتابة ولا يحتفظ بأي حمولة؛ كل ما يفعله هو
// قراءة (getDocsFromServer عبر refreshExpenses/refreshTravelers) عند لحظة
// يُرجَّح فيها أن الاتصال مات صامتاً. الكتابات تبقى شأن الـ SDK وحده.

/**
 * مهلة تهدئة بين محاولتي تعافٍ متتاليتين.
 *
 * تبديل التبويبات ذهاباً وإياباً حدث شائع جداً، وكل تعافٍ قراءة كاملة من
 * الخادم متجاوزةً الكاش. عشر ثوانٍ حدّ عملي: من غاب أقل منها لم ينقطع اتصاله
 * غالباً أصلاً (نافذة انتزاع العقد المقاسة ~4.4 s)، ومن غاب أكثر يستحق قراءة
 * طازجة.
 */
const RECOVERY_COOLDOWN_MS = 10_000

/**
 * @param enabled  لا معنى للتعافي قبل توفّر صلاحية الوصول (hasAccess) — بلا
 *                 مستخدم تعود دوال التحديث فوراً دون فعل شيء على أي حال.
 * @param refresh  جلب طازج من الخادم؛ يُستدعى مرةً واحدة فقط في كل مرة حتى لو
 *                 تلاحقت الأحداث.
 */
export function useSyncRecovery(enabled: boolean, refresh: () => Promise<void>): void {
  // يبدأ من لحظة التركيب لا من الصفر: المستمعون (onSnapshot) نفّذوا للتوّ
  // قراءتهم الأولى، فأي تعافٍ خلال الثواني التالية مباشرةً تكرار بلا فائدة.
  const lastRecoveredAtRef = useRef(Date.now())
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const recover = () => {
      // حدث online والتطبيق في الخلفية لا يستحق قراءة الآن — حين يعود
      // المستخدم فعلاً سيُطلق visibilitychange نفس المسار.
      if (document.visibilityState !== 'visible') return
      if (inFlightRef.current) return

      const now = Date.now()
      if (now - lastRecoveredAtRef.current < RECOVERY_COOLDOWN_MS) return

      lastRecoveredAtRef.current = now
      inFlightRef.current = true

      refresh()
        .catch(() => {
          // الفشل هنا متوقّع ولا يستحق إزعاج المستخدم: غالباً ما زال بلا
          // اتصال، والمستمع الحيّ يبقى المسار الأساسي الذي سيلحق لاحقاً.
          // سحب-للتحديث اليدوي هو الذي يُبلغ عن الأخطاء، لأنه إجراء طلبه
          // المستخدم صراحةً وينتظر نتيجته.
        })
        .finally(() => { inFlightRef.current = false })
    }

    document.addEventListener('visibilitychange', recover)
    window.addEventListener('online', recover)
    return () => {
      document.removeEventListener('visibilitychange', recover)
      window.removeEventListener('online', recover)
    }
  }, [enabled, refresh])
}
