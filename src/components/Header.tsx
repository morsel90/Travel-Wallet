import type { LucideIcon } from 'lucide-react'
import { PieChart, Loader2, Wallet, Receipt, Scale, ChevronDown } from '../icons'
import { useHeaderCollapse } from '../hooks/useHeaderCollapse'
import AccountMenu from './AccountMenu'

export interface HeaderStats {
  totalDeposited: number
  totalSpent: number
  totalRemaining: number
}

// 1. إضافة onStatClick و isOnline للخصائص (Props)
interface HeaderProps {
  isSyncing: boolean
  isAdmin: boolean
  /**
   * 🆕 اسم الرحلة المفتوحة — يحلّ محلّ «مصاريف السفر» الثابت في العنوان.
   *
   * ⚠️ العنوان يجيب عن «أين أنا؟» لا عن «ما هذا التطبيق؟». اسم التطبيق باقٍ
   * في index.html (تبويب المتصفح وPWA)، وهو مكانه الصحيح. مع تعدّد الرحلات
   * صار تأكيد الرحلة المفتوحة *قبل* تسجيل مصروف فيها معلومةً مالية لا ترفاً.
   */
  tripName: string
  /** يفتح «ورقة الرحلة» (TripSheetModal) — نقطة دخول أفعال مستوى الرحلة. */
  onOpenTripSheet: () => void
  /** 🆕 منظّم الرحلة الحالية (لا مسؤول عالمي) — يمرَّر إلى AccountMenu ليعرض «إدارة الرحلة». */
  isOrganizer: boolean
  stats: HeaderStats | null
  onStatClick?: (stat: 'deposited' | 'spent' | 'remaining') => void
  isOnline?: boolean // افتراضياً ستكون true إذا لم تُمرر
  // 🆕 قائمة الحساب الموحّدة — تجمع رحلاتي/بروفايلي/وضع المسؤول/تسجيل الخروج.
  // انظر AccountMenu.tsx وdocs/DECISIONS.md.
  displayName: string | null
  email: string | null
  /** 🆕 يُمرَّر فقط حين يكون المستخدم عضواً في أكثر من رحلة — لا معنى لعنصر تبديل لمن يملك رحلة واحدة. */
  onShowMyTrips?: () => void
  onShowProfile: () => void
  onOpenAdminPanel: () => void
  onAdminSignIn: () => void
  onSignOut: () => void
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
  tripName,
  onOpenTripSheet,
  isOrganizer,
  stats,
  onStatClick,
  isOnline = true, // تعيين قيمة افتراضية
  displayName,
  email,
  onShowMyTrips,
  onShowProfile,
  onOpenAdminPanel,
  onAdminSignIn,
  onSignOut,
}: HeaderProps) => {
  const isCollapsed = useHeaderCollapse()

  // مؤشّر انقطاع الاتصال — يُركَّب على الشعار في الوضع الكامل وعلى زرّ ورقة
  // الرحلة في المتقلّص. مستخرَج لأن العنصرين لا يظهران معاً أبداً، فنسخة واحدة
  // تكفيهما ولا يمكن أن تنحرف إحداهما عن الأخرى.
  const offlineDot = (
    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" title="غير متصل بالإنترنت">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
    </span>
  )

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
            ? `text-xs px-3 py-1.5 min-w-[3.5rem] ${key === 'spent' ? 'max-[360px]:hidden' : ''}`
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
          compact
            ? `h-7 w-16 min-w-[3.5rem] ${i === 1 ? 'max-[360px]:hidden' : ''}`
            : 'h-8 w-20 min-w-[5rem]'
        }`}
      />
    ))

  return (
    // 🆕 pt-[env(safe-area-inset-top)] على <header> نفسه لا على الـ div الداخلي:
    // الخلفية التيل تمتد فتغطي منطقة الشقّ (notch)/شريط الحالة بلون متجانس (مظهر
    // native)، بينما المحتوى الفعلي (الشعار/الإحصاءات/AccountMenu) يبقى تحت هذا
    // الحشو بمسافته الحالية py-2/py-3 كما هي — لا "max()" هنا: القيمة صفر أصلاً
    // على كل الأجهزة الحالية بلا شقّ (بخلاف SmartInputBar حيث كان مطلوباً حدّ أدنى
    // 1rem دائماً). راجع index.html وdocs/DECISIONS.md.
    <header className="bg-teal-700 text-white shadow-md sticky top-0 z-[100] pt-[env(safe-area-inset-top)]">
      <div
        className={`max-w-7xl mx-auto px-4 flex items-center justify-between gap-3 transition-all duration-200 ${
          isCollapsed ? 'py-2' : 'py-3'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* 5. الشعار مع النقطة الحمراء (Offline UX) — في الوضع الكامل وحده.
              ⚠️ يختفي عند التقلّص عمداً: مساحة الشريط المتقلّص كلها للأرقام،
              وشعار التطبيق أقلّ عناصرها إفادةً لمن يقرأ رصيده. حلّ محلّه زرّ
              ورقة الرحلة، والنقطة الحمراء انتقلت إليه فلم تُفقد. من دون هذا
              التبادل كانت الحبّة الثالثة (المتبقّي — أهمّها) تُقتطع على شاشة
              390px بعد إضافة الزرّ. */}
          {!isCollapsed && (
            <div className="relative flex items-center">
              <PieChart className="text-teal-100 shrink-0 transition-all duration-200 w-7 h-7" />
              {!isOnline && offlineDot}
            </div>
          )}

          {isCollapsed ? (
            <>
              {/* ⚠️ لا يختفي مدخل ورقة الرحلة عند التمرير. الهيدر المتقلّص
                  يستبدل العنوان بالحبّات، وإخفاء المدخل معه كان سيُغيّب أفعال
                  الرحلة في اللحظة التي يحتاجها المستخدم فعلاً (بعد أن مرّر
                  ورأى مصاريفه). النصّ وحده هو ما يُضحّى به لضيق الشاشة، لا
                  الوصول — وهنا يصير aria-label لازماً لأن الزر بلا نصّ. */}
              <button
                type="button"
                onClick={onOpenTripSheet}
                aria-haspopup="dialog"
                aria-label="ورقة الرحلة"
                className="relative flex items-center justify-center shrink-0 min-h-[44px] w-7 -ms-1.5 rounded-xl text-teal-100 hover:bg-teal-800/40 active:bg-teal-800/60 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                {!isOnline && offlineDot}
              </button>
              <div
                className={`flex items-center gap-2 min-w-0 ${SCROLL_ROW}`}
                aria-live="polite"
                aria-atomic="true"
              >
                {stats ? renderPills(true) : renderPillSkeleton(3, true)}
              </div>
            </>
          ) : (
            <>
              {/* ⚠️ الاسم داخل <h1> لا بدلاً منه: العنوان الرئيسي للصفحة يبقى
                  عنواناً لقارئ الشاشة، والزر داخله هو الفعل. ولا aria-label هنا
                  عمداً (بخلاف AccountMenu): الاسم الوصولي *يجب* أن يكون اسم
                  الرحلة نفسه — فهو المعلومة التي أُضيفت أصلاً، وaria-label كان
                  سيحجبها عمّن يسمع الصفحة ولا يراها. */}
              <h1 className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={onOpenTripSheet}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 w-full min-w-0 min-h-[44px] px-1.5 -mx-1.5 rounded-xl hover:bg-teal-800/40 active:bg-teal-800/60 transition-colors"
                >
                  <span className="font-bold tracking-wide truncate text-xl">{tripName}</span>
                  <ChevronDown className="w-4 h-4 text-teal-200 shrink-0" />
                </button>
              </h1>
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

        <AccountMenu
          displayName={displayName}
          email={email}
          isAdmin={isAdmin}
          isOrganizer={isOrganizer}
          onShowMyTrips={onShowMyTrips}
          onShowProfile={onShowProfile}
          onOpenAdminPanel={onOpenAdminPanel}
          onAdminSignIn={onAdminSignIn}
          onSignOut={onSignOut}
        />
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
