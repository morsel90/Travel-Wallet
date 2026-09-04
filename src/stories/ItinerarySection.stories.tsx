import type { Meta, StoryObj } from '@storybook/react-vite'
import { ItinerarySection } from '../components/ItinerarySection'
import { NextSegmentWidget } from '../components/NextSegmentWidget'
import * as fx from '../fixtures'
import type { ItinerarySegment } from '../types'

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
 * 🆕 صيغة الوقت المخزَّنة تاريخ محلي بلا منطقة زمنية ("YYYY-MM-DDTHH:mm:ss") —
 * انظر toStoredTime في utils/itinerary.ts. تُبنى هنا من إزاحة بالدقائق عن الآن
 * بدل تاريخ ثابت، حتى تبقى القصص صالحة مهما تقادم المستودع.
 */
const inMinutes = (minutes: number): string => {
  const d = new Date(Date.now() + minutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/**
 * إزاحة تُبقي الانطلاق داخل اليوم التقويمي نفسه — لعرض حالة "الساعات". ثلاث
 * ساعات ما لم يتبقَّ من اليوم أقل من ذلك (عند تشغيل القصة ليلاً)، وإلا فما
 * تبقّى منه ناقص دقيقتين. قرب منتصف الليل تماماً تسقط الحالة طبيعياً إلى
 * الدقائق، وهذا صحيح لا خلل.
 */
const sameDayOffset = (): number => {
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 0, 0)
  return Math.min(180, Math.floor((endOfDay.getTime() - Date.now()) / 60_000) - 2)
}

const segmentAt = (minutes: number): ItinerarySegment => ({
  ...fx.itinerary[0],
  departure: { ...fx.itinerary[0].departure, time: inMinutes(minutes) },
  arrival: { ...fx.itinerary[0].arrival, time: inMinutes(minutes + 65) },
})

/**
 * ويدجت المقطع القادم — يعرض أول مقطع لم يحن وقته بعد، مع عدّ تنازلي يتدرّج:
 * أيام ← ساعات حين يحلّ اليوم التقويمي نفسه ← دقائق في الساعة الأخيرة.
 *
 * ⚠️ المقاطع هنا نسبية للحظة العرض، لا تواريخ ثابتة: مقطع بتاريخ ثابت في
 * الماضي يجعل الويدجت يخفي نفسه (سلوك مقصود) فتظهر القصة فارغة بلا سبب واضح.
 */
export const المقطع_القادم: Story = {
  args: { itinerary: fx.itinerary },
  render: () => (
    <div className="space-y-3">
      <NextSegmentWidget itinerary={[segmentAt(5 * 24 * 60)]} />
      <NextSegmentWidget itinerary={[segmentAt(24 * 60)]} />
      <NextSegmentWidget itinerary={[segmentAt(sameDayOffset())]} />
      <NextSegmentWidget itinerary={[segmentAt(25)]} />
    </div>
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
