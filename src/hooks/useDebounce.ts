import { useState, useEffect } from 'react'

/**
 * يُرجع نسخة "مؤخّرة" (debounced) من القيمة المُمرَّرة — لا تتحدّث إلا بعد
 * مرور delayMs ملّي ثانية دون أي تغيير جديد على القيمة الأصلية. أي تغيير جديد
 * خلال فترة الانتظار يُلغي المؤقّت السابق ويبدأ العدّ من جديد (debounce
 * كلاسيكي)، فلا تتحدّث القيمة المُرجَعة إلا بعد "هدوء" فعلي.
 *
 * مفيد لتفادي إعادة حساب عمليات مكلفة (كتصفية/فرز قائمة طويلة) عند كل ضغطة
 * مفتاح في حقل بحث. حقل الإدخال نفسه يبقى مرتبطاً بالقيمة الفورية غير
 * المؤخَّرة (state منفصل في المستدعي) فلا يشعر المستخدم بأي تأخير أثناء الكتابة
 * — التأخير يقع فقط على الحساب المشتق منها.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer) // إلغاء المؤقّت السابق عند تغيّر القيمة قبل انتهاء المهلة
  }, [value, delayMs])

  return debounced
}
