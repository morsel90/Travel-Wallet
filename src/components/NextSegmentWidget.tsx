import { useEffect, useState } from 'react'
import { Plane, Car, Train, Bus, ChevronLeft } from '../icons'
import { findNextSegment, formatCountdown } from '../utils/itinerary'
import { haptic } from '../utils/haptics'
import type { ItinerarySegment } from '../types'

/**
 * 🆕 خريطة واحدة لأيقونة وسيلة التنقّل، يشترك فيها سطحا هذا الملف (البطاقة
 * والشريط) بمقاسين مختلفين — لا `switch` مكرَّر في كلٍّ منهما.
 */
const TRANSPORT_ICON: Record<ItinerarySegment['mode'], typeof Plane> = {
  flight: Plane,
  car: Car,
  train: Train,
  bus: Bus,
}

/**
 * 🆕 نبضة تُعيد الرسم كل نصف دقيقة لتحديث العدّ التنازلي. نصف دقيقة لا ثانية:
 * أدقّ ما يعرضه العدّ هو الدقيقة، فنبضة الثانية كانت ستُعيد رسم الشريط 60 مرة
 * لكل تغيّر مرئي واحد — وأغلب الوقت يكون الهدف بعد أيام ولا يتغيّر النص إطلاقاً.
 * (useCountdown في hooks/ يدق كل ثانية عمداً لأنه لمهل قصيرة بالثواني.)
 */
/**
 * 🆕 أرقام هندية-عربية لتطابق التاريخ والوقت المعروضين في نفس البطاقة، وهما
 * ينسّقان بـ'ar-SA' (١٠:٠٨ م). بقية شاشات التطبيق تستخدم
 * 'ar-SA-u-ca-gregory-nu-latn' بأرقام لاتينية — هذه البطاقة وحدها شذّت عن ذلك
 * من قبل هذا التغيير، وتوحيدها خارج نطاقه؛ المهم ألا يختلط الشكلان داخل
 * البطاقة الواحدة.
 */
const toArabicDigits = (text: string): string =>
  text.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

const useMinuteTick = (): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface NextSegmentWidgetProps {
  // 🆕 يُمرَّر من App (المصدر: useTripConfig) بدل استدعاء الـ hook هنا. كان
  // المكوّن يشترك في المستند بنفسه، وبعد تحويل useTripConfig إلى onSnapshot
  // صار ذلك يعني مستمعاً حيّاً ثانياً على نفس المستند بلا داعٍ.
  itinerary?: ItinerarySegment[]
}

export const NextSegmentWidget = ({ itinerary }: NextSegmentWidgetProps) => {
  // ⚠️ قبل أي خروج مبكر — قواعد الخطّافات لا تسمح باستدعاء مشروط.
  const now = useMinuteTick()

  if (!itinerary || itinerary.length === 0) return null

  // findNextSegment مشتركة مع بقية أدوات المسار وتفترض قائمة مرتّبة زمنياً —
  // وهذا ما تضمنه normalizeItinerary في useTripConfig عند القراءة.
  // تُمرَّر `now` نفسها المستخدمة في العدّ التنازلي: مع نبضة الدقيقة يسقط
  // المقطع من الشريط تلقائياً بمجرد أن يمرّ وقت انطلاقه.
  const nextSegment = findNextSegment(itinerary, now)

  // إذا كانت كل الرحلات في الماضي، لا تعرض شيئاً
  if (!nextSegment) return null

  const Icon = TRANSPORT_ICON[nextSegment.mode]

  const depDate = new Date(nextSegment.departure.time)
  const formattedDate = depDate.toLocaleDateString('ar-SA', { weekday: 'long', month: 'short', day: 'numeric' })
  const formattedTime = depDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  const countdown = formatCountdown(nextSegment.departure.time, now)

  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-4 rtl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-white p-2.5 rounded-full shadow-sm">
          {Icon && <Icon className="w-5 h-5 text-teal-600" />}
        </div>
        <div>
          <p className="text-xs text-teal-700 font-bold mb-0.5">الوجهة القادمة</p>
          <p className="text-sm font-semibold text-slate-800">
            إلى {nextSegment.arrival.location}
          </p>
        </div>
      </div>
      {/*
        🆕 العدّ التنازلي يحلّ محل التاريخ هنا، لا يُضاف إليه: "بعد 5 أيام" و
        "الأربعاء، 9 سبتمبر" يقولان الشيء نفسه، والأول هو ما يُقرأ بنظرة واحدة.
        والتاريخ الكامل لكل مقطع معروض أصلاً في «مسار الرحلة» (ItinerarySection).
        يسقط للتاريخ حين يتعذّر العدّ (وقت تالف) كي لا يبقى الصندوق بسطر واحد.
      */}
      <div className="text-left bg-white px-3 py-1.5 rounded-xl shadow-sm border border-teal-50">
        <p className="text-xs font-bold text-teal-700">
          {countdown ? toArabicDigits(countdown) : formattedDate}
        </p>
        <p className="text-sm font-bold text-slate-800" dir="ltr">{formattedTime}</p>
      </div>
    </div>
  )
}

