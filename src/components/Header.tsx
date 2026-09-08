import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { PieChart, Loader2, ChevronDown } from '../icons'
import { useHeaderCollapse } from '../hooks/useHeaderCollapse'
import { haptic } from '../utils/haptics'
import AccountMenu from './AccountMenu'
import MoreMenuSheet, { type MoreMenuActions } from './MoreMenu'

export interface HeaderStats {
  totalDeposited: number
  totalSpent: number
  totalRemaining: number
}

/**
 * 🆕 أرقام الدورة المحاسبية الحالية — undefined/null في الرحلة القياسية، فلا
 * يظهر اسم الدورة في السطر الموجز بحرف (نفس مبدأ `longTerm` في
 * useAppCoordinator: قيمة واحدة تُفحص هنا بدل شرط `tripType` داخل هذا الملف).
 */
export interface HeaderCycleStats extends HeaderStats {
  /** «أغسطس 2026» — يُعرض ضمن السطر الموجز تحت اسم الرحلة. */
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
  /** 🆕 منظّم الرحلة الحالية (لا مسؤول عالمي) — يمرَّر إلى AccountMenu لإخفاء
   * زرّ «تسجيل الدخول كمسؤول» عمّن لا يحتاجه أصلاً. */
  isOrganizer: boolean
  stats: HeaderStats | null
  /** 🆕 أرقام الدورة الحالية — الرحلة الطويلة فقط. غيابها (undefined/null)
   * يُبقي السطر الموجز بلا اسم دورة، بالضبط كما كان قبل هذه الميزة. */
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
  /**
   * 🆕 أفعال ورقة «المزيد» — كل ما ليس من الأقسام الثلاثة الرئيسية
   * (المصاريف/الأرصدة/المسافرون). تُمرَّر ككتلة واحدة لأنها تُستهلك ككتلة
   * واحدة في MoreMenuSheet، وكل بند فيها اختياريّته هي حارس صلاحيته —
   * ومنها «إدارة الرحلة»، التي حلّت محلّ زرّ «تعديل الرحلة» المنفصل.
   */
  more: MoreMenuActions
}

