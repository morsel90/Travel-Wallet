import type { Meta, StoryObj } from '@storybook/react-vite'
import { TravelerCard } from '../components/TravelerSection'
import { withContext, withAdminContext, Providers } from './decorators'
import * as fx from '../fixtures'

const meta = {
  title: 'المسافرون/بطاقة المسافر',
  component: TravelerCard,
  decorators: [withContext],
  parameters: {
    docs: {
      description: {
        component:
          'بطاقة رصيد مسافر واحد. الحالات أدناه هي ما يصعب بلوغه في التطبيق الحيّ — ' +
          'كل واحدة تتطلب تجهيز بيانات فعلية في Firestore لإعادة إنتاجها.',
      },
    },
  },
} satisfies Meta<typeof TravelerCard>

export default meta
type Story = StoryObj<typeof meta>

export const رصيد_موجب: Story = {
  args: { traveler: fx.balancePositive },
}

/**
 * رصيد سالب: يقلب المبلغ للأحمر ويملأ الشريط بالكامل. أهم حالة بصرية في
 * البطاقة، وتعني أن المسافر أنفق أكثر مما أودع.
 */
export const رصيد_سالب: Story = {
  args: { traveler: fx.balanceNegative },
}

/**
 * اسم طويل: يختبر قصّ النص (truncate). الأسماء العربية الكاملة تتجاوز عرض
 * البطاقة على الجوال بسهولة.
 */
export const اسم_طويل: Story = {
  args: { traveler: fx.balanceLongName },
}

/**
 * أثناء المزامنة: شارة دوّارة أعلى البطاقة مصدرها metadata.hasPendingWrites.
 * حالة تدوم أجزاء من الثانية في الاستخدام العادي، فلا تكاد تُرى لمراجعتها.
 */
export const قيد_المزامنة: Story = {
  args: { traveler: fx.balancePending },
}

/**
 * وضع المسؤول: تظهر أزرار تعديل الرصيد وسجل التعديلات والحذف.
 * ⚠️ هذه البطاقة لمسافر **مربوط بمصاريف**، فيُستبدل زر الحذف بشارة
 * «مربوط بمصاريف» — حماية من فقد سجل حساباته.
 */
export const مسؤول_مربوط_بمصاريف: Story = {
  args: { traveler: fx.balancePositive },
  decorators: [withAdminContext],
}

/**
 * مسؤول + مسافر بلا أي مصاريف: زر الحذف ظاهر لأن الحذف هنا لا يفقد شيئاً.
 * الفرق عن القصة السابقة هو `expenses: []` في السياق لا في البطاقة نفسها.
 */
export const مسؤول_قابل_للحذف: Story = {
  args: { traveler: fx.balancePositive },
  decorators: [
    Story => (
      <Providers data={{ isAdmin: true, expenses: fx.noExpenses }}>
        <Story />
      </Providers>
    ),
  ],
}

/**
 * شبكة كاملة كما تظهر في الصفحة الرئيسية — لمراجعة الاتساق بين البطاقات
 * (ارتفاعات متساوية، محاذاة الأرقام، سلوك الأسماء الطويلة بجانب القصيرة).
 */
export const شبكة_البطاقات: Story = {
  args: { traveler: fx.balancePositive },
  render: () => (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {fx.balances.map(b => (
        <TravelerCard key={b.id} traveler={b} />
      ))}
    </div>
  ),
}