/**
 * 🆕 **الشريط الرفيع في الشاشة الرئيسية** — سطر واحد فوق «المصاريف»:
 * الوجهة القادمة + كم تبقّى، والضغط عليه يفتح «مسار الرحلة».
 *
 * ⚠️ هذا ليس نسخة مصغَّرة من البطاقة أعلاه بل **دورٌ مختلف**: البطاقة تعيش
 * داخل صفحة المسار حيث المستخدم جاء ليقرأ المسار، والشريط يعيش وسط المصاريف
 * حيث المستخدم جاء لشيء آخر تماماً. لذلك لا تفاصيل هنا إطلاقاً — لا وقت
 * انطلاق ولا PNR ولا رقم رحلة ولا مقطع ثانٍ: غرضه الوحيد أن يُقرأ بنظرة
 * واحدة أثناء المرور («✈️ الرياض • بعد 3 أيام»)، وكل ما عدا ذلك خلف نقرة.
 * طلب صاحب الحساب صراحةً ألّا يزاحم المسارُ المصاريفَ — انظر docs/DECISIONS.md.
 *
 * الأرقام لاتينية (مخرَج formatCountdown كما هو) لا هندية-عربية: النص هنا
 * لا يجاور تاريخ ar-SA كما في البطاقة، فلا داعي لتحويلٍ يخالف بقية الشاشة.
 */
export const NextSegmentStrip = ({
  itinerary,
  onOpen,
}: NextSegmentWidgetProps & { onOpen: () => void }) => {
  // ⚠️ قبل أي خروج مبكر — قواعد الخطّافات لا تسمح باستدعاء مشروط.
  const now = useMinuteTick()

  if (!itinerary || itinerary.length === 0) return null

  const nextSegment = findNextSegment(itinerary, now)
  if (!nextSegment) return null

  const Icon = TRANSPORT_ICON[nextSegment.mode]
  const countdown = formatCountdown(nextSegment.departure.time, now)
  const destination = nextSegment.arrival.location

  return (
    <button
      type="button"
      onClick={() => { haptic.light(); onOpen() }}
      aria-label={`الوجهة القادمة ${destination}${countdown ? ` ${countdown}` : ''} — افتح مسار الرحلة`}
      className="w-full flex items-center gap-2 rtl bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 text-right hover:bg-teal-100/70 active:bg-teal-100 transition-colors min-h-[44px]"
    >
      {Icon && <Icon className="w-4 h-4 text-teal-600 shrink-0" />}
      <span className="text-sm font-bold text-slate-800 truncate">{destination}</span>
      {countdown && (
        <>
          <span aria-hidden className="text-teal-300 shrink-0">•</span>
          <span className="text-xs font-bold text-teal-700 shrink-0">{countdown}</span>
        </>
      )}
      <ChevronLeft className="w-4 h-4 text-teal-400 shrink-0 mr-auto" />
    </button>
  )
}