// 🆕 الشعار + نقطة "غير متصل" — بلا أي شارة تعديل: الشعار نفسه (ووسم الرحلة
// معه حين لا يكون الهيدر متقلّصاً) هو ما يُضغَط، بلا مؤشّر بصري إضافي.
function Logo({ isCollapsed, isOnline }: { isCollapsed: boolean; isOnline: boolean }) {
  return (
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
}

const Header = ({
  isSyncing,
  isAdmin,
  tripName,
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
  more,
}: HeaderProps) => {
  const isCollapsed = useHeaderCollapse()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const openMore = () => { haptic.light(); setIsMoreOpen(true) }

  // 🆕 سطر موجز واحد بدل ثلاث حبّات ملوّنة وشارة/زرّ تبديل دورة منفصلَين —
  // طلب صاحب الحساب صراحةً إزالتهما ("الشارة والتبديل زادا الزحمة")، بنمط
  // أقرب لسطر الحالة الهادئ أسفل اسم مجموعة واتساب من لوحة أرقام. "المتبقي"
  // وحده — الرقم الذي يهمّ فعلياً؛ التفصيل الكامل (المودَع/المصروف لكل عضو)
  // موجود أصلاً في «أرصدة المسافرين» أسفل الصفحة، فتكراره هنا هو الزحمة
  // الأصلية لا حلّها. لا تبديل دورة/تراكمي بعد الآن — الدورة الحالية فقط
  // حين تتوفّر (cycleStats)، وإلا فالإجمالي كما كان قبل ميزة الدورات أصلاً.
  const summaryText = stats
    ? cycleStats
      ? `دورة ${cycleStats.periodLabel} · المتبقي ${cycleStats.totalRemaining.toFixed(2)} ﷼`
      : `المتبقي ${stats.totalRemaining.toFixed(2)} ﷼`
    : null

  const renderSummary = (compact: boolean) => {
    if (!summaryText) {
      return (
        <span
          className={`block rounded-full bg-teal-800/40 animate-pulse ${compact ? 'h-3 w-28' : 'h-3.5 w-40'}`}
          aria-hidden="true"
        />
      )
    }
    const className = `truncate max-w-full text-teal-100/85 font-medium ${compact ? 'text-[11px]' : 'text-xs'}`
    // بلا onStatClick (نادراً، قبل تركيب المعالج) يبقى السطر نصّاً بحتاً لا
    // زرّاً يوهم بتفاعل لا يحدث شيئاً عنده.
    if (!onStatClick) return <span className={className}>{summaryText}</span>
    return (
      <button
        type="button"
        onClick={() => onStatClick('remaining')}
        className={`${className} hover:text-teal-50 transition-colors text-right`}
      >
        {summaryText}
      </button>
    )
  }

  return (
    // 🆕 pt-[env(safe-area-inset-top)] على <header> نفسه لا على الـ div الداخلي:
    // الخلفية التيل تمتد فتغطي منطقة الشقّ (notch)/شريط الحالة بلون متجانس (مظهر
    // native)، بينما المحتوى الفعلي (الشعار/الاسم/AccountMenu) يبقى تحت هذا
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
          {/* 🆕 **اسم الرحلة/الشعار هو زرّ فتح ورقة «المزيد»** — لا زرّ ⋯
              منفصل. لاحظ صاحب الحساب أن القائمة تحوي الإعدادات وإدارة الرحلة
              أيضاً، فمكانها الطبيعي خلف هوية الرحلة نفسها (نمط اسم المجموعة في
              واتساب واسم القناة في Slack). انظر MoreMenu.tsx وdocs/DECISIONS.md.

              ⚠️ **بلا شرط صلاحية**: الزرّ كان يظهر لمن يملك تعديل الرحلة وحده
              (`canEditTrip`)، أي أن اسم الرحلة كان عنصراً ميّتاً لأغلب
              الأعضاء. التقارير والإحصائيات والمسار حقٌّ لكل عضو، و«إدارة
              الرحلة» تبقى بنداً مشروطاً *داخل* الورقة. (القاعدة ١٧: اسأل من
              يستبعده هذا الشرط.)

              ⚠️ والشعار داخل الزرّ في الحالتين: اسم الرحلة يختفي حين يتقلّص
              الهيدر، فربط الفتح بالاسم وحده كان يُفقد الوصول للقائمة كلها
              أثناء تصفّح سجلّ طويل. */}
          {isCollapsed ? (
            <>
              <button
                type="button"
                onClick={openMore}
                aria-haspopup="dialog"
                aria-expanded={isMoreOpen}
                aria-label="قائمة الرحلة"
                title="قائمة الرحلة"
                className="flex items-center gap-1 shrink-0"
              >
                <Logo isCollapsed={isCollapsed} isOnline={isOnline} />
                <ChevronDown className="w-3.5 h-3.5 text-teal-100/80" />
              </button>
              <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
                {renderSummary(true)}
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={openMore}
                aria-haspopup="dialog"
                aria-expanded={isMoreOpen}
                aria-label="قائمة الرحلة"
                title="قائمة الرحلة"
                className="flex items-center gap-2.5 min-w-0 self-start max-w-full text-right"
              >
                <Logo isCollapsed={isCollapsed} isOnline={isOnline} />
                {/* 🆕 line-clamp-2 لا truncate: اسم يخلط عربية بمقطع لاتيني
                    يتقطّع مع truncate بترتيب بصري مُضلِّل (قصور معروف في
                    تفاعل text-overflow:ellipsis مع bidi — جرّبنا dir="ltr"
                    فزاد الأمر سوءاً). الالتفاف لسطرين يعرض الاسم كاملاً دوماً؛
                    bdi يعزل اتجاهه عن سياق RTL المحيط عند الالتفاف. */}
                {/* ⚠️ السهم **داخل** العنوان لا شقيقاً له في الـflex: الاسم
                    يلتفّ لسطرين ويشغل العرض كاملاً، فسهمٌ شقيق يُدفع إلى أقصى
                    اليسار ملاصقاً لقائمة الحساب فيُقرأ كأنه جزء منها. inline
                    داخل h1 يجعله يتبع آخر كلمة أينما وقعت. وهو وحده ما يوحي
                    بأن العنوان قائمة — بلا شيء يوحي بذلك تصبح القائمة صحيحة
                    وغير قابلة للاكتشاف في آنٍ واحد. */}
                <h1 className="font-bold tracking-wide line-clamp-2 text-xl">
                  <bdi>{tripName}</bdi>
                  <ChevronDown className="inline-block align-middle w-4 h-4 me-1.5 ms-1 text-teal-100/80" />
                </h1>
              </button>

              <div className="flex items-center gap-2 min-w-0 ps-9" aria-live="polite" aria-atomic="true">
                {renderSummary(false)}
                {isSyncing && (
                  <span
                    role="status"
                    className="flex items-center gap-1.5 text-[11px] bg-teal-800/60 px-2 py-1 rounded-full text-teal-100 shrink-0"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    مزامنة...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
      </div>

      {/* ⚠️ داخل <header> لكن خارج شريطه: Modal يرسم عبر portal إلى body على
          أي حال، فموضعها في الشجرة لا يؤثّر في تموضعها البصري. */}
      <AnimatePresence>
        {isMoreOpen && <MoreMenuSheet {...more} onClose={() => setIsMoreOpen(false)} />}
      </AnimatePresence>
    </header>
  )
}

export default Header
