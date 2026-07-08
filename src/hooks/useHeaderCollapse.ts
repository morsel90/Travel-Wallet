import { useEffect, useRef, useState } from 'react'

// ─── useHeaderCollapse ───────────────────────────────────────────────────────
// 🆕 Sticky + Collapsible Header: يتتبّع اتجاه تمرير الصفحة (window scroll —
// نفس نمط useWindowScroll المستخدَم في react-virtuoso، فلا حاجة لحاوية تمرير
// داخلية منفصلة) ليقرر متى يجب أن يتقلّص الهيدر: يتقلّص عند التمرير لأسفل
// (لتوفير مساحة عمودية أثناء تصفّح قائمة طويلة)، ويعود كاملاً فوراً عند أي
// تمرير لأعلى ولو بسيطاً، أو عند الوصول لقمة الصفحة — نفس سلوك تطبيقات الجوال
// المعتادة (يمكن دائماً "طلب" الهيدر الكامل بتمرير لأعلى، دون الاضطرار للوصول
// لقمة الصفحة كاملة).
//
// DIRECTION_THRESHOLD_PX يمنع أي اهتزاز (jitter) من تغييرات تمرير دقيقة جداً
// (أقل من بضعة بكسلات، شائعة مع bounce/rubber-band على الجوال) تُبدّل الحالة
// ذهاباً وإياباً بلا داعٍ. requestAnimationFrame + tickingRef يُخفّفان تكرار
// إعادة الحساب أثناء تمرير سريع مستمر (scroll throttling قياسي).
const NEAR_TOP_PX = 10
const DIRECTION_THRESHOLD_PX = 5

export function useHeaderCollapse(): boolean {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const lastYRef = useRef(0)
  const tickingRef = useRef(false)

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return
      tickingRef.current = true
      requestAnimationFrame(() => {
        const currentY = window.scrollY
        const lastY = lastYRef.current

        if (currentY <= NEAR_TOP_PX) {
          setIsCollapsed(false) // دائماً كامل عند قمة الصفحة
        } else if (currentY - lastY > DIRECTION_THRESHOLD_PX) {
          setIsCollapsed(true) // تمرير لأسفل بما يكفي
        } else if (lastY - currentY > DIRECTION_THRESHOLD_PX) {
          setIsCollapsed(false) // تمرير لأعلى بما يكفي
        }

        lastYRef.current = currentY
        tickingRef.current = false
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return isCollapsed
}
