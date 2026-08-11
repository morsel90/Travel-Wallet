import { lazy, Suspense } from 'react'
import type { Settlement, CategoryTotal, SpendingTrendPoint } from '../types'
import { ChartsSectionSkeleton } from './Skeleton'
import EmptyState from './EmptyState'
import { BarChart3 } from '../icons'

// ⚠️ دالة الاستيراد مُسمّاة ومُصدَّرة لتُعاد في التحميل المسبق بنفس المُعرّف
// حرفياً — نفس نمط modalImporters في ModalManager.tsx وauthImporters في
// AuthFlow.tsx. انظر utils/preload.ts: المطابقة على هوية الدالة لا على المسار.
const importChartsSection = () => import('./charts/ChartsSection')
const ChartsSection = lazy(importChartsSection)

// نفس المقايضة الموثّقة في ModalManager.tsx: نقل القائمة لملف منفصل يُرضي
// Fast Refresh لكنه يفصلها عن `lazy()` أعلاه، فتنحرف بصمت عند إعادة تسمية
// ويتوقف التحميل المسبق دون أن يفشل شيء ظاهرياً.
// eslint-disable-next-line react-refresh/only-export-components
export const chartsImporters = [importChartsSection]

interface ChartsPanelProps {
  isInitialLoading: boolean
  hasExpenses: boolean
  hasTravelers: boolean
  settlements: Settlement[]
  categoryTotals: CategoryTotal[]
  spendingTrend: SpendingTrendPoint[]
}

// ─── قسم الإحصائيات ───────────────────────────────────────────────────────────
// ⚠️ ChartsSection لا تُطلب إلا عند وجود مصروف واحد على الأقل — ولهذا كان تسجيل
// أول مصروف في رحلة أثناء انقطاع الاتصال يُسقط التطبيق كاملاً إلى ErrorBoundary:
// الجزء المؤجّل يُستورد لأول مرة بلا شبكة فيفشل أثناء العرض. الحل ليس هنا بل في
// التحميل المسبق (utils/preload.ts) — لا تُزل chartsImporters من قائمة التحميل.
export const ChartsPanel = ({
  isInitialLoading, hasExpenses, hasTravelers,
  settlements, categoryTotals, spendingTrend,
}: ChartsPanelProps) => (
  <div id="charts-section" className="scroll-mt-24">
    {!isInitialLoading && hasExpenses && (
      <Suspense fallback={<ChartsSectionSkeleton />}>
        <ChartsSection
          settlements={settlements}
          categoryTotals={categoryTotals}
          spendingTrend={spendingTrend}
        />
      </Suspense>
    )}

    {!isInitialLoading && hasTravelers && !hasExpenses && (
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <EmptyState
          Icon={BarChart3}
          title="لا توجد إحصائيات بعد"
          description="سجّل أول مصروف للرحلة لعرض ملخص التسويات وتوزيع المصاريف حسب الفئة وتطوّرها الزمني."
        />
      </section>
    )}
  </div>
)
