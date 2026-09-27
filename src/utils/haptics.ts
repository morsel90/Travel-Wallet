// ردود فعل لمسية عبر Web Vibration API — تُتجاهل بصمت حيث لا دعم (سطح المكتب، iOS).
//
// ⚠️ success() بلا ومضة عمداً (مع كل مصروف كانت مزعجة)؛ الومضة صريحة عبر
// flash() للحظات النادرة. error() تومض دائماً لأن الأخطاء أندر.

const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && 'vibrate' in navigator

export const haptic = {
  light:   () => { if (canVibrate()) navigator.vibrate(10) },
  medium:  () => { if (canVibrate()) navigator.vibrate(20) },
  success: () => { if (canVibrate()) navigator.vibrate([50, 30, 50]) },
  error:   () => { if (canVibrate()) navigator.vibrate([100, 50, 100]); triggerVisualPulse('error') },
  // لحظات نادرة فقط (أول مصروف، نجاح مشاركة/نسخ) — لا مع كل نجاح.
  flash: (type: 'success' | 'error' = 'success') => triggerVisualPulse(type),
}

// بديل بصري للاهتزاز (iOS). يحترم prefers-reduced-motion لأنها وميض بطبيعتها.
function triggerVisualPulse(type: 'success' | 'error') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

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
