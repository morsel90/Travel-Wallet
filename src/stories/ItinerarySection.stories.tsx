import type { Meta, StoryObj } from '@storybook/react-vite'
import { ItinerarySection } from '../components/ItinerarySection'
import { NextSegmentWidget } from '../components/NextSegmentWidget'
import * as fx from '../fixtures'

const meta = {
  title: 'المسار/قائمة المسار',
  component: ItinerarySection,
} satisfies Meta<typeof ItinerarySection>

export default meta
type Story = StoryObj<typeof meta>

export const مسار_كامل: Story = {
  args: { itinerary: fx.itinerary },
}

/** مقطع واحد بلا رقم حجز — تختفي شارة PNR بدل أن تُعرض فارغة. */
export const بلا_رقم_حجز: Story = {
  args: { itinerary: [fx.itinerary[2]] },
}

/** قائمة فارغة: المكوّن يُرجع null ولا يعرض إطاراً فارغاً. */
export const فارغ: Story = {
  args: { itinerary: fx.noItinerary },
}

/**
 * ويدجت المقطع القادم — يعرض أول مقطع لم يحن وقته بعد.
 *
 * ⚠️ تواريخ العيّنة في يوليو/أغسطس 2026. إن كان تاريخ جهازك بعدها فلن يظهر
 * شيء، لأن المكوّن يخفي نفسه حين تكون كل المقاطع في الماضي — وهو سلوك مقصود.
 * لذلك تستخدم هذه القصة مقطعاً بتاريخ بعيد مضمون البقاء في المستقبل.
 */
export const المقطع_القادم: Story = {
  args: { itinerary: fx.itinerary },
  render: () => (
    <NextSegmentWidget
      itinerary={[
        {
          ...fx.itinerary[0],
          departure: { ...fx.itinerary[0].departure, time: '2099-01-01T10:00:00' },
          arrival: { ...fx.itinerary[0].arrival, time: '2099-01-01T12:30:00' },
        },
      ]}
    />
  ),
}

/** كل المقاطع في الماضي: الويدجت يختفي تماماً (لا إطار فارغ ولا رسالة). */
export const المقطع_القادم_منتهٍ: Story = {
  args: { itinerary: fx.itinerary },
  render: () => (
    <div className="text-xs text-slate-400">
      (الويدجت مخفي عمداً — كل المقاطع في الماضي)
      <NextSegmentWidget itinerary={fx.itinerary} />
    </div>
  ),
}
