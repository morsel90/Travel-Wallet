// 🆕 «هل أنا منظّم هذه الرحلة؟» — docs/PLAN-member-management.md المرحلة ٣.
//
// لا استعلام قائمة ولا claim جديد: قراءة واحدة لسطر عضوية المستخدم نفسه.
// firestore.rules تسمح بها فقط إن كان role فعلاً 'organizer' (انظر
// isOrganizer)، فالرفض بصلاحيات هنا **هو نفسه** الإجابة «لا، لست منظّماً» —
// وليس خطأً يستحق إظهاره. عضو عادي لا يقرأ سطره أصلاً (نفس قيد سجلّ العضوية
// القائم أساساً)، فهذا الفحص لا يكشف له شيئاً جديداً عن نفسه.
//
// جلب لمرة واحدة لا onSnapshot: الدور لا يتغيّر إلا بفعل المسؤول من مكان آخر
// (تبويب الأعضاء)، وأثره هنا مجرّد إظهار/إخفاء زرّ — لا يستحق اتصالاً حيّاً
// دائماً. تحديثه يحتاج إعادة تحميل الصفحة، وهذا مقبول لتغيّر نادر كهذا.
import { useEffect, useState } from 'react'
import { getDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { tripMemberDocById } from '../firestore'

export function useMyTripRole(tripId: string, user: User | null): boolean {
  const [isOrganizer, setIsOrganizer] = useState(false)

  useEffect(() => {
    if (!user) {
      setIsOrganizer(false)
      return
    }
    let cancelled = false

    getDoc(tripMemberDocById(tripId, user.uid))
      .then(snap => {
        if (cancelled) return
        setIsOrganizer(snap.exists() && snap.data().role === 'organizer')
      })
      // رفض بصلاحيات = ليس منظّماً (هذا بالضبط ما تعنيه القواعد) — لا خطأ يُبلَّغ عنه.
      .catch(() => { if (!cancelled) setIsOrganizer(false) })

    return () => { cancelled = true }
  }, [tripId, user])

  return isOrganizer
}
