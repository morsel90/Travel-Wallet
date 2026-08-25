import type { Meta, StoryObj } from '@storybook/react-vite'
import Header from '../components/Header'
import TripSheetModal from '../components/modals/TripSheetModal'

// 🆕 ورقة الرحلة ومدخلها في الهيدر — القصة هي مكان فحصهما الوحيد بلا تسجيل
// دخول: التطبيق كاملاً خلف AuthGate، فلا لقطة للهيدر الحقيقي بلا حساب.
const noop = () => {}

const meta = {
  title: 'الرحلة/ورقة الرحلة',
  component: TripSheetModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'ورقة الرحلة — تُفتح بالضغط على اسم الرحلة في الهيدر، وتجمع أفعال ' +
          '*مستوى الرحلة* في نقطة واحدة بدل تفرّقها بين قائمة الحساب وشريط سجل المصاريف.',
      },
    },
  },
} satisfies Meta<typeof TripSheetModal>

export default meta
type Story = StoryObj<typeof meta>

export const عضو: Story = {
  args: {
    tripId: 'travelapp-87206',
    tripName: 'رحلة بولندا 2026',
    status: 'active',
    canManageTrip: false,
    onOpenReports: noop,
    onOpenTripAdmin: noop,
    onShowMyTrips: undefined,
    onClose: noop,
  },
}

/** منظّم الرحلة أو المسؤول — يرى «إدارة الرحلة» أيضاً. */
export const منظّم_بعدة_رحلات: Story = {
  args: {
    ...عضو.args,
    canManageTrip: true,
    onShowMyTrips: noop,
  },
}

/** رحلة طويلة المدى — يظهر الشهر المحاسبي المفتوح. */
export const رحلة_طويلة_المدى: Story = {
  args: {
    ...منظّم_بعدة_رحلات.args,
    tripName: 'انتداب مدرستي',
    tripId: 'Mdrsah',
    period: '2026-08',
  },
}

/** رحلة منتهية — الحالة تُقرأ من الشارة بلا تخمين من غياب الأزرار. */
export const رحلة_منتهية: Story = {
  args: {
    ...منظّم_بعدة_رحلات.args,
    status: 'completed',
  },
}

/** رحلة بلا اسم محفوظ — يسقط العرض لمعرّف الرحلة، لا لاسم مخترع. */
export const بلا_اسم_محفوظ: Story = {
  args: {
    ...عضو.args,
    tripName: 'travelapp-87206',
  },
}

// ─── مدخل الورقة في الهيدر ───────────────────────────────────────────────────
// مساحة 200vh أسفل الهيدر متعمّدة: useHeaderCollapse يتتبّع تمرير النافذة،
// فبدونها لا سبيل لرؤية الوضع المتقلّص (الشيفرون وحده) في القصة.
export const مدخل_الورقة_في_الهيدر: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div dir="rtl" className="bg-slate-50">
      <Header
        isSyncing={false}
        isAdmin={false}
        isOrganizer
        tripName="رحلة بولندا 2026"
        onOpenTripSheet={noop}
        stats={{ totalDeposited: 12000, totalSpent: 7430.5, totalRemaining: 4569.5 }}
        displayName="أحمد الغامدي"
        email="ahmad@example.com"
        onShowProfile={noop}
        onOpenAdminPanel={noop}
        onAdminSignIn={noop}
        onSignOut={noop}
      />
      <div className="h-[200vh] p-6 text-slate-400 text-sm font-bold">
        مرّر لأسفل لرؤية الهيدر المتقلّص — يبقى مدخل ورقة الرحلة (الشيفرون) ظاهراً.
      </div>
    </div>
  ),
}
