// 🆕 قائمة أعضاء رحلة بعينها — من سجلّ trips/{tripId}/members.
//
// **لماذا يوجد هذا الـ hook أصلاً؟** لأن السؤال الذي يجيب عنه لم يكن له جواب:
// العضوية تعيش في custom claims حساب كل عضو، وFirebase Auth لا يقبل استعلاماً
// عليها. فلا التطبيق ولا المسؤول كان يعرف من في الرحلة، والأداة الوحيدة لإخراج
// شخص كانت تغيير الرمز — أي إخراج الجميع.
//
// جلب لمرة واحدة لا onSnapshot، على نمط useDepositLogs: القائمة تُفتح في لوحة
// الإدارة عند الحاجة، ولا تتغيّر إلا بفعل المسؤول نفسه في نفس الشاشة — فالاستماع
// الحيّ يدفع ثمن اتصال دائم مقابل تحديث يملكه المستدعي أصلاً عبر refresh().
//
// ⚠️ القراءة مقصورة على المسؤول في firestore.rules، لذا نمرّر enabled=false لغيره
// فلا نحاول القراءة أصلاً بدل استقبال خطأ صلاحيات متوقَّع.
import { useCallback, useEffect, useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { tripMembersCol } from '../firestore'
import type { TripMember } from '../types'

export interface UseTripMembersResult {
  /** null أثناء التحميل أو عند التعطيل؛ مصفوفة عند النجاح. */
  members: TripMember[] | null
  error: boolean
  /** إعادة الجلب — يستدعيها المسؤول بعد إزالة عضو. */
  refresh: () => void
}

export function useTripMembers(tripId: string | null, enabled: boolean): UseTripMembersResult {
  const [members, setMembers] = useState<TripMember[] | null>(null)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!enabled || !tripId) {
      setMembers(null)
      setError(false)
      return
    }
    let cancelled = false
    setMembers(null)
    setError(false)

    getDocs(tripMembersCol(tripId))
      .then(snap => {
        if (cancelled) return
        const rows = snap.docs.map(d => ({
          uid: d.id,
          ...(d.data() as Omit<TripMember, 'uid'>),
        }))

        // ⚠️ الترتيب هنا لا في استعلام Firestore: السطور المُرحَّلة بلا joinedAt
        // إطلاقاً، وorderBy على حقل غائب **يُسقط المستند من النتيجة تماماً** —
        // أي تختفي من القائمة بالضبط السطورُ الأقدم، وهي التي تحتاج المراجعة أكثر.
        rows.sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0))
        setMembers(rows)
      })
      .catch(() => { if (!cancelled) setError(true) })

    return () => { cancelled = true }
  }, [tripId, enabled, nonce])

  return { members, error, refresh }
}
