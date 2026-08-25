// 🆕 «ورقة الرحلة» — تُفتح بالضغط على اسم الرحلة في الهيدر.
//
// ⚠️ سبب وجودها ليس التزيين بل خطأ في بنية المعلومات: أفعال *الرحلة* كانت
// موزّعة على مستويين خاطئين — «إدارة الرحلة» داخل قائمة الحساب (AccountMenu،
// أي مستوى «من أنا» لا «أين أنا»)، و«التقارير» داخل شريط أدوات سجل المصاريف
// (أي مستوى قائمة واحدة، بينما التقارير تخصّ الرحلة كلها). القاعدة التي
// تحكم المكان: **قائمة الحساب = من أنا، اسم الهيدر = أين أنا.**
//
// ⚠️ هذه المرحلة **إضافية محضة**: لا زرّ يُحذف من مكانه الحالي. الورقة تضيف
// نقطة دخول ثانية لأفعال قائمة، ليقرّر الاستخدام الفعلي — لا النقاش — أيّ
// نقاط الدخول تستحق البقاء. انظر docs/DECISIONS.md.
//
// عرضي بالكامل: لا Firestore ولا سياق ولا حساب. كل ما يُعرض يصل جاهزاً من
// useAppCoordinator عبر App.tsx.
import { Modal } from '../Modal'
import { haptic } from '../../utils/haptics'
import { BarChart3, Settings, Luggage, CalendarClock, ChevronLeft } from '../../icons'
import { TRIP_STATUS_LABEL, type TripStatus, type PeriodKey } from '../../types'
import { formatPeriodLabel } from '../../utils/period'

interface TripSheetModalProps {
  tripId: string
  tripName: string
  status: TripStatus
  /** الشهر المحاسبي المفتوح — يُمرَّر في الرحلة الطويلة وحدها، وغيابه هو «رحلة قياسية». */
  period?: PeriodKey
  /** منظّم هذه الرحلة أو مسؤول — نفس حدّ AccountMenu بالضبط، لا أوسع منه. */
  canManageTrip: boolean
  onOpenReports: () => void
  onOpenTripAdmin: () => void
  onClose: () => void
}

const STATUS_TONE: Record<TripStatus, string> = {
  active: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-amber-50 text-amber-700 border-amber-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function TripSheetModal({
  tripId,
  tripName,
  status,
  period,
  canManageTrip,
  onOpenReports,
  onOpenTripAdmin,
  onClose,
}: TripSheetModalProps) {
  // ⚠️ **لا «تبديل الرحلة» هنا، وليس سهواً.** «رحلاتي» مجموعة المستخدم لا
  // خاصية من خصائص الرحلة المفتوحة — تعمل حتى بلا رحلة مفتوحة إطلاقاً (شاشة
  // TripPicker)، ومكانها AccountMenu. وقد كان وجودها هنا يظهر في الكود قبل أن
  // يظهر في الاستخدام: كل فعل آخر في الورقة يستبدله اتحاد ModalState بنيوياً،
  // وحده كان يحتاج closeModal() ملفوفاً حوله لأنه يغادر طبقة المودالات.
  // أُزيلت بعد أن أكّد المالك أن قائمة الحساب هي المكان الذي يقصده فعلاً.
  const run = (action: () => void) => () => {
    haptic.light()
    action()
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm" label={`ورقة الرحلة: ${tripName}`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
          <Luggage className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-lg text-slate-800 truncate leading-tight">{tripName}</h3>
          {/* dir="ltr" ليُقرأ المعرّف اللاتيني صحيحاً، وtext-right ليبقى محاذياً
              لبداية الاسم فوقه بدل أن ينزاح لطرف البطاقة المقابل. */}
          <p className="text-[11px] text-slate-400 font-bold truncate text-right" dir="ltr">
            {tripId}
          </p>
        </div>
        {/* الحالة تُعرض دائماً لا عند الخلل وحده: «نشطة» معلومة يطمئن لها من
            يفتح رحلة لم يفتحها منذ شهور، لا ضجيجاً. */}
        <span
          className={`text-[11px] font-bold px-2 py-1 rounded-full border shrink-0 ${STATUS_TONE[status]}`}
        >
          {TRIP_STATUS_LABEL[status]}
        </span>
      </div>

      {period && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-4">
          <CalendarClock className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-indigo-800">
            الشهر المحاسبي المفتوح: {formatPeriodLabel(period)}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <SheetAction Icon={BarChart3} label="التقارير" onClick={run(onOpenReports)} />

        {canManageTrip && (
          <SheetAction Icon={Settings} label="إدارة الرحلة" onClick={run(onOpenTripAdmin)} />
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-4 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-sm"
      >
        إغلاق
      </button>
    </Modal>
  )
}

function SheetAction({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof BarChart3
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-right min-h-[44px]"
    >
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="flex-1 text-sm font-bold text-slate-800">{label}</span>
      <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  )
}
