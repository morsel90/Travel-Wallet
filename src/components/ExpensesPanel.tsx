import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Expense, SortOrder } from '../types'
import ErrorBoundary from './ErrorBoundary'
import EmptyState from './EmptyState'
import { ExpenseListItem } from './ExpenseSection'
import { ExpenseListItemSkeleton } from './Skeleton'
import { ExpenseListErrorFallback } from './AppErrorFallback'
import { Receipt, Search, Plus } from '../icons'

interface ExpensesPanelProps {
  isInitialLoading: boolean
  /** هل تقبل الرحلة مصاريف جديدة؟ يغيّر نص الحالة الفارغة وزرّها. */
  canAddExpenses: boolean
  activeExpenses: Expense[]
  filteredExpenses: Expense[]
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortOrder: SortOrder
  setSortOrder: (value: SortOrder) => void
  onOpenExpenseForm: () => void
  /**
   * 🆕 عدّاد يتغيّر مع كل مصروف يُسجَّل بنجاح (expenseAddedSignal) — تغيّره
   * يُمرِّر الصفحة إلى هذا القسم.
   *
   * ⚠️ لماذا صار لازماً: سجلّ المصاريف هو **أول** أقسام الشاشة الآن، وشريط
   * الإدخال السريع ثابت أسفلها — أي أن المستخدم غالباً ممرَّر لأسفل حين
   * يسجّل مصروفاً، فيُضاف المصروف في رأس قائمة *خارج نطاق رؤيته تماماً*.
   * التنبيه (Toast) يقول «تم» لكنه لا يُري النتيجة. وقائمة react-virtuoso لا
   * تكتفي بإخفاء الصفّ بل لا تُركّبه أصلاً وهو خارج النطاق — فلا شيء يظهر
   * حتى بالتمرير اليدوي البطيء إن أُعيد القياس متأخراً.
   */
  scrollToSignal?: number
}

