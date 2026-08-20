import { UserX } from '../icons'

interface NotAMemberScreenProps {
  /** 🆕 يُمرَّر فقط إن كان المستخدم عضواً في رحلات أخرى — منفذ للخروج من رابط رحلة لا ينتمي إليها. */
  onShowMyTrips?: () => void
}

// ─── NotAMemberScreen ───────────────────────────────────────────────────────
// 🆕 مستخدم سجّل دخوله فعلاً (AuthGate اجتازها) لكنه ليس عضواً في هذه الرحلة
// تحديداً — لا رمز رحلة بعد الآن يمكنه تجربته للانضمام ذاتياً (انظر
// docs/DECISIONS.md)، فالمسار الوحيد المتبقّي طلب رابط دعوة من المنظّم.
export default function NotAMemberScreen({ onShowMyTrips }: NotAMemberScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <UserX className="w-6 h-6 text-rose-600" />
        </div>

        <h1 className="text-lg font-bold text-slate-800 mb-1">لست عضواً في هذه الرحلة</h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          اطلب من منظّم الرحلة رابط دعوة جديد للانضمام إليها.
        </p>

        {onShowMyTrips && (
          <button
            type="button"
            onClick={onShowMyTrips}
            className="mt-4 text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline underline-offset-2 transition-colors"
          >
            العودة إلى رحلاتي
          </button>
        )}
      </div>
    </div>
  )
}
