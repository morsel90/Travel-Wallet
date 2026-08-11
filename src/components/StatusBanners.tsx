import { AlertTriangle, WifiOff, Lock } from '../icons'

interface StatusBannersProps {
  /** رسالة دورة حياة الرحلة (منتهية/مؤرشفة) — null إن كانت نشطة. */
  tripClosedNotice: string | null
  isOnline: boolean
  syncError: string | null
}

// ─── لافتات الحالة ────────────────────────────────────────────────────────────
// الثلاث مجتمعة لأنها تشغل الموضع نفسه أعلى المحتوى وتتنافس على انتباه المستخدم،
// فرؤيتها في ملف واحد تُظهر ترتيبها وتكرارها — وهو ما كان يضيع بينها مبعثرة في
// App.tsx.
//
// ⚠️ لافتة الرحلة المغلقة **إعلام لا حماية**: المنع الفعلي في firestore.rules
// (tripAcceptsExpenses/tripAcceptsWrites). وجودها هو الفرق بين «أزرار اختفت
// بلا سبب» و«رحلة أُغلقت وهذا ما يعنيه» — انظر utils/tripStatus.ts.
export const StatusBanners = ({ tripClosedNotice, isOnline, syncError }: StatusBannersProps) => (
  <>
    {tripClosedNotice && (
      <div className="bg-slate-100 text-slate-700 p-4 rounded-xl text-sm border border-slate-200 shadow-sm flex items-start gap-2">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
        {tripClosedNotice}
      </div>
    )}

    {!isOnline && (
      <div className="bg-amber-100 text-amber-800 p-4 rounded-xl text-sm border border-amber-200 shadow-sm flex items-start gap-2">
        <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
        أنت غير متصل بالإنترنت حالياً. أي إضافة أو تعديل أو حذف ستقوم به سيُحفظ محلياً تلقائياً ويُرسل بمجرد عودة الاتصال.
      </div>
    )}

    {syncError && (
      <div className="bg-rose-100 text-rose-800 p-4 rounded-xl text-sm border border-rose-200 shadow-sm flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        {syncError}
      </div>
    )}
  </>
)
