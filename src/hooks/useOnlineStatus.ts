import { useState, useEffect } from 'react'

/**
 * 🆕 يتتبّع حالة اتصال الشبكة عبر أحداث المتصفح online/offline (Navigator.onLine)
 * لعرض بانر تنبيه عام عند الانقطاع. هذا مؤشر واجهة (UX) بحت — لا علاقة له
 * بمنطق الكتابة نفسه: أي إضافة/تعديل/حذف يحدث أثناء الانقطاع يُحفظ محلياً
 * تلقائياً عبر طابور الكتابة الداخلي في Firestore SDK (persistentLocalCache،
 * انظر src/firebase.ts) ويُرسل عند عودة الاتصال دون أي تدخّل هنا؛ هذا الـ hook
 * فقط يُطمئن المستخدم بصرياً بأن ذلك يحدث.
 *
 * ⚠️ navigator.onLine يعكس اتصالاً بشبكة ما (لا يضمن وصولاً فعلياً للإنترنت أو
 * لخوادم Firebase تحديداً) — لكنه المؤشر القياسي المتاح للمتصفح، وكافٍ لحالة
 * الاستخدام هنا (تنبيه إرشادي وليس قراراً حرجاً على منطق الكتابة).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
