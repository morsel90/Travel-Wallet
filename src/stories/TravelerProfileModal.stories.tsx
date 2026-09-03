import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Expense } from '../types'
import TravelerProfileModal from '../components/modals/TravelerProfileModal'
import { calculateBalances } from '../utils/calculations'
import * as fx from '../fixtures'

const meta = {
  title: 'المسافرون/كشف حساب المسافر',
  component: TravelerProfileModal,
  parameters: {
    docs: {
      description: {
        component:
          'كشف حساب المسافر كاملاً — بلا سياق (كل بياناته props مباشرة، بخلاف TravelerCard). ' +
          'قصة "كشف الحساب — خط زمني" هي ما يصعب بلوغه في التطبيق الحيّ (تتطلب رحلة طويلة مُغلَقة فعلاً).',
      },
    },
  },
} satisfies Meta<typeof TravelerProfileModal>

export default meta
type Story = StoryObj<typeof meta>

export const الخلاصة_والتسويات: Story = {
  args: {
    traveler: fx.travelerMine,
    balance: fx.balanceMine,
    expenses: fx.expensesWithMine,
    settlements: fx.settlements,
    allTravelers: fx.travelersWithMine,
    isAdmin: false,
    isOrganizer: false,
    isSelf: false,
    onClose: () => {},
  },
}

/**
 * 🆕 كشف الحساب — خط زمني بنقاط متتالية بدل قائمة صفوف مسطّحة. مصروف ترحيل
 * شهري واحد (نقطة نيلية مميّزة) أُضيف محلياً هنا فقط — لا يمسّ fixtures
 * المشتركة (قصص أخرى تستهلك expensesWithMine بعددها الحالي) — ليظهر التمايز
 * البصري الثلاثي معاً في نظرة واحدة: صرف حقيقي (وردي) / دفعه من جيبه (تيل) /
 * ترحيل شهري (نيلي).
 */
const rolloverExpense: Expense = {
  id: 'exp-mine-rollover',
  date: '2026-07-31',
  description: 'ترحيل رصيد — إغلاق يوليو 2026',
  amount: 120,
  originalAmount: 120,
  currency: 'SAR',
  exchangeRate: 1,
  participants: [fx.travelerMine.id],
  createdAt: fx.expenseMinePaidByPocket.createdAt + 86_400_000,
  category: 'تسوية شهرية',
  deletedAt: null,
}

const expensesWithRollover = [...fx.expensesWithMine, rolloverExpense]
const balancesWithRollover = calculateBalances(fx.travelersWithMine, expensesWithRollover)
const balanceMineWithRollover = balancesWithRollover.find(b => b.id === fx.travelerMine.id) ?? balancesWithRollover[0]

export const كشف_الحساب_خط_زمني: Story = {
  args: {
    traveler: fx.travelerMine,
    balance: balanceMineWithRollover,
    expenses: expensesWithRollover,
    settlements: fx.settlements,
    allTravelers: fx.travelersWithMine,
    isAdmin: false,
    isOrganizer: false,
    isSelf: false,
    initialTab: 'statement',
    onClose: () => {},
  },
}
