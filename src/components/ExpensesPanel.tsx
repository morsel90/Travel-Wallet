import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Expense, SortOrder } from '../types'
import ErrorBoundary from './ErrorBoundary'
import EmptyState from './EmptyState'
import { ExpenseListItem } from './ExpenseSection'
import { ExpenseListItemSkeleton } from './Skeleton'
import { ExpenseListErrorFallback } from './AppErrorFallback'
import { haptic } from '../utils/haptics'
import { Receipt, Search, Plus, BarChart3, Trash2 } from '../icons'

interface ExpensesPanelProps {
  isInitialLoading: boolean
  isAdmin: boolean
  /** هل تقبل الرحلة مصاريف جديدة؟ يغيّر نص الحالة الفارغة وزرّها. */
  canAddExpenses: boolean
  activeExpenses: Expense[]
  filteredExpenses: Expense[]
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortOrder: SortOrder
  setSortOrder: (value: SortOrder) => void
  onOpenReports: () => void
  onOpenTrashBin: () => void
  onOpenExpenseForm: () => void
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
export const ExpensesPanel = ({
  isInitialLoading, isAdmin, canAddExpenses,
  activeExpenses, filteredExpenses,
  searchQuery, setSearchQuery, sortOrder, setSortOrder,
  onOpenReports, onOpenTrashBin, onOpenExpenseForm,
}: ExpensesPanelProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
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

  return (
  <section id="expenses-section" className="scroll-mt-24">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-4 px-1">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-slate-500" /> سجل المصاريف
      </h2>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { haptic.light(); onOpenReports() }}
          className="flex items-center gap-1.5 text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm"
        >
          <BarChart3 className="w-3.5 h-3.5" /> التقارير
        </button>
      </div>
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

    {/* 🆕 سلة المهملات في نهاية السجلّ لا في شريطه العلوي — نمط «المحذوفات آخر
        القائمة» المتعارف عليه (بريد جوجل، صور iOS). الشريط العلوي مساحة أولى،
        والسلة أندر ما كان فيه.
        ⚠️ **وهي شقيقة لكتلة العرض لا داخل أي فرع منها.** وضعها في تذييل
        Virtuoso (أو داخل فرع القائمة) كان يُخفيها في الحالة التي تُطلب فيها
        أكثر من غيرها: مسؤول حذف **آخر** مصروف فظهرت شاشة «لا توجد مصاريف بعد»
        بدل القائمة — أي أن طريق التراجع يختفي في اللحظة التي وقع فيها الخطأ.
        (القاعدة ١٧: اسأل من يستبعده هذا الشرط قبل شحنه.) */}
    {isAdmin && !isInitialLoading && (
      <div className="mt-4 pt-3 border-t border-slate-200/70 flex justify-center">
        <button
          onClick={() => { haptic.light(); onOpenTrashBin() }}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-3 py-2 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
        >
          <Trash2 className="w-3.5 h-3.5" /> سلة المهملات
        </button>
      </div>
    )}
  </section>
  )
}
