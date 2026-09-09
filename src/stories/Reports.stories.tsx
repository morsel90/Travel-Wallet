// 🆕 قصص «التقارير» — تُعاين الشاشة **ومستند الطباعة** معاً.
//
// ⚠️ سبب وجودها: مستند الطباعة (`#print-root`) مركَّب في DOM دائماً لكنه مخفي
// بـ`@media screen`، فأي عطل فيه لا يظهر في معاينة عادية ولا في لقطة شاشة —
// يُكتشف فقط حين يطبع مسافرٌ تقريراً ناقصاً. القصة تجعله قابلاً للمعاينة:
// افتحها ثم بدّل محاكاة الوسيط إلى `print` (في Chrome: DevTools ← Rendering ←
// Emulate CSS media type)، أو عاينها آلياً بـPlaywright:
//
//   page.emulateMedia({ media: 'print' })
//
// وبنية الـDOM نفسها (حضور جدول المسار في `#print-root` وغيابه عن `<main>`)
// يحرسها `ReportsView.test.tsx` في كل تشغيل.
import type { Meta, StoryObj } from '@storybook/react-vite'
import ReportsView from '../components/reports/ReportsView'
import * as fx from '../fixtures'

const meta = {
  title: 'التقارير/شاشة التقارير',
  component: ReportsView,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReportsView>

export default meta
type Story = StoryObj<typeof meta>

const base = {
  travelers: fx.travelers,
  expenses: fx.expenses,
  balances: fx.balances,
  settlements: fx.settlements,
  categoryTotals: fx.categoryTotals,
  itinerary: fx.itinerary,
  onClose: () => {},
}

/**
 * رحلة قياسية بمسار. **لا قائمة مسار على الشاشة** — مكانها نافذة «مسار الرحلة»
 * خلف «المزيد»؛ أما جدول المسار فموجود في مستند الطباعة المخفي أسفل الصفحة.
 */
export const رحلة_قياسية: Story = { args: base }

/** رحلة بلا مسار: لا يتغيّر شيء على الشاشة، ويسقط قسم المسار من الطباعة. */
export const بلا_مسار: Story = { args: { ...base, itinerary: fx.noItinerary } }

/**
 * رحلة طويلة المدى (`periods`): التبويب الافتراضي «ملخص الفترة الحالية» لا
 * «تفصيل كامل الرحلة». **وجدول المسار في الطباعة تراكمي مستقلّ عن التبويب
 * المفتوح** — يجب أن يبقى كاملاً هنا كما في الرحلة القياسية.
 */
export const رحلة_طويلة: Story = {
  args: { ...base, periods: ['2026-07', '2026-08'] },
}
