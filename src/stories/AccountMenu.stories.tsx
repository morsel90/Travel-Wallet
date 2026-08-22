import type { Meta, StoryObj } from '@storybook/react-vite'
import AccountMenu from '../components/AccountMenu'

const meta = {
  title: 'الهيدر/قائمة الحساب',
  component: AccountMenu,
  parameters: {
    docs: {
      description: {
        component:
          'قائمة الحساب الموحّدة في الهيدر — تجمع رحلاتي/بروفايلي/وضع المسؤول/تسجيل ' +
          'الخروج في نقطة دخول واحدة. اضغط الزرّ الدائري لفتحها.',
      },
    },
  },
  decorators: [
    Story => (
      <div className="bg-teal-700 p-4 flex justify-end" dir="rtl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountMenu>

export default meta
type Story = StoryObj<typeof meta>

const noop = () => {}

export const عضو_برحلة_واحدة: Story = {
  args: {
    displayName: 'أحمد الغامدي',
    email: 'ahmad@example.com',
    isAdmin: false,
    isOrganizer: false,
    onShowMyTrips: undefined,
    onShowProfile: noop,
    onOpenAdminPanel: noop,
    onAdminSignIn: noop,
    onSignOut: noop,
  },
}

export const عضو_بعدة_رحلات: Story = {
  args: {
    ...عضو_برحلة_واحدة.args,
    onShowMyTrips: noop,
  },
}

export const مسؤول: Story = {
  args: {
    ...عضو_بعدة_رحلات.args,
    isAdmin: true,
  },
}

/** منظّم رحلة غير مسؤول عالمي — يرى «إدارة الرحلة» بدل «تسجيل الدخول كمسؤول». */
export const منظّم_رحلة: Story = {
  args: {
    ...عضو_برحلة_واحدة.args,
    isOrganizer: true,
  },
}

/** بلا اسم عرض — يسقط للبريد، والحرف الأول من البريد في الدائرة. */
export const بلا_اسم_عرض: Story = {
  args: {
    ...عضو_برحلة_واحدة.args,
    displayName: null,
  },
}
