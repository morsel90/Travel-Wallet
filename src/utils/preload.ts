// تحميل مسبق هادئ للأجزاء المؤجّلة (React.lazy) بعد أن يصبح التطبيق تفاعلياً:
// جزء lazy يُطلب أول مرة بلا اتصال يُسقط الواجهة كلها إلى ErrorBoundary. السبب
// ونافذة الـ Service Worker في docs/DECISIONS.md («Lazy chunks are preloaded»).
//
// ⚠️ «هادئ» عمداً (بعد فراغ الخيط الرئيسي) — السحب المبكر يُبطل غرض التأجيل.
// ⚠️ الفشل يُبتلع عمداً: تحسين انتهازي، وبدونه يبقى السلوك كما كان.

/** يجدول عملاً حتى يفرغ الخيط الرئيسي، مع بديل لمتصفحات بلا requestIdleCallback (أبرزها Safari الأقدم). */
export function onIdle(task: () => void, fallbackDelayMs = 2000): () => void {
  if (typeof window === 'undefined') return () => {}

  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  })

  if (typeof ric.requestIdleCallback === 'function') {
    // timeout يضمن التنفيذ ولو بقي الخيط مشغولاً — بلا سقف قد لا يأتي وقت خمول أبداً
    const id = ric.requestIdleCallback(task, { timeout: 5000 })
    return () => ric.cancelIdleCallback?.(id)
  }

  const id = window.setTimeout(task, fallbackDelayMs)
  return () => window.clearTimeout(id)
}

/**
 * يبدأ سحب مجموعة أجزاء مؤجّلة دون انتظار نتيجتها.
 *
 * ⚠️ مرّر دوال الاستيراد نفسها المستخدَمة في `lazy()` — الوحدة تُوحَّد بمسارها،
 * فمسار مختلف يسحب وحدة أخرى. لذا تُصدَّر بجوار `lazy()` في الملف نفسه.
 */
export function preloadAll(importers: Array<() => Promise<unknown>>): void {
  for (const load of importers) {
    try {
      void load().catch(() => {})
    } catch {
      // استيراد قد يرمي تزامنياً في بيئات نادرة — لا يجوز أن يُسقط المستدعي
    }
  }
}
