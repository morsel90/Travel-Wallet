// 🆕 ردود فعل لمسية (Haptic Feedback) خفيفة للأجهزة المحمولة التي تدعم الاهتزاز.
// Web Vibration API متاح فقط على متصفحات الجوال (Android/Chrome غالباً)؛ نتحقق
// من وجوده أولاً حتى لا يفشل الاستدعاء على أجهزة سطح المكتب أو iOS Safari
// (الذي لا يدعم navigator.vibrate). كل الدوال آمنة وتُتجاهل بصمت عند عدم الدعم.
//
// أنماط الاهتزاز:
//   light   → نقرة خفيفة جداً (اختيار/تنقّل)         10ms
//   medium  → تأكيد أوضح (حذف/إجراء متوسط)           20ms
//   success → نبضتان متتاليتان (نجاح عملية)          [50, 30, 50]
//   error   → نبضتان قويتان (فشل/تحذير)              [100, 50, 100]
//
// ⚠️ ملاحظة تصميم: success() لا تُطلق الومضة البصرية تلقائياً — كانت في تجربة
// أولى تُطلَق مع كل haptic.success() (أي كل مصروف يُضاف)، فبدت مزعجة ومتكررة.
// الومضة الآن صريحة عبر haptic.flash() وتُستدعى فقط عند لحظات "احتفالية"
// فعلية: أول مصروف يُسجَّل في الرحلة، نجاح المشاركة، ونجاح النسخ. أما error()
// فتبقى تُطلق الومضة تلقائياً لأن الأخطاء أندر ويستحق التنبيه البصري لها دوماً.

const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && 'vibrate' in navigator

export const haptic = {
  light:   () => { if (canVibrate()) navigator.vibrate(10) },
  medium:  () => { if (canVibrate()) navigator.vibrate(20) },
  success: () => { if (canVibrate()) navigator.vibrate([50, 30, 50]) },
  error:   () => { if (canVibrate()) navigator.vibrate([100, 50, 100]); triggerVisualPulse('error') },
  // 🆕 ومضة بصرية صريحة — استدعِها فقط عند لحظة تستحق الاحتفاء بها
  // (أول مصروف، نجاح مشاركة، نجاح نسخ)، وليس مع كل نجاح روتيني.
  flash: (type: 'success' | 'error' = 'success') => triggerVisualPulse(type),
}

// 🆕 بديل بصري خفيف لأجهزة لا تدعم الاهتزاز (أبرزها iOS Safari): ومضة لون سريعة
// تغطي الشاشة لِلحظة عند النجاح/الخطأ. نحترم تفضيل تقليل الحركة
// (prefers-reduced-motion) فلا نُظهر الومضة لمن فعّله — لأنها بطبيعتها وميض.
function triggerVisualPulse(type: 'success' | 'error') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const color = type === 'success' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)'
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;background:${color};opacity:0;transition:opacity 120ms ease`
  document.body.appendChild(overlay)
  requestAnimationFrame(() => { overlay.style.opacity = '1' })
  setTimeout(() => {
    overlay.style.opacity = '0'
    setTimeout(() => overlay.remove(), 120)
  }, 120)
}
