import { useRef, useState } from 'react'
import type { ReactNode, TouchEvent as ReactTouchEvent } from 'react'
import { Loader2, RefreshCw } from '../icons'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

// ─── Pull-to-Refresh ─────────────────────────────────────────────────────────
// 🆕 إيماءة جوال أصلية: سحب لأسفل عند قمة الصفحة يفرض إعادة جلب expenses/
// travelers من الخادم مباشرة متجاوزاً الكاش المحلي تماماً (انظر
// refreshExpenses/refreshTravelers في useExpenses.ts/useTravelers.ts، ويُمرَّران
// معاً كـ onRefresh من App.tsx). لا زر إضافي — تماماً كما طُلب.
//
// ⚠️ ملاحظة تصميم مهمة: القائمة (react-virtuoso) تستخدم useWindowScroll (تمرّر
// الصفحة كاملة، لا حاوية داخلية منفصلة) — لذا "أعلى نقطة" الوحيدة المتاحة
// فعلياً هي قمة الصفحة (window.scrollY === 0)، وليس تحديداً قمة قسم قائمة
// المصاريف (الذي يقع أسفل نموذج الإضافة/بطاقة الحساب البنكي على الجوال). هذا
// المكوّن يُغلِّف <main> بالكامل في App.tsx فيعمل عند قمة الصفحة أياً كان
// المحتوى الظاهر هناك حالياً — نفس سلوك تطبيقات الجوال المعتادة (المستخدم
// يسحب من أعلى الصفحة، لا من داخل قائمة فرعية بالضرورة).
//
// السحب لا يبدأ تتبّعه إطلاقاً إلا إن كانت الصفحة في القمة فعلاً، فلا يتعارض
// مع أي تمرير رأسي عادي للأسفل، ولا مع سحب الإجراءات الأفقي على عناصر
// المصاريف (ExpenseListItem) — الأخير لا يستدعي stopPropagation فتصل الأحداث
// هنا أيضاً، لكن حساب deltaY المستقل هنا يبقى صفراً تقريباً لأي سحب أفقي بحت
// فلا يظهر مؤشر السحب أصلاً في تلك الحالة.
const PULL_MAX_PX = 80
const PULL_TRIGGER_PX = 60

const PullToRefresh = ({ onRefresh, children }: PullToRefreshProps) => {
  const touchStartYRef = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    // لا نبدأ التتبّع إلا إن كانت الصفحة في القمة فعلاً، ولا أثناء تحديث سابق
    // لا يزال جارياً (يمنع تراكم طلبات جلب متزامنة من سحبات متكرّرة سريعة)
    if (isRefreshing || window.scrollY > 0) return
    touchStartYRef.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null) return
    // إن تحرّكت الصفحة عن القمة أثناء السحب نفسه (نادر) نُلغي المتابعة فوراً
    if (window.scrollY > 0) {
      touchStartYRef.current = null
      setIsDragging(false)
      setPullDistance(0)
      return
    }
    const deltaY = e.touches[0].clientY - touchStartYRef.current
    if (deltaY <= 0) { setPullDistance(0); return } // نتتبّع السحب لأسفل فقط
    // مقاومة مطاطية (rubber-band): كل px فعلي من الإصبع يقابله نصف px بصرياً،
    // بحدّ أقصى PULL_MAX_PX حتى لا ينزلق المحتوى بلا حدود
    setPullDistance(Math.min(PULL_MAX_PX, deltaY * 0.5))
  }

  const handleTouchEnd = () => {
    const finalDistance = pullDistance
    touchStartYRef.current = null
    setIsDragging(false)

    if (finalDistance < PULL_TRIGGER_PX) {
      setPullDistance(0) // سحب لم يبلغ الحدّ — يعود المحتوى لمكانه دون تحديث
      return
    }

    setIsRefreshing(true)
    onRefresh().finally(() => {
      setIsRefreshing(false)
      setPullDistance(0)
    })
  }

  const indicatorProgress = Math.min(1, pullDistance / PULL_TRIGGER_PX)
  const contentOffset = isRefreshing ? PULL_TRIGGER_PX : pullDistance

  return (
    <div className="relative">
      {/* 🆕 مؤشر السحب — سهم دوّار يتتبّع نسبة الاقتراب من حدّ التفعيل، يتحوّل
          لسبينر أثناء التحديث الفعلي */}
      <div
        className="absolute inset-x-0 flex items-center justify-center overflow-hidden pointer-events-none transition-opacity"
        style={{ top: -40, height: 40, opacity: pullDistance > 0 || isRefreshing ? 1 : 0 }}
      >
        {isRefreshing ? (
          <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
        ) : (
          <RefreshCw
            className="w-5 h-5 text-teal-500"
            style={{ transform: `rotate(${indicatorProgress * 180}deg)` }}
          />
        )}
      </div>

      <div
        style={{
          transform: `translateY(${contentOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}

export default PullToRefresh
