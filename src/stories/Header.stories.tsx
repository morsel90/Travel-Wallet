import type { Meta, StoryObj } from '@storybook/react-vite'
import Header from '../components/Header'

const meta = {
  title: 'الهيدر/الهيدر',
  component: Header,
  parameters: {
    docs: {
      description: {
        component:
          'سطر موجز واحد تحت اسم الرحلة ("المتبقي" فقط) بدل ثلاث حبّات ملوّنة وشارة/زرّ تبديل دورة — ' +
          'طلب صاحب الحساب إزالتهما صراحةً لأنهما زادا الزحمة.',
      },
    },
  },
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

const noop = () => {}

export const رحلة_قياسية: Story = {
  args: {
    isSyncing: false,
    tripName: 'رحلة بولندا 2026',
    stats: { totalDeposited: 1000, totalSpent: 400, totalRemaining: 600 },
    displayName: 'أحمد الغامدي',
    email: 'ahmad@example.com',
    onShowProfile: noop,
    onSignOut: noop,
    onStatClick: noop,
    more: { onOpenReports: noop, onOpenCharts: noop, onOpenItinerary: noop },
  },
}

/**
 * 🆕 عضو في أكثر من رحلة — زرّ «رحلاتي» (الحقيبة) بجانب الأفاتار يُرجعه
 * للقائمة بنقرة واحدة. كان بنداً داخل قائمة الحساب، أي أن المسار الرئيسي كان
 * يمرّ بـ«حسابي». لا يظهر إطلاقاً لمن له رحلة واحدة (القصص الأخرى) — لا شيء
 * يُرجَع إليه. انظر docs/DECISIONS.md.
 */
export const عضو_بعدة_رحلات: Story = {
  args: {
    ...رحلة_قياسية.args,
    onShowMyTrips: noop,
  },
}

/**
 * 🆕 **اسم طويل — وهذه هي الحالة التي كسرت السهم.** `line-clamp-2` تقصّ محتوى
 * الصندوق كله عند سطرين، فكانت تبتلع السهم يوم كان inline داخل العنوان — أي
 * أن اسماً طويلاً كان يُخفي الدليل الوحيد على أن العنوان قائمة، فتصير
 * «المزيد» كلها غير قابلة للاكتشاف. السهم الآن شقيقٌ للعنوان بمساحة محجوزة
 * (`pe-7`) تمنعه من ملامسة قائمة الحساب. جرّبها على 360 و375 بكسل.
 */
export const اسم_طويل: Story = {
  args: {
    ...رحلة_قياسية.args,
    tripName: 'رحلة الكادر التعليمي لمدارس الرياض الأهلية 2026',
    onShowMyTrips: noop,
  },
}

/** 🆕 رحلة طويلة المدى: السطر الموجز يقول «المتبقي هذا الشهر» — بلا اسم شهر
 *  ولا كلمة «دورة» ولا زرّ تبديل. الفرق عن الرحلة القياسية كلمتان لا مفهوم. */
export const رحلة_طويلة_المدى: Story = {
  args: {
    ...رحلة_قياسية.args,
    tripName: 'انتداب الرياض',
    cycleStats: { totalDeposited: 300, totalSpent: 50, totalRemaining: 700 },
  },
}

export const قيد_التحميل: Story = {
  args: {
    ...رحلة_قياسية.args,
    stats: null,
  },
}
