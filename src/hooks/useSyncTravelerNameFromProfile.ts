// يزامن اسم مسافر المستخدم مع اسم بروفايله كلما اختلفا — كتابة صامتة واحدة عبر
// updateMyTravelerName. لا ربط حيّ كبيانات البنك: ذاك اشتراك لكل مسافر في كل
// مكان يُعرض اسمه.
//
// ⚠️ لا إعادة محاولة عند الفشل — مبدأ «لا طابور إعادة محاولة» في DECISIONS.md.
import { useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { callable } from './callables'
import type { Traveler } from '../types'

export function useSyncTravelerNameFromProfile(
  tripId: string,
  user: User | null,
  travelers: Traveler[],
  profileDisplayName: string | undefined,
): void {
  // يمنع إعادة إرسال القيمة نفسها قبل أن يصل الاسم الجديد عبر الاشتراك الحيّ.
  const lastAttemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    const trimmedProfileName = profileDisplayName?.trim()
    if (!trimmedProfileName) return

    const myTraveler = travelers.find(t => t.uid === user.uid)
    if (!myTraveler || myTraveler.name === trimmedProfileName) return
    if (lastAttemptedRef.current === trimmedProfileName) return
    lastAttemptedRef.current = trimmedProfileName

    const update = callable('updateMyTravelerName')
    update({ tripId, name: trimmedProfileName }).catch((err: unknown) => {
      console.error('[useSyncTravelerNameFromProfile] تعذّرت مزامنة اسم المسافر من البروفايل:', err)
    })
  }, [tripId, user, travelers, profileDisplayName])
}
