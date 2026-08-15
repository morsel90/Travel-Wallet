// 🆕 سلوك لوحة المفاتيح والتركيز لأي نافذة حوارية.
//
// **ما كان ينقص قبل هذا:** كل نوافذ التطبيق — الإيداع، سلة المهملات، ملف
// المسافر، دخول المسؤول، وتأكيدات الحذف — لم تكن قابلة للاستخدام بلوحة المفاتيح
// إطلاقاً. الإغلاق كان بالنقر على الخلفية أو السحب لأسفل، وكلاهما يحتاج مؤشراً.
// من يستخدم لوحة المفاتيح وحدها كان يفتح نافذة **ولا يستطيع الخروج منها**.
//
// وأربعة سلوكيات هنا لا واحد، وكلٌّ منها يعالج عطلاً مستقلاً:
//
//   ١. Escape يُغلق      — المخرج الوحيد المتاح بلوحة المفاتيح.
//   ٢. حصر التركيز       — Tab لا يخرج خلف النافذة إلى عناصر مغطّاة بصرياً.
//   ٣. التركيز الابتدائي — يدخل النافذة عند فتحها، وإلا بقي على الزر خلفها فبدا
//                          Tab وكأنه يتنقّل في مكان عشوائي.
//   ٤. إعادة التركيز     — يعود إلى العنصر الذي فتح النافذة عند إغلاقها، فلا
//                          يسقط إلى <body> ويضطر المستخدم لبدء التنقّل من أول
//                          الصفحة في كل مرة.
import { useEffect, type RefObject } from 'react'

/** ما يمكن الوصول إليه بـ Tab داخل النافذة. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogA11y(
  containerRef: RefObject<HTMLElement>,
  onClose: () => void,
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ⚠️ يُلتقط قبل نقل التركيز لا بعده — بعد النقل يصير activeElement هو
    // النافذة نفسها، فتُفقد الإشارة إلى ما فتحها.
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        // العنصر المخفي لا يُركَّز عليه، وإدخاله في الحلقة يجعل Tab يبدو معطّلاً
        .filter(el => el.offsetParent !== null || el === document.activeElement)

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

      // الالتفاف في الطرفين هو ما يجعل الحصر حصراً — بدونه يقفز التركيز إلى
      // شريط عنوان المتصفح ثم إلى الصفحة المغطّاة خلف النافذة.
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
      // ⚠️ الفحص لازم: قد يكون العنصر أُزيل من الشجرة بينما كانت النافذة مفتوحة
      // (حُذف مسافر مثلاً)، فاستدعاء focus() على عنصر يتيم يرمي في بعض المتصفحات.
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [containerRef, onClose])
}
