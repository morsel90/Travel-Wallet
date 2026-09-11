import type { Meta, StoryObj } from '@storybook/react-vite'
import TripPicker from '../components/TripPicker'

const meta = {
  title: 'رحلاتي/قائمة الرحلات',
  component: TripPicker,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'شاشة «رحلاتي» — قائمة تنقّل لا لوحة معلومات. البطاقة تحمل أربعة أشياء ' +
          'فقط: الاسم، عدد المسافرين، إجمالي المصروف، والحالة (حين تكون غير نشطة). ' +
          'الرقمان يأتيان من useTripStats وقد لا يصلان (بلا اتصال) — راجع قصة ' +
          '«بلا_إحصاءات» لشكل البطاقة حينها.',
      },
    },
  },
  decorators: [Story => <div dir="rtl"><Story /></div>],
} satisfies Meta<typeof TripPicker>

export default meta
type Story = StoryObj<typeof meta>

const noop = () => {}
const asyncNoop = async () => true

const trips = [
  { id: 'mdrsah', name: 'مصاريف الكادر', status: 'active' as const },
  { id: 'bosnia-2026', name: 'البوسنة ٢٠٢٦', status: 'active' as const },
  { id: 'japan-trip', name: 'اليابان', status: 'completed' as const },
]

const base = {
  trips,
  archivedTrips: [{ id: 'dubai-2024', name: 'دبي ٢٠٢٤', status: 'archived' as const }],
  stats: {
    mdrsah: { travelerCount: 14, totalSpent: 128400 },
    'bosnia-2026': { travelerCount: 6, totalSpent: 24830 },
    'japan-trip': { travelerCount: 1, totalSpent: 0 },
    'dubai-2024': { travelerCount: 4, totalSpent: 9120 },
  },
  loading: false,
  error: null,
  currentTripId: 'bosnia-2026',
  onCreateTrip: asyncNoop,
  isCreatingTrip: false,
  onShowProfile: noop,
  isAdmin: false,
  isSaving: false,
  onRestoreTrip: asyncNoop,
}

export const عضو: Story = { args: base }

/** المعرّف يظهر تحت الاسم — المسؤول يتصفّح رحلات لا يعرفها بالاسم وحده. */
export const مسؤول: Story = { args: { ...base, isAdmin: true } }

/** التجميع خادمي بحتاً، فيفشل بلا اتصال — البطاقة تبقى صالحة بالاسم والحالة. */
export const بلا_إحصاءات: Story = { args: { ...base, stats: {} } }

export const لا_رحلات: Story = {
  args: { ...base, trips: [], archivedTrips: [], stats: {}, currentTripId: undefined },
}
