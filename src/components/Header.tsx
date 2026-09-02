import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PieChart, Loader2, Wallet, Receipt, Scale, RefreshCw } from '../icons'
import { useHeaderCollapse } from '../hooks/useHeaderCollapse'
import AccountMenu from './AccountMenu'

export interface HeaderStats {
  totalDeposited: number
  totalSpent: number
  totalRemaining: number
}

/**
 * 🆕 أرقام الدورة المحاسبية الحالية — undefined/null في الرحلة القياسية، فلا
 * يظهر شارة الدورة ولا زرّ التبديل بحرف (نفس مبدأ `longTerm` في
 * useAppCoordinator: قيمة واحدة تُفحص هنا بدل شرط `tripType` داخل هذا الملف).
 */
export interface HeaderCycleStats extends HeaderStats {
  /** «أغسطس 2026» — يُعرض في الشارة فوق الإحصاءات. */
  periodLabel: string
}

// 1. إضافة onStatClick و isOnline للخصائص (Props)
interface HeaderProps {
  isSyncing: boolean
  isAdmin: boolean
  /**
   * 🆕 اسم الرحلة المفتوحة — يحلّ محلّ «مصاريف السفر» الثابت في العنوان.
   *
   * ⚠️ العنوان يجيب عن «أين أنا؟» لا عن «ما هذا التطبيق؟». اسم التطبيق باقٍ في
   * index.html (تبويب المتصفح وPWA)، وهو مكانه الصحيح. ومع تعدّد الرحلات صار
   * تأكيد الرحلة المفتوحة *قبل* تسجيل مصروف فيها معلومةً مالية لا ترفاً بصرياً.
   */
  tripName: string
  /**
   * 🆕 شعار التطبيق (أيقونة الرسم الدائري) — واسم الرحلة معه حين لا يكون
   * الهيدر متقلّصاً — يصبحان زرّ تعديل الرحلة لمن يملك صلاحيتها (مسؤول أو
   * منظّم هذه الرحلة تحديداً)، بلا أي شارة أو أيقونة إضافية تزحم الهيدر. الشعار
   * وحده هو الزرّ في وضع التقلّص (اسم الرحلة يختفي عندها ويستبدله ملخّص
   * الإحصاءات)، فربط التعديل بالاسم وحده كان يفقد القدرة على التعديل أثناء
   * تصفّح سجلّ طويل. لتعديل رحلة أخرى: تُفتح أولاً من «رحلاتي» ثم تُعدَّل من
   * هنا بعد أن تصبح هي المفتوحة.
   */
  canEditTrip: boolean
  onEditTrip: () => void
  /** 🆕 منظّم الرحلة الحالية (لا مسؤول عالمي) — يمرَّر إلى AccountMenu لإخفاء
   * زرّ «تسجيل الدخول كمسؤول» عمّن لا يحتاجه أصلاً. */
  isOrganizer: boolean
  stats: HeaderStats | null
  /** 🆕 أرقام الدورة الحالية — الرحلة الطويلة فقط. غيابها (undefined/null)
   * يُبقي الهيدر بلا شارة ولا زرّ تبديل، بالضبط كما كان قبل هذه الميزة. */
  cycleStats?: HeaderCycleStats | null
  onStatClick?: (stat: 'deposited' | 'spent' | 'remaining') => void
  isOnline?: boolean // افتراضياً ستكون true إذا لم تُمرر
  // 🆕 قائمة الحساب الموحّدة — تجمع رحلاتي/بروفايلي/وضع المسؤول/تسجيل الخروج.
  // انظر AccountMenu.tsx وdocs/DECISIONS.md.
  displayName: string | null
  email: string | null
  /** 🆕 يُمرَّر حين يكون المستخدم عضواً في أكثر من رحلة، أو مسؤولاً/منظّماً —
   * «رحلاتي» نقطة الدخول الوحيدة الآن لإدارة أي رحلة (انظر App.tsx). */
  onShowMyTrips?: () => void
  onShowProfile: () => void
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
  canEditTrip,
  onEditTrip,
  isOrganizer,
  stats,
  cycleStats,
  onStatClick,
  isOnline = true, // تعيين قيمة افتراضية
  displayName,
  email,
  onShowMyTrips,
  onShowProfile,
  onAdminSignIn,
  onSignOut,
}: HeaderProps) => {
  const isCollapsed = useHeaderCollapse()

  // 🆕 الافتراضي: عرض الدورة الحالية حين تتوفر (طلب صاحب الحساب صراحةً) —
  // القيمة تبقى true بلا أثر في الرحلة القياسية لأن cycleStats غائبة أصلاً
  // هناك، فـ displayedStats تسقط إلى stats دائماً بغضّ النظر عن هذه الحالة.
  const [showCycle, setShowCycle] = useState(true)
  const displayedStats: HeaderStats | null = cycleStats && showCycle ? cycleStats : stats

  // 🆕 شارة الدورة الحالية + زرّ التبديل — الرحلة الطويلة فقط (cycleStats).
  // ⚠️ **تُعرض دائماً بغضّ النظر عن isCollapsed، داخل صفّ الحبات نفسه لا في
  // صفّ منفصل مشروط بـ `!isCollapsed`.** أول نسخة وضعتها في صفّ خاص يختفي مع
  // التقلّص — فصار ظهورها/اختفاؤها يغيّر ارتفاع الهيدر (اللاصق) تبعاً لحالة
  // isCollapsed نفسها، وisCollapsed مبنية على حدث scroll. النتيجة حلقة تغذية
  // راجعة رُصدت فعلاً في e2e (long-term-rollover.spec.ts): تمرير Playwright
  // التلقائي نحو زرّ أسفل الصفحة يُطلق حدث scroll → الهيدر يتقلّص → الشارة
  // تختفي فيقصر الهيدر → المحتوى يرتفع → الهدف يتحرّك → إعادة محاولة النقر
  // تُمرّر مجدداً → قد يتوسّع الهيدر مجدداً → ذباب لا ينتهي حتى انتهاء المهلة
  // ("element is not stable"). الحل: الشارة جزء من صفّ الحبات ذاته (يظهر في
  // الحالتين المتقلّصة والكاملة كما تفعل الحبات تماماً)، فتبديل isCollapsed
  // لا يغيّر وجودها من الأساس — فقط حجمها (compact)، تماماً كبقية الحبات.
  const renderCycleBadge = (compact: boolean) =>
    cycleStats && (
      <button
        type="button"
        onClick={() => setShowCycle(v => !v)}
        title={showCycle ? 'اضغط لعرض الإجمالي التراكمي للرحلة' : 'اضغط لعرض الدورة الحالية'}
        className={`flex items-center gap-1 shrink-0 rounded-full font-bold scroll-snap-start transition-colors bg-indigo-500/40 hover:bg-indigo-500/60 text-indigo-50 ${
          compact ? 'text-[10px] px-2 py-1.5' : 'text-xs px-3 py-2'
        }`}
      >
        {showCycle
          ? (compact ? cycleStats.periodLabel : `دورة ${cycleStats.periodLabel}`)
          : (compact ? 'الإجمالي' : 'الإجمالي التراكمي للرحلة')}
        <RefreshCw className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>
    )

  const renderPills = (compact: boolean) =>
    STAT_ITEMS(displayedStats as HeaderStats).map(({ key, Icon, value, tone }) => (
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

  // 🆕 الشعار + نقطة "غير متصل" — بلا أي شارة تعديل: الشعار نفسه (ووسم الرحلة
  // معه حين لا يكون الهيدر متقلّصاً) هو ما يُضغَط، بلا مؤشّر بصري إضافي.
  const renderLogo = () => (
    <span className="relative flex items-center shrink-0">
      <PieChart className={`text-teal-100 transition-all duration-200 ${isCollapsed ? 'w-5 h-5' : 'w-7 h-7'}`} />
      {!isOnline && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" title="غير متصل بالإنترنت">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        </span>
      )}
    </span>
  )

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
          {/* 🆕 لا شارة/زرّ إضافي — الشعار (دائماً ظاهر)، واسم الرحلة (حين لا
              يكون الهيدر متقلّصاً) كلاهما يفتح تعديل الرحلة مباشرة لمن يملك
              صلاحيتها. عنصر واحد قابل للضغط في كل حالة (لا اثنان بنفس التسمية
              معاً): الشعار وحده في وضع التقلّص، والشعار+الاسم معاً حين لا. */}
          {isCollapsed ? (
            <>
              {canEditTrip ? (
                <button
                  type="button"
                  onClick={onEditTrip}
                  aria-label="تعديل الرحلة"
                  title="تعديل الرحلة"
                  className="shrink-0"
                >
                  {renderLogo()}
                </button>
              ) : renderLogo()}
              <div
                className={`flex items-center gap-2 min-w-0 ${SCROLL_ROW}`}
                aria-live="polite"
                aria-atomic="true"
              >
                {renderCycleBadge(true)}
                {displayedStats ? renderPills(true) : renderPillSkeleton(3, true)}
              </div>
            </>
          ) : (
            <>
              {canEditTrip ? (
                <button
                  type="button"
                  onClick={onEditTrip}
                  aria-label="تعديل الرحلة"
                  title="تعديل الرحلة"
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-right"
                >
                  {renderLogo()}
                  <h1 className="font-bold tracking-wide truncate text-xl">{tripName}</h1>
                </button>
              ) : (
                <>
                  {renderLogo()}
                  <h1 className="font-bold tracking-wide truncate text-xl">{tripName}</h1>
                </>
              )}
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
          {/* «المتبقي» لا يتغيّر رقمه بين الدورة والإجمالي التراكمي (هو نفسه
              في الحالتين، انظر calculateCycleWallet) — مقصود لا عرض ناقص. */}
          {renderCycleBadge(false)}
          {displayedStats ? renderPills(false) : renderPillSkeleton(3, false)}
        </div>
      )}
    </header>
  )
}

export default Header