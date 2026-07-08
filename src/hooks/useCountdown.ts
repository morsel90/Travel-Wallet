import { useState, useEffect } from 'react'

/**
 * 🆕 يُرجع عدد الثواني المتبقية حتى targetTimestamp (Unix ms بالمللي ثانية)،
 * ويتحدّث تلقائياً كل ثانية عبر مؤقّت داخلي حتى تنتهي المهلة (يُرجع 0 حينها
 * ويوقف نفسه تلقائياً — لا حاجة لتصفير targetTimestamp من المستدعي).
 * targetTimestamp = null يعني: لا يوجد عدّ تنازلي نشط (يُرجع 0 مباشرة).
 *
 * مفيد لأزرار "أعد المحاولة خلال Xث" (مثال: زر استرداد كلمة المرور في
 * AdminSignInModal — يمنع إعادة الإرسال المتكرر خلال 60 ثانية من كل محاولة).
 */
export function useCountdown(targetTimestamp: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    targetTimestamp ? Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000)) : 0
  )

  useEffect(() => {
    if (!targetTimestamp) {
      setRemaining(0)
      return
    }

    const computeRemaining = () => Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000))
    setRemaining(computeRemaining()) // تحديث فوري عند تغيّر الهدف — لا ننتظر أول tick بعد ثانية

    const interval = setInterval(() => {
      const secs = computeRemaining()
      setRemaining(secs)
      if (secs <= 0) clearInterval(interval) // إيقاف ذاتي — لا يبقى المؤقّت يعمل بلا داعٍ بعد الوصول للصفر
    }, 1000)

    return () => clearInterval(interval)
  }, [targetTimestamp])

  return remaining
}
