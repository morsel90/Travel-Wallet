// 🆕 شريط «انتهى الشهر» — الطريق القصير إلى إغلاقه.
//
// كان الإغلاق خلف أربع ضغطات: اسم الرحلة ← «هذا الشهر» ← «إغلاق…» ← «تأكيد».
// عملية تتكرّر كل شهر لا ينبغي أن تُبحث عنها. هذا الشريط يظهر **للمنظّم أو
// المسؤول وحده، وحين ينتهي الشهر المفتوح وحده** (isMonthDue في
// useTripWorkspace)، ويفتح التأكيد مباشرةً — ضغطتان بدل أربع.
//
// ⚠️ **بلا اسم الشهر عمداً.** الشاشة الرئيسية لا تسمّي الأشهر (انظر «التعقيد
// الداخلي مقبول، التعقيد الظاهر لا» في docs/DECISIONS.md). الاسم يظهر في خطوة
// التأكيد التي يفتحها، وهناك مكانه: هي ما يُقرأ قبل عملية لا يُتراجع عنها.
//
// ⚠️ ولا يُعرض في غير وقته: شريط دائم الظهور يصير ضجيجاً يتعلّم المستخدم
// تجاهله، فلا يراه في الشهر الذي يحتاجه فيه. الطريق الطويل عبر «المزيد» باقٍ
// لمن أراده قبل ذلك.
import { CalendarCheck } from '../../icons'

interface MonthDueBannerProps {
  isBusy: boolean
  onCloseMonth: () => void
}

export function MonthDueBanner({ isBusy, onCloseMonth }: MonthDueBannerProps) {
  return (
    <div className="bg-indigo-50 text-indigo-900 p-4 rounded-xl text-sm border border-indigo-200 shadow-xs flex items-center gap-3">
      <CalendarCheck className="w-5 h-5 shrink-0 text-indigo-600" />
      <p className="flex-1 leading-relaxed">
        انتهى الشهر — أغلقه ليبدأ الجديد بأرصدة الجميع كما هي.
      </p>
      <button
        type="button"
        onClick={onCloseMonth}
        disabled={isBusy}
        className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
      >
        إغلاق الشهر
      </button>
    </div>
  )
}
