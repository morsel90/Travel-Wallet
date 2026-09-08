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
//
// ⚠️ NEAR_BOTTOM_PX ليس تجميلاً بل كسرٌ لحلقة تغذية راجعة حقيقية: الهيدر
// `sticky` أي أنه *داخل تدفّق* الصفحة، فتقلّصه يُنقص ارتفاع المستند نحو ٣٠
// بكسل. وحين يكون المستخدم ملتصقاً بأسفل الصفحة تماماً، يضطر المتصفح لتقليل
// scrollY بنفس المقدار ليبقى ضمن الحدّ — فيصل هذا كحدث تمرير «لأعلى» يتجاوز
// العتبة، فيتمدّد الهيدر، فيزيد ارتفاع المستند، فيتمدّد التمرير… وهكذا بلا
// نهاية. قِيس فعلياً: تبدّل بين 68px و98px خمساً وثلاثين مرة في ثانيتين على
// شاشة جوال (390×844)، وهو ما جعل النقر على زرّ «المزيد» في الهيدر يفشل حتى
// في Playwright («element is not stable»).
//
// العلاج: عند الالتصاق بالقاع لا تُبدَّل الحالة إطلاقاً — تبقى كما هي. أي
// تمرير حقيقي لأعلى يُبعد المستخدم عن القاع فوراً فيعود السلوك المعتاد بلا
// أي تأخير محسوس.
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
          // ملتصق بالقاع — لا تبديل (انظر تعليق NEAR_BOTTOM_PX أعلاه).
          // ⚠️ تحديث lastYRef يبقى واجباً: بدونه يُقاس التمرير التالي من نقطة
          // قديمة فيُنتج قفزة وهمية بالاتجاه الخطأ.
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
