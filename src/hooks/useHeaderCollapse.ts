import { useEffect, useRef, useState } from 'react'

// ─── useHeaderCollapse ───────────────────────────────────────────────────────
// الهيدر يتقلّص عند التمرير لأسفل ويعود كاملاً عند أي تمرير لأعلى أو عند القمة.
// DIRECTION_THRESHOLD_PX يمتصّ ارتداد الجوال (rubber-band).
//
// ⚠️ NEAR_BOTTOM_PX يكسر حلقة تغذية راجعة: الهيدر sticky داخل التدفّق، فتقلّصه
// عند القاع يُنقص scrollY فيُقرأ تمريراً لأعلى، فيتمدّد، وهكذا بلا نهاية (قِيس:
// 35 تبديلاً في ثانيتين). عند الالتصاق بالقاع لا تُبدَّل الحالة.
const NEAR_TOP_PX = 10
const NEAR_BOTTOM_PX = 4
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
        const maxScrollY = document.documentElement.scrollHeight - window.innerHeight

        if (maxScrollY > 0 && currentY >= maxScrollY - NEAR_BOTTOM_PX) {
          // ⚠️ تحديث lastYRef واجب هنا أيضاً، وإلا قُرئ التمرير التالي قفزةً وهمية.
          lastYRef.current = currentY
          tickingRef.current = false
          return
        }

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