// ─── سجل المصاريف ─────────────────────────────────────────────────────────────
// شريط الأدوات + البحث + القائمة الافتراضية. ExpenseListItem وحده يقرأ السياق.
//
// 🆕 ولا زرّ «تصدير Excel» — كان استدعاءً حرفياً لنفس exportTripToExcel بنفس
// الوسائط الأربع التي يستدعيها الزرّ داخل ReportsView، أي الزرّ ذاته مرتين لا
// نقطتَي دخول لميزة واحدة. مكانه الطبيعي داخل التقارير حيث يُنظَر إلى ما
// يُصدَّر، والتصدير فعل نادر لا يخسر شيئاً بعمق نقرة (انظر docs/DECISIONS.md).
//
// 🆕 لا زرّ «إدارة الرحلة/الرحلات» هنا بعد الآن — كان مكرَّراً مع AccountMenu
// (الهيدر)، الذي وُسِّع ليخدم isOrganizer أيضاً لا isAdmin فقط. نقطة الوصول
// الوحيدة الآن للوحة الإدارة. انظر AccountMenu.tsx وdocs/DECISIONS.md.
//
// 🆕 ولا زرّ «التقارير» ولا «سلة المهملات» — كلاهما انتقل إلى زرّ «المزيد» (⋯)
// في الهيدر مع بقية ما ليس من الأقسام الثلاثة الرئيسية. ما بقي في هذا القسم هو
// ما يخدم قراءة السجلّ نفسه لا غير: البحث والترتيب.
//
// ⚠️ نقل السلة لا يعيد المشكلة التي وثّقها التعليق السابق (اختفاء طريق التراجع
// بعد حذف آخر مصروف): موضعها الجديد ثابت في الهيدر، لا يعتمد على حالة القائمة
// إطلاقاً — أي أنه يُرى في *كل* الحالات لا في حالة القائمة وحدها. القاعدة ١٧.
export const ExpensesPanel = ({
  isInitialLoading, canAddExpenses,
  activeExpenses, filteredExpenses,
  searchQuery, setSearchQuery, sortOrder, setSortOrder,
  onOpenExpenseForm, scrollToSignal,
}: ExpensesPanelProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const isShowingList = !isInitialLoading && activeExpenses.length > 0 && filteredExpenses.length > 0
  // ⚠️ رُصد أن Virtuoso (useWindowScroll) قد يقيس نطاق النافذة خطأً — إما عند
  // أول تركيب له (انتقال من EmptyState إليه، إن سبقه تسلسل نوافذ/تنقّلات
  // كلوحة الإدارة ثم نموذج مصروف)، أو حتى وهو مُركَّب مسبقاً بعد تغيّر عدد
  // العناصر (مثال: حذف مصروف بالتراجع الفوري — hidden محلياً ثم يعود دون أن
  // يُعيد Virtuoso تركيبه بالضرورة). filteredExpenses.length (لا isShowingList
  // وحده) في الاعتماديات يضمن إعادة النداء عند أي تغيّر فعلي في العدد، لا
  // فقط عند الانتقال من/إلى الفراغ. scrollTo رخيصة الاستدعاء ولا تُحرِّك
  // موضع التمرير الفعلي (نفس top الحالي) — مجرّد إجبار على إعادة القياس.
  // انظر docs/DECISIONS.md.
  useEffect(() => {
    if (!isShowingList) return
    const id = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollTo({ top: window.scrollY })
    })
    return () => cancelAnimationFrame(id)
  }, [isShowingList, filteredExpenses.length])


  // 🆕 التمرير إلى السجلّ بعد كل تسجيل ناجح — انظر scrollToSignal أعلاه.
  //
  // ⚠️ الحارس على القيمة صفر/غياب: التمرير عند أول تركيب يقفز بالصفحة بلا سبب.
  //
  // ⚠️ **تمرير صريح على النافذة بإحداثية محسوبة** — لا `scrollIntoView` ولا
  // `Virtuoso.scrollToIndex`. جُرّب كلاهما وقيسا تحت حمل متوازٍ:
  //   • `scrollToIndex` لا يتحرّك أصلاً أحياناً — يقارن بحالته الداخلية عن
  //     موضع القائمة، وهي حالة قديمة في لحظة إضافة صفّ في الرأس.
  //   • `scrollIntoView` يتحرّك ثم **يرتدّ**: react-virtuoso (useWindowScroll)
  //     يعوّض إزاحة المحتوى الناتجة عن الصفّ الجديد بتحريك تمرير النافذة بنفسه
  //     بعد جزء من الثانية.
  // الإحداثية المحسوبة لا تلتبس، والنداء الثاني بعد استقرار التعويض يُعيد
  // الموضع إن ارتدّ — وإن لم يرتدّ فهو تمرير إلى المكان نفسه، بلا أثر مرئي.
  //
  // الإزاحة 96px تقريباً بقدر الهيدر الملتصق، وإلا وقف عنوان القسم خلفه.
  useEffect(() => {
    if (!scrollToSignal) return
    const scrollToSection = () => {
      const el = sectionRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 96
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
    scrollToSection()

    // ⚠️ والنداء الثاني **يتنازل للمستخدم**: لو مرّر بإصبعه أو عجلته أو لوحة
    // مفاتيحه خلال هذه المهلة فقد قرّر وجهته بنفسه، ويُلغى. بلا هذا الإلغاء
    // كان مَن يضيف مصروفاً ثم يمرّر فوراً يُجذب إلى الأعلى بعد جزء من الثانية
    // بلا سبب مفهوم — رُصد فعلياً أثناء المعاينة.
    //
    // ولماذا wheel/touchstart/keydown/mousedown لا حدث scroll: تعويض
    // react-virtuoso نفسه *ينتج* حدث scroll، فالإلغاء عليه كان سيُلغي النداء
    // الثاني في الحالة التي وُجد من أجلها بالضبط. هذه الأربعة لا يُنتجها إلا
    // إنسان (mousedown يغطّي سحب شريط التمرير على سطح المكتب).
    const settleTimer = window.setTimeout(scrollToSection, 400)
    const cancel = () => window.clearTimeout(settleTimer)
    const opts = { passive: true, once: true } as const
    window.addEventListener('wheel', cancel, opts)
    window.addEventListener('touchstart', cancel, opts)
    window.addEventListener('keydown', cancel, { once: true })
    window.addEventListener('mousedown', cancel, { once: true })

    return () => {
      window.clearTimeout(settleTimer)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('keydown', cancel)
      window.removeEventListener('mousedown', cancel)
    }
  }, [scrollToSignal])

  return (
  <section ref={sectionRef} id="expenses-section" className="scroll-mt-24">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-4 px-1">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-slate-500" /> سجل المصاريف
        {!isInitialLoading && activeExpenses.length > 0 && (
          <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full tabular-nums">
            {activeExpenses.length}
          </span>
        )}
      </h2>
    </div>

    <div className="flex gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالوصف أو المشارك..."
          className="w-full border border-slate-200 rounded-xl pr-9 ps-3 py-2 text-base focus:ring-2 focus:ring-teal-500 outline-none"
        />
      </div>
      <select
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value as unknown as SortOrder)}
        className="border border-slate-200 rounded-xl px-2 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none"
      >
        <option value="date_desc">الأحدث أولاً</option>
        <option value="date_asc">الأقدم أولاً</option>
        <option value="amount_desc">الأعلى مبلغاً</option>
        <option value="amount_asc">الأقل مبلغاً</option>
      </select>
    </div>

    {/* ⚠️ حدّ خطأ منفصل عن حدّ التطبيق: صفٌّ واحد فاسد في القائمة يجب ألا
        يُسقط الأرصدة والترويسة معه. */}
    {/* 🆕 لا حاوية بطاقة مشتركة هنا بعد الآن — كل صفّ بطاقته العائمة الخاصة
        (ExpenseListItem)، فحاوية بيضاء واحدة تغلّفها جميعاً كانت تُنتج بطاقة
        داخل بطاقة. EmptyState لا يحتاج حاوية أصلاً (نفس نمط TravelersPanel.tsx). */}
    <ErrorBoundary fallback={<ExpenseListErrorFallback />}>
      {isInitialLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => <ExpenseListItemSkeleton key={i} />)}
        </div>
      ) : activeExpenses.length === 0 ? (
        <EmptyState
          Icon={Receipt}
          title={canAddExpenses ? 'لا توجد مصاريف بعد' : 'لا توجد مصاريف في هذه الرحلة'}
          description={canAddExpenses
            ? 'ابدأ بتسجيل أول مصروف للرحلة، وسيتولّى التطبيق حساب حصة كل مسافر تلقائياً.'
            : 'أُغلقت هذه الرحلة دون تسجيل أي مصروف فيها.'}
          actionLabel={canAddExpenses ? 'سجّل أول مصروف' : undefined}
          onAction={canAddExpenses ? onOpenExpenseForm : undefined}
          ActionIcon={canAddExpenses ? Plus : undefined}
        />
      ) : filteredExpenses.length === 0 ? (
        <div className="p-8 text-center text-slate-400 font-medium bg-white rounded-2xl shadow-sm">لا توجد نتائج لـ "{searchQuery}"</div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          useWindowScroll
          data={filteredExpenses}
          itemContent={(_index, exp) => <ExpenseListItem expense={exp} />}
          scrollSeekConfiguration={{
            enter: velocity => Math.abs(velocity) > 900,
            exit: velocity => Math.abs(velocity) < 30,
          }}
          components={{
            ScrollSeekPlaceholder: () => <ExpenseListItemSkeleton />,
          }}
        />
      )}
    </ErrorBoundary>

    {searchQuery && filteredExpenses.length > 0 && (
      <p className="text-xs text-slate-400 mt-2 px-1">
        {filteredExpenses.length} من {activeExpenses.length} مصروف
      </p>
    )}

  </section>
  )
}
