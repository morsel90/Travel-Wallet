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
    isAdmin: false,
    isOrganizer: false,
    tripName: 'رحلة بولندا 2026',
    canEditTrip: true,
    onEditTrip: noop,
    stats: { totalDeposited: 1000, totalSpent: 400, totalRemaining: 600 },
    displayName: 'أحمد الغامدي',
    email: 'ahmad@example.com',
    onShowProfile: noop,
    onAdminSignIn: noop,
    onSignOut: noop,
    onStatClick: noop,
  },
}

/** 🆕 رحلة طويلة المدى: السطر الموجز يحمل اسم الدورة المفتوحة قبل «المتبقي» — دورة حالية فقط، بلا زرّ تبديل. */
export const رحلة_طويلة_المدى: Story = {
  args: {
    ...رحلة_قياسية.args,
    tripName: 'انتداب الرياض',
    cycleStats: { periodLabel: 'سبتمبر 2026', totalDeposited: 300, totalSpent: 50, totalRemaining: 700 },
  },
}

export const قيد_التحميل: Story = {
  args: {
    ...رحلة_قياسية.args,
    stats: null,
  },
}
