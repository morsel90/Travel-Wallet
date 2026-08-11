import { AlertTriangle } from '../icons'

// ─── واجهات الأعطال ───────────────────────────────────────────────────────────
// عنصران ثابتان بلا حالة ولا خصائص، استُخرجا من App.tsx حيث كانا كتلتَي JSX
// مضمّنتين داخل خاصية `fallback` — وهو أسوأ مكان لقراءة تخطيط: يفصل بين
// ErrorBoundary وما يحرسه بثلاثين سطراً من التنسيق.

/** عطل يُسقط التطبيق كاملاً — الملاذ الأخير. */
export const AppErrorFallback = () => (
  <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md">
      <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
      <h1 className="text-xl font-bold text-slate-800 mb-2">عذراً، حدث خطأ غير متوقع في النظام!</h1>
      <p className="text-sm text-slate-500 mb-6">يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً.</p>
      <button
        onClick={() => window.location.reload()}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
      >
        إعادة تحميل الصفحة
      </button>
    </div>
  </div>
)

/**
 * عطل محصور في قائمة المصاريف وحدها.
 * ⚠️ حدّ منفصل عن الأعلى عمداً: انهيار صفٍّ واحد في القائمة يجب ألا يُسقط
 * الترويسة والأرصدة معه — فالمستخدم يبقى قادراً على رؤية حساباته وتصديرها.
 */
export const ExpenseListErrorFallback = () => (
  <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-2xl border border-rose-100 font-medium text-sm flex items-center justify-center gap-2">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    حدث خطأ غير متوقع أثناء عرض قائمة المصاريف، يرجى المحاولة لاحقاً.
  </div>
)
