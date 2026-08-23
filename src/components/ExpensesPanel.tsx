import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Expense, SortOrder } from '../types'
import ErrorBoundary from './ErrorBoundary'
import EmptyState from './EmptyState'
import { ExpenseListItem } from './ExpenseSection'
import { ExpenseListItemSkeleton } from './Skeleton'
import { ExpenseListErrorFallback } from './AppErrorFallback'
import { haptic } from '../utils/haptics'
import { Receipt, Download, Search, Plus, BarChart3 } from '../icons'

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
  onExport: () => void
  onOpenExpenseForm: () => void
}

// ─── سجل المصاريف ─────────────────────────────────────────────────────────────
// شريط الأدوات + البحث + القائمة الافتراضية. ExpenseListItem وحده يقرأ السياق.
//
// 🆕 لا زرّ «إدارة الرحلة/الرحلات» هنا بعد الآن — كان مكرَّراً مع AccountMenu
// (الهيدر)، الذي وُسِّع ليخدم isOrganizer أيضاً لا isAdmin فقط. نقطة الوصول
// الوحيدة الآن للوحة الإدارة. انظر AccountMenu.tsx وdocs/DECISIONS.md.
export const ExpensesPanel = ({
  isInitialLoading, isAdmin, canAddExpenses,
  activeExpenses, filteredExpenses,
  searchQuery, setSearchQuery, sortOrder, setSortOrder,
  onOpenReports, onOpenTrashBin, onExport, onOpenExpenseForm,
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
        {isAdmin && (
          <button
            onClick={onOpenTrashBin}
            className="flex items-center gap-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            سلة المهملات
          </button>
        )}
        <button
          onClick={onExport} disabled={!activeExpenses.length}
          className="flex items-center gap-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> تصدير Excel
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
  </section>
  )
}
