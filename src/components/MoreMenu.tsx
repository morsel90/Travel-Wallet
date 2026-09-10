// 🆕 ورقة «المزيد» — نقطة الدخول الوحيدة لكل ما ليس من الأقسام الثلاثة
// الرئيسية. **وزرّ فتحها هو اسم الرحلة/الشعار في الهيدر، لا زرّ خاص بها.**
//
// ⚠️ كانت أوّل صيغة زرّاً مستقلاً (⋯) بجانب «حسابي» — وهو حرفياً العنصر الذي
// رُفض من قبل حين اقتُرح كأيقونة قلم: «عنصر إضافي يزحم هيدراً مزدحماً أصلاً»
// (انظر docs/DECISIONS.md). ولاحظ صاحب الحساب أن القائمة تحوي الإعدادات
// أيضاً، فمكانها الطبيعي خلف اسم الرحلة نفسه — نمط اسم المجموعة في واتساب
// واسم القناة في Slack: الضغط على العنوان يفتح «كل ما يخصّ هذا الشيء».
//
// ومكسب غير متوقّع: اسم الرحلة كان قابلاً للضغط **لمن يملك تعديلها وحده**
// (`canEditTrip`)، أي أنه عنصر ميّت لأغلب الأعضاء. صار الآن مفيداً للجميع —
// والتقارير والإحصائيات والمسار حقٌّ لكل عضو، بينما «إدارة الرحلة» تبقى بنداً
// مشروطاً بالصلاحية داخل الورقة.
//
// ⚠️ **السبب**: الشاشة الرئيسية كانت تعرض سبعة أقسام في تدفّق واحد (المقطع
// القادم، أرصدة المسافرين، الإحصائيات، الشهر المحاسبي، نموذج المصروف، الحساب
// البنكي، سجلّ المصاريف) وأزرارَ تقارير/سلة مبعثرة داخلها. صارت ثلاثة: المصاريف
// ← الأرصدة ← المسافرون، وكل ما عداها هنا. انظر docs/DECISIONS.md.
//
// ⚠️ ورقة سفلية (Modal) لا قائمة منسدلة كـAccountMenu: العناصر هنا أكثر
// (حتى سبعة)، ونصفها مشروط بالصلاحية أو بنوع الرحلة، فقائمة منسدلة ضيّقة
// بارتفاع متغيّر كانت ستتجاوز حافة الشاشة على الجوال. Modal يوفّر أيضاً
// حصر التركيز وEscape والسحب-للإغلاق بلا أي كود إضافي هنا (useDialogA11y).
//
// ⚠️ **لا تُكرَّر هنا أي نقطة دخول قائمة**: «تعديل الرحلة» يبقى أيضاً على اسم
// الرحلة في الهيدر لأنه المُشير الطبيعي إليها، أما التقارير/الإحصائيات/المسار/
// السلة فلا وجود لها في أي مكان آخر بعد اليوم — نفس المبدأ الذي أزال «تصدير
// Excel» و«إدارة الرحلات» من مواضعهما المكرَّرة (انظر ExpensesPanel.tsx).
import { Modal } from './Modal'
import { haptic } from '../utils/haptics'
import {
  BarChart3, PieChart, Route, CalendarClock,
  Settings, Download, Trash2, X,
} from '../icons'

export interface MoreMenuActions {
  onOpenReports: () => void
  onOpenCharts: () => void
  onOpenItinerary: () => void
  /** الرحلات طويلة المدى وحدها — undefined في الرحلة القياسية فلا يظهر البند. */
  onOpenLongTerm?: () => void
  /** مسؤول أو منظّم هذه الرحلة — undefined لغيرهما. */
  onOpenTripAdmin?: () => void
  /** المسؤول العالمي وحده (نفس حارس القسم داخل TripDetailPanel). */
  onExportBackup?: () => void
  /** المسؤول وحده — الاستعادة محكومة بـ isAdmin في القواعد. */
  onOpenTrashBin?: () => void
}

type Item = {
  key: string
  label: string
  hint: string
  Icon: typeof BarChart3
  action: () => void
}

interface MoreMenuSheetProps extends MoreMenuActions {
  onClose: () => void
}

// ⚠️ الورقة **متحكَّم بها من الخارج** (`onClose`) ولا تملك حالة فتح خاصة:
// زرّ الفتح صار في الهيدر (اسم الرحلة/الشعار)، فحالة الفتح تعيش معه هناك.
export default function MoreMenuSheet({ onClose, ...actions }: MoreMenuSheetProps) {
  const run = (action: () => void) => () => {
    haptic.light()
    // الإغلاق أولاً: النافذة المطلوبة تحلّ محلّ هذه الورقة، ولا يجوز أن
    // تكونا مفتوحتين معاً (نفس عقد ModalState الموحّد في useModals.ts).
    onClose()
    action()
  }

  // الترتيب مقصود: الأكثر طلباً أولاً، وأفعال الإدارة النادرة/الخطرة آخراً.
  const items: Item[] = [
    { key: 'reports',   label: 'التقارير',        hint: 'ملخص، كشوف، تصدير Excel وطباعة', Icon: BarChart3,     action: actions.onOpenReports },
    { key: 'charts',    label: 'الإحصائيات',      hint: 'التوزيع حسب الفئة والتطور الزمني', Icon: PieChart,      action: actions.onOpenCharts },
    { key: 'itinerary', label: 'مسار الرحلة',     hint: 'المقطع القادم وكل مقاطع التنقّل',  Icon: Route,         action: actions.onOpenItinerary },
    ...(actions.onOpenLongTerm
      ? [{ key: 'longTerm', label: 'هذا الشهر', hint: 'مصاريف الشهر وإغلاقه', Icon: CalendarClock, action: actions.onOpenLongTerm }]
      : []),
    ...(actions.onOpenTripAdmin
      ? [{ key: 'admin', label: 'إدارة الرحلة', hint: 'الاسم، المسار، الأعضاء وروابط الدعوة', Icon: Settings, action: actions.onOpenTripAdmin }]
      : []),
    ...(actions.onExportBackup
      ? [{ key: 'backup', label: 'نسخة احتياطية', hint: 'تنزيل كل بيانات الرحلة كملف JSON', Icon: Download, action: actions.onExportBackup }]
      : []),
    ...(actions.onOpenTrashBin
      ? [{ key: 'trash', label: 'سلة المهملات', hint: 'استعادة مصروف أو مسافر محذوف', Icon: Trash2, action: actions.onOpenTrashBin }]
      : []),
  ]

  return (
    <Modal onClose={onClose} label="المزيد" maxWidth="max-w-md">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold text-slate-800">المزيد</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق المزيد"
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-1.5">
        {items.map(({ key, label, hint, Icon, action }) => (
          <button
            key={key}
            type="button"
            onClick={run(action)}
            // 🆕 الاسم الوصولي هو التسمية وحدها. بدونه يُحسَب من نصّ الزرّ
            // كاملاً، فيسمع قارئ الشاشة «التقاريرملخص، كشوف، تصدير Excel
            // وطباعة» جملةً واحدة ملتصقة — الوصف مفيد للعين، ومُربِك حين
            // يُقرأ كاسمٍ للبند.
            aria-label={label}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-right hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px]"
          >
            <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">{label}</span>
              <span className="block text-[11px] text-slate-400 truncate">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
