import type { Meta, StoryObj } from '@storybook/react-vite'
import ChartsSection from '../components/charts/ChartsSection'
import { withContext } from './decorators'
import * as fx from '../fixtures'

const meta = {
  title: 'الإحصائيات/ملخص الرحلة',
  component: ChartsSection,
  decorators: [withContext],
  parameters: {
    docs: {
      description: {
        component:
          'ثلاثة تبويبات مرسومة بـ HTML/CSS فقط بلا مكتبة رسوم. الأرقام هنا مشتقّة ' +
          'من نفس المصاريف في src/fixtures، فما تراه متسق مع بعضه.',
      },
    },
  },
} satisfies Meta<typeof ChartsSection>

export default meta
type Story = StoryObj<typeof meta>

export const افتراضي: Story = {
  args: {
    settlements: fx.settlements,
    categoryTotals: fx.categoryTotals,
    spendingTrend: fx.spendingTrend,
  },
}

/**
 * أرصدة متساوية: لا تسويات مطلوبة. تظهر رسالة بدل جدول فارغ — حالة نهاية
 * الرحلة بعد أن يسدّد الجميع.
 */
export const بلا_تسويات: Story = {
  args: {
    settlements: fx.noSettlements,
    categoryTotals: fx.categoryTotals,
    spendingTrend: fx.spendingTrend,
  },
}

/**
 * فئة واحدة تبتلع أغلب الميزانية: يختبر تناسب أشرطة الفئات حين تكون النسب
 * متطرفة (شريط شبه ممتلئ بجانب أشرطة تكاد لا تُرى).
 */
export const فئة_مهيمنة: Story = {
  args: {
    settlements: fx.settlements,
    categoryTotals: [
      { category: 'سكن', total: 9500 },
      { category: 'مطاعم', total: 300 },
      { category: 'مواصلات', total: 120 },
    ],
    spendingTrend: fx.spendingTrend,
  },
}

/**
 * يوم واحد فقط: أضيق حالة لمخطط التطور الزمني — نقطة واحدة بلا خط.
 */
export const يوم_واحد: Story = {
  args: {
    settlements: fx.noSettlements,
    categoryTotals: [{ category: 'مطاعم', total: 480 }],
    spendingTrend: [{ date: '2026-07-21', total: 480, cumulative: 480 }],
  },
}
