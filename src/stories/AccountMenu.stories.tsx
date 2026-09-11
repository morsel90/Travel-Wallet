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

// 🆕 قصّة واحدة لا أربع: القائمة صارت بندين لا تتغيّران بصلاحية أحد —
// من أنت، والخروج. القصص الأربع القديمة كانت تصف بنوداً مشروطة لم تعد
// موجودة (رحلاتي صارت زرّاً في الهيدر، و«الدخول بحساب آخر» حُذف).
export const قائمة_الحساب: Story = {
  args: {
    displayName: 'أحمد الغامدي',
    email: 'ahmad@example.com',
    onShowProfile: noop,
    onSignOut: noop,
  },
}

/** بلا اسم عرض — يسقط للبريد، والحرف الأول من البريد في الدائرة. */
export const بلا_اسم_عرض: Story = {
  args: {
    ...قائمة_الحساب.args,
    displayName: null,
  },
}
