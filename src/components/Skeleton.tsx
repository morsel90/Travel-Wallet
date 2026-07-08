// ─── Skeleton Loading ───────────────────────────────────────────────────────
// 🆕 عناصر نائبة (placeholders) نابضة تُعرض بدل البيانات الحقيقية أثناء التحميل
// الأول فقط — أي بين لحظة اجتياز TripGate ووصول أول رد فعلي من Firestore
// (انظر expensesLoaded/travelersLoaded في useExpenses.ts/useTravelers.ts
// وisInitialLoading في App.tsx). بدون هذا، كانت تظهر فراغات/رسائل "لا توجد
// بيانات" مضلِّلة لجزء من الثانية توحي بأن الحساب فارغ فعلاً بدل أنه لا يزال
// يُحمَّل. تُستخدم لمرة واحدة فقط عند أول دخول — الاشتراكات اللاحقة (real-time
// updates) لا تُعيد إظهارها لأن expensesLoaded/travelersLoaded تبقى true بعدها.

const pulse = 'animate-pulse bg-slate-200 rounded'

// ⚠️ StatBoxSkeleton أُزيلت من هنا (وكذلك StatBox.tsx نفسه لم يعد مستورَداً في
// أي مكان) — انظر تعليق "تصغير StatBox" في App.tsx/components/Header.tsx:
// شبكة الإحصائيات المستقلة أُلغيت واندمجت الأرقام (بنبضات pulse خاصة بها عند
// التحميل) داخل الهيدر نفسه. يمكن حذف src/components/StatBox.tsx يدوياً إن رغبت
// (لم أستطع حذفه تلقائياً — لا أملك صلاحية حذف الملفات على جهازك، فقط كتابتها).

// 🆕 حُشوة/أبعاد مطابقة للبطاقة الفعلية المضغوطة بعد "تحسين بطاقات المسافرين"
// (p-3 sm:p-4 + أفتار دائري) — كانت أوسع مما يلزم قبل هذا التعديل فتُسبّب قفزة
// تخطيط بسيطة عند اكتمال التحميل، خصوصاً في شبكة العمودين الجديدة على الجوال.
export function TravelerCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-slate-100">
      <div className="flex justify-between items-start mb-2 sm:mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`${pulse} w-8 h-8 sm:w-9 sm:h-9 rounded-full shrink-0`} />
          <div className="space-y-2 min-w-0">
            <div className={`${pulse} h-4 w-20`} />
            <div className={`${pulse} h-3 w-24`} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className={`${pulse} h-3 w-10`} />
          <div className={`${pulse} h-5 w-14`} />
        </div>
      </div>
      <div className={`${pulse} h-1.5 sm:h-2 w-full`} />
    </div>
  )
}

export function ExpenseListItemSkeleton() {
  return (
    <div className="p-4 border-b border-slate-100 last:border-none">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-2">
          <div className={`${pulse} h-4 w-40`} />
          <div className={`${pulse} h-3 w-56`} />
        </div>
        <div className={`${pulse} h-5 w-16 shrink-0 ms-4`} />
      </div>
    </div>
  )
}

// 🆕 هيكل ثابت لقسم الرسوم البيانية (ChartsSection) أثناء تحميل حزمة Recharts
// (lazy-loaded — تبعية كبيرة نسبياً) — يحاكي التخطيط الفعلي (عنوان + تبويبات +
// مساحة الرسم بنفس ارتفاع h-64 المستخدَم فعلياً) بدل سبينر عام مجرّد، لتفادي أي
// قفزة في التخطيط (Layout Shift) عند اكتمال التحميل الفعلي. يُستخدم كـ
// fallback لـ <Suspense> حول <ChartsSection> في App.tsx.
export function ChartsSectionSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
        <div className={`${pulse} h-5 w-40 me-2`} />
        <div className="flex flex-wrap gap-1.5">
          <div className={`${pulse} h-7 w-24 rounded-xl`} />
          <div className={`${pulse} h-7 w-24 rounded-xl`} />
          <div className={`${pulse} h-7 w-28 rounded-xl`} />
        </div>
      </div>
      <div className="p-4">
        <div className={`${pulse} h-64 w-full`} />
      </div>
    </div>
  )
}
