import { useEffect, useState } from 'react'
import { Plane, Car, Train, Bus } from '../icons'
import { findNextSegment, formatCountdown } from '../utils/itinerary'
import type { ItinerarySegment } from '../types'

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

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'flight': return <Plane className="w-5 h-5 text-teal-600" />
      case 'car': return <Car className="w-5 h-5 text-teal-600" />
      case 'train': return <Train className="w-5 h-5 text-teal-600" />
      case 'bus': return <Bus className="w-5 h-5 text-teal-600" />
      default: return null
    }
  }

  const depDate = new Date(nextSegment.departure.time)
  const formattedDate = depDate.toLocaleDateString('ar-SA', { weekday: 'long', month: 'short', day: 'numeric' })
  const formattedTime = depDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  const countdown = formatCountdown(nextSegment.departure.time, now)

  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-4 rtl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-white p-2.5 rounded-full shadow-sm">
          {getTransportIcon(nextSegment.mode)}
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