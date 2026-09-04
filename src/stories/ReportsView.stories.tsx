import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Expense, Traveler } from '../types'
import ReportsView from '../components/reports/ReportsView'
import { calculateBalances, calculateSettlements, calculateCategoryTotals } from '../utils/calculations'
import * as fx from '../fixtures'

const meta = {
  title: 'التقارير/تقرير الرحلة',
  component: ReportsView,
  parameters: {
    docs: {
      description: {
        component:
          'تقرير الرحلة الكامل — بلا سياق (كل بياناته props مباشرة). قصة "رحلة طويلة — ' +
          'دورة حالية بإيداع" هي ما يصعب بلوغه في التطبيق الحيّ (تتطلب رحلة طويلة لم يُغلق شهرها الأول بعد).',
      },
    },
  },
} satisfies Meta<typeof ReportsView>

export default meta
type Story = StoryObj<typeof meta>

export const رحلة_قياسية: Story = {
  args: {
    travelers: fx.travelers,
    expenses: fx.expenses,
    balances: fx.balances,
    settlements: fx.settlements,
    categoryTotals: fx.categoryTotals,
    itinerary: fx.itinerary,
    onClose: () => {},
  },
}

// ⚠️ إعادة إنتاج مباشرة للخطأ المُبلَّغ عنه: أحمد أضاف 500 لرصيده *خلال* دورة
// يوليو الحالية (deposited رُفع مباشرة إلى 3500، تماماً كما يفعل DepositModal
// فعلياً — لا مصروف يعكس ذلك في filterCycleExpenses). قبل الإصلاح كانت
// buildPeriodTravelerSummaries تعرض "المودَع" هذه الدورة كـ0 (أو تحذّر
// "لا معلومة") رغم أن رصيده الحقيقي معروف تماماً. افتح مُصفّي الدورة أعلى
// الشاشة واختر "دورة يوليو 2026": "المودَع" في ملخص الرحلة يجب أن يطابق
// 3500 + 1000 = 4500 (مجموع deposited الحقيقي)، لا رقماً أقل بقيمة الإيداع.
// تبويب "ملخص الفترة" (بدل "الملخص اليومي") ظاهر أيضاً لأن periods موجودة.
const ahmedLongTerm: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 3500, deletedAt: null }
const saadLongTerm:  Traveler = { id: 2, name: 'سعد المطيري', shortName: 'سعد',  deposited: 1000, deletedAt: null }
const longTermTravelers: Traveler[] = [ahmedLongTerm, saadLongTerm]

const T0 = new Date('2026-07-05T09:00:00').getTime()
const day = 86_400_000
const longTermExpenses: Expense[] = [
  { id: 'lt-1', date: '2026-07-05', description: 'فندق',  amount: 800, originalAmount: 800, currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: T0,         category: 'إقامة',  deletedAt: null },
  { id: 'lt-2', date: '2026-07-12', description: 'مطعم',  amount: 300, originalAmount: 300, currency: 'SAR', exchangeRate: 1, participants: [1, 2], createdAt: T0 + day,   category: 'مطاعم',  deletedAt: null },
]
const longTermBalances = calculateBalances(longTermTravelers, longTermExpenses)

export const رحلة_طويلة_دورة_حالية_بإيداع: Story = {
  args: {
    travelers: longTermTravelers,
    expenses: longTermExpenses,
    balances: longTermBalances,
    settlements: calculateSettlements(longTermBalances),
    categoryTotals: calculateCategoryTotals(longTermExpenses),
    periods: ['2026-07'],
    lastClosedPeriod: null,
    onClose: () => {},
  },
}
