import { Loader2, Users } from '../icons'

// ─── InviteJoinScreen ───────────────────────────────────────────────────────
// 🆕 شاشة كاملة تُعرض أثناء استهلاك رابط دعوة (?invite=TOKEN) — بديل بوابة رمز
// الرحلة (TripGate) لمن دخل برابط دعوة بدل رابط رحلة عادي. لا نموذج هنا: العملية
// تلقائية بالكامل (انظر useInviteJoin)، فالشاشة عرض حالة فقط بلا أي تفاعل.
export default function InviteJoinScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6 text-teal-600" />
        </div>
        <p className="text-sm font-bold text-slate-700 mb-3">جارٍ الانضمام إلى الرحلة...</p>
        <Loader2 className="w-5 h-5 text-teal-500 animate-spin mx-auto" />
      </div>
    </div>
  )
}
