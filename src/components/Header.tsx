import type { LucideIcon } from 'lucide-react'
import { PieChart, Lock, Unlock, Loader2, Wallet, Receipt, Scale } from '../icons'
import { useHeaderCollapse } from '../hooks/useHeaderCollapse'

export interface HeaderStats {
  totalDeposited: number
  totalSpent: number
  totalRemaining: number
}

// 1. إضافة onStatClick و isOnline للخصائص (Props)
interface HeaderProps {
  isSyncing: boolean
  isAdmin: boolean
  onToggleAdmin: () => void
  stats: HeaderStats | null
  onStatClick?: (stat: 'deposited' | 'spent' | 'remaining') => void
  isOnline?: boolean // افتراضياً ستكون true إذا لم تُمرر
}

// 2. تقييد نوع المفتاح (key) ليتطابق مع onStatClick
interface StatItem {
  key: 'deposited' | 'spent' | 'remaining'
  Icon: LucideIcon
  value: number
  tone: 'teal' | 'rose'
}

const STAT_ITEMS = (stats: HeaderStats): StatItem[] => [
  { key: 'deposited', Icon: Wallet, value: stats.totalDeposited, tone: 'teal' },
  { key: 'spent', Icon: Receipt, value: stats.totalSpent, tone: 'rose' },
  { key: 'remaining', Icon: Scale, value: stats.totalRemaining, tone: 'teal' },
]

const TONE_CLASSES: Record<StatItem['tone'], string> = {
  teal: 'bg-teal-800/50 text-teal-50',
  rose: 'bg-rose-900/40 text-rose-100',
}

const formatCompact = (num: number): string => {
  const abs = Math.abs(num)
  if (abs >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (num / 1e3).toFixed(abs % 1000 === 0 ? 0 : 1) + 'k'
  return num.toFixed(0)
}

const SCROLL_ROW =
  'overflow-x-auto touch-pan-x scroll-snap-type-x-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const Header = ({ 
  isSyncing, 
  isAdmin, 
  onToggleAdmin, 
  stats, 
  onStatClick,
  isOnline = true // تعيين قيمة افتراضية
}: HeaderProps) => {
  const isCollapsed = useHeaderCollapse()

  const renderPills = (compact: boolean) =>
    STAT_ITEMS(stats as HeaderStats).map(({ key, Icon, value, tone }) => (
      // 3. تحويل span إلى button ليكون قابلاً للضغط مع تأثيرات الحوامة (Hover)
      <button
        key={key}
        onClick={() => onStatClick?.(key)}
        className={`flex items-center gap-1 shrink-0 rounded-full font-bold tabular-nums scroll-snap-start transition-all ${
          onStatClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''
        } ${TONE_CLASSES[tone]} ${
          // 4. إخفاء حبة "المصروف" على الشاشات الأصغر من 360px في الوضع المتقلص
          compact
            ? `text-xs px-3 py-1.5 min-w-[4rem] ${key === 'spent' ? 'max-[360px]:hidden' : ''}`
            : 'text-sm px-4 py-2 min-w-[5rem]'
        }`}
      >
        <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        {compact ? formatCompact(value) : value.toFixed(2)}
      </button>
    ))

  const renderPillSkeleton = (count: number, compact: boolean) =>
    Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className={`rounded-full bg-teal-800/40 animate-pulse shrink-0 scroll-snap-start ${
          // إضافة نفس منطق الإخفاء للهيكل العظمي (Skeleton)
          compact ? `h-7 w-16 min-w-[4rem] ${i === 1 ? 'max-[360px]:hidden' : ''}` : 'h-8 w-20 min-w-[5rem]'
        }`}
      />
    ))

  return (
    <header className="bg-teal-700 text-white shadow-md sticky top-0 z-[100]">
      <div
        className={`max-w-7xl mx-auto px-4 flex items-center justify-between gap-3 transition-all duration-200 ${
          isCollapsed ? 'py-2' : 'py-3'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* 5. حاوية للأيقونة مع النقطة الحمراء (Offline UX) */}
          <div className="relative flex items-center">
            <PieChart
              className={`text-teal-100 shrink-0 transition-all duration-200 ${isCollapsed ? 'w-5 h-5' : 'w-7 h-7'}`}
            />
            {!isOnline && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" title="غير متصل بالإنترنت">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </div>

          {isCollapsed ? (
            <div
              className={`flex items-center gap-2 min-w-0 ${SCROLL_ROW}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {stats ? renderPills(true) : renderPillSkeleton(3, true)}
            </div>
          ) : (
            <>
              <h1 className="font-bold tracking-wide truncate text-xl">مصاريف السفر</h1>
              {isSyncing && (
                <span
                  role="status"
                  className="flex items-center gap-1.5 text-[11px] bg-teal-800/60 px-2 py-1 rounded-full text-teal-100 shrink-0"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  مزامنة...
                </span>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleAdmin}
          title={isAdmin ? 'الخروج من وضع المسؤول' : 'دخول وضع المسؤول'}
          className={`bg-teal-800/50 hover:bg-teal-800 text-teal-50 hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer rounded-xl font-bold border border-teal-500/30 backdrop-blur-sm shrink-0 min-h-[44px] min-w-[44px] ${
            isCollapsed ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-1.5 text-xs sm:text-sm'
          }`}
        >
          {isAdmin
            ? <><Unlock className="w-3.5 h-3.5" /> {!isCollapsed && 'إغلاق المسؤول'}</>
            : <><Lock className="w-3.5 h-3.5" /> {!isCollapsed && 'وضع المسؤول'}</>
          }
        </button>
      </div>

      {!isCollapsed && (
        <div
          className={`max-w-7xl mx-auto px-4 pb-3.5 -mt-1 flex items-center justify-center gap-3 sm:gap-4 ${SCROLL_ROW}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {stats ? renderPills(false) : renderPillSkeleton(3, false)}
        </div>
      )}
    </header>
  )
}

export default Header