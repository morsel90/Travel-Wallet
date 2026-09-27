// سلوك لوحة المفاتيح والتركيز لأي نافذة حوارية — أربعة لا واحد (DECISIONS.md):
// Escape يُغلق، حصر Tab داخلها، تركيز ابتدائي داخلها، وإعادة التركيز لمن فتحها.
import { useEffect, type RefObject } from 'react'

/** ما يمكن الوصول إليه بـ Tab داخل النافذة. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogA11y(
  // `| null`: في React 19 يُنتج useRef<T>(null) النوع RefObject<T | null>.
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ⚠️ يُلتقط قبل نقل التركيز لا بعده — بعد النقل يصير activeElement هو
    // النافذة نفسها، فتُفقد الإشارة إلى ما فتحها.
    const previouslyFocused = document.activeElement as HTMLElement | null

    // ⚠️ لا offsetParent للتحقق من الظهور: null لكل عنصر داخل `position: fixed`
    // (فيتعطّل الحصر بصمت) ودائماً في jsdom.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true')

    // أول حقل إن وُجد، وإلا الحاوية نفسها (لهذا تحمل tabIndex={-1}).
    const first = focusables()[0]
    ;(first ?? container).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        // لا شيء يُركَّز عليه: نمنع خروج التركيز خلف النافذة أصلاً
        e.preventDefault()
        return
      }

      const firstItem = items[0]
      const lastItem  = items[items.length - 1]
      const active    = document.activeElement

      // الالتفاف في الطرفين هو الحصر نفسه.
      if (!e.shiftKey && active === lastItem) {
        e.preventDefault()
        firstItem.focus()
      } else if (e.shiftKey && (active === firstItem || active === container)) {
        e.preventDefault()
        lastItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // ⚠️ isConnected: قد يكون المُطلِق أُزيل أثناء فتح النافذة.
      // ⚠️ preventScroll: التركيز على زرّ الشريط السفلي كان يجرّ الصفحة ويُلغي
      // التمرير إلى سجلّ المصاريف بعد الحفظ (DECISIONS.md).
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [containerRef, onClose])
}
