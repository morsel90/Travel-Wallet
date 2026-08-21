// 🆕 يزامن اسم ملف المسافر الخاص بالمستخدم مع اسم بروفايله (users/{uid}.displayName)
// كلما اختلفا — بلا أي زر أو نموذج جديد. البديل الذي اخترناه بدل ربط الاسم
// حيّاً (كما فعلنا لبيانات البنك في useOrganizerBankDetails): ربط حيّ هنا يعني
// اشتراكاً منفصلاً لكل مسافر مربوط بحساب في كل مكان يُعرض فيه اسمه (بطاقات
// المسافرين، مشاركو المصروف، التقارير، كشف الحساب المطبوع) — كلفة أكبر بكثير
// من قراءة واحدة لمنظّم واحد. المزامنة هنا صامتة وأفضل جهد فقط: تكتب مرة واحدة
// عبر updateMyTravelerName (الموجودة أصلاً، وغير مقيَّدة بمرة واحدة خادمياً —
// استخدامها الوحيد سابقاً كان نموذج الاسم عند أول انضمام)، ولا تُبقي على أي
// طابع "مزامنة يدوية أرادها المستخدم لاحقاً": لو غيّر اسمه داخل الرحلة نفسه
// (تخصيص محلي مختلف عن بروفايله)، لا مسار لذلك اليوم أصلاً — لا حقل تحرير آخر
// يتنافس مع هذا المصدر.
//
// ⚠️ **لا نُعيد المحاولة عند الفشل** — نفس مبدأ "لا طابور إعادة محاولة" في
// docs/DECISIONS.md (Optimistic updates roll back automatically). الفشل يُسجَّل
// فقط؛ المسار اليدوي (لا يوجد اليوم) أو محاولة لاحقة عند تغيّر البروفايل مجدداً
// كافيان.
import { useEffect, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { User } from 'firebase/auth'
import { functions } from '../firebase'
import type { Traveler } from '../types'

interface UpdateMyTravelerNameRequest { tripId: string; name: string }
interface UpdateMyTravelerNameResponse { success: boolean }

export function useSyncTravelerNameFromProfile(
  tripId: string,
  user: User | null,
  travelers: Traveler[],
  profileDisplayName: string | undefined,
): void {
  // 🆕 يمنع إعادة إرسال نفس القيمة أكثر من مرة قبل أن يُحدَّث traveler.name عبر
  // الاشتراك الحيّ (useTravelers) — لا حالة React: لا داعي لإعادة رسم بسببه.
  const lastAttemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    const trimmedProfileName = profileDisplayName?.trim()
    if (!trimmedProfileName) return

    const myTraveler = travelers.find(t => t.uid === user.uid)
    if (!myTraveler || myTraveler.name === trimmedProfileName) return
    if (lastAttemptedRef.current === trimmedProfileName) return
    lastAttemptedRef.current = trimmedProfileName

    const update = httpsCallable<UpdateMyTravelerNameRequest, UpdateMyTravelerNameResponse>(
      functions, 'updateMyTravelerName',
    )
    update({ tripId, name: trimmedProfileName }).catch((err: unknown) => {
      console.error('[useSyncTravelerNameFromProfile] تعذّرت مزامنة اسم المسافر من البروفايل:', err)
    })
  }, [tripId, user, travelers, profileDisplayName])
}
