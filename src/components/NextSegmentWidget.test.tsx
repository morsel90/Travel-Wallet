// اختبار سطحَي «المقطع القادم»: البطاقة داخل صفحة المسار، والشريط الرفيع في
// الشاشة الرئيسية.
//
// ⚠️ ما يُثبت هنا هو **الفرق بينهما**، لا أن كلاً منهما يعرض شيئاً: الشريط
// وُجد لغرض واحد — الوجهة وكم تبقّى بنظرة واحدة أثناء تسجيل مصروف — وأي
// تفصيل يتسرّب إليه (وقت الانطلاق، رقم الحجز، مقطع ثانٍ) يعيده إلى منافسة
// المصاريف، وهو بالضبط ما طُلب تجنّبه. لذلك الغيابات أدناه ليست تفاصيل شكل
// بل هي العقد نفسه.
//
// المقاطع نسبية للحظة التشغيل لا تواريخ ثابتة: مقطع ماضٍ يجعل المكوّنين
// يخفيان نفسيهما (سلوك مقصود) فيمرّ الاختبار وهو لا يختبر شيئاً.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextSegmentWidget, NextSegmentStrip } from './NextSegmentWidget'
import * as fx from '../fixtures'
import type { ItinerarySegment } from '../types'

// نفس صيغة التخزين: تاريخ محلي بلا منطقة زمنية — انظر toStoredTime في utils/itinerary.ts
const inMinutes = (minutes: number): string => {
  const d = new Date(Date.now() + minutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

const segmentAt = (minutes: number, over: Partial<ItinerarySegment> = {}): ItinerarySegment => ({
  ...fx.itinerary[0],
  departure: { ...fx.itinerary[0].departure, time: inMinutes(minutes) },
  arrival: { ...fx.itinerary[0].arrival, time: inMinutes(minutes + 65) },
  ...over,
})

const inThreeDays = () => segmentAt(3 * 24 * 60)

describe('NextSegmentStrip — شريط الشاشة الرئيسية', () => {
  it('يعرض الوجهة والعدّ التنازلي فقط، ولا يعرض أي تفصيل من صفحة المسار', () => {
    const segment = inThreeDays()
    render(<NextSegmentStrip itinerary={[segment]} onOpen={() => {}} />)

    expect(screen.getByText(segment.arrival.location)).toBeInTheDocument()
    expect(screen.getByText('بعد 3 أيام')).toBeInTheDocument()

    // العقد: لا رقم حجز ولا رقم رحلة ولا موضع انطلاق — كلها في صفحة المسار.
    expect(screen.queryByText(/8L2HTY/)).not.toBeInTheDocument()
    expect(screen.queryByText(/QR 1155/)).not.toBeInTheDocument()
    expect(screen.queryByText(segment.departure.location)).not.toBeInTheDocument()
  })

  it('الضغط عليه يفتح صفحة المسار', async () => {
    const onOpen = vi.fn()
    render(<NextSegmentStrip itinerary={[inThreeDays()]} onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('لا يعرض إلا المقطع القادم مهما بلغ عدد المقاطع', () => {
    const first = segmentAt(2 * 24 * 60)
    const later = segmentAt(9 * 24 * 60, {
      id: 'seg-later',
      arrival: { location: 'كراكوف', time: inMinutes(9 * 24 * 60 + 65) },
    })
    render(<NextSegmentStrip itinerary={[first, later]} onOpen={() => {}} />)

    expect(screen.getByText(first.arrival.location)).toBeInTheDocument()
    expect(screen.queryByText('كراكوف')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  // الغياب التام لا شريط فارغ: الشاشة الرئيسية عادت إلى أقسامها الثلاثة كما لو
  // لم يكن للرحلة مسار — لا سطر يشغل مكاناً ليقول «لا شيء».
  it('يختفي كلياً بلا مسار، وبمسار كل مقاطعه في الماضي', () => {
    const { container, rerender } = render(<NextSegmentStrip onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<NextSegmentStrip itinerary={[]} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<NextSegmentStrip itinerary={[segmentAt(-60)]} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NextSegmentWidget — بطاقة صفحة المسار', () => {
  it('تعرض الوجهة والعدّ التنازلي ووقت الانطلاق', () => {
    const segment = inThreeDays()
    render(<NextSegmentWidget itinerary={[segment]} />)

    expect(screen.getByText('الوجهة القادمة')).toBeInTheDocument()
    expect(screen.getByText(`إلى ${segment.arrival.location}`)).toBeInTheDocument()
    // أرقام هندية-عربية هنا وحدها لتطابق الوقت المنسَّق بـ'ar-SA' في البطاقة نفسها.
    expect(screen.getByText('بعد ٣ أيام')).toBeInTheDocument()
  })

  it('تختفي حين تكون كل المقاطع في الماضي', () => {
    const { container } = render(<NextSegmentWidget itinerary={[segmentAt(-60)]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
