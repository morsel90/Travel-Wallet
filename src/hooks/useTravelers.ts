import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react'
import { onSnapshot, query, where, getDocsFromServer } from 'firebase/firestore'
import type { User }  from 'firebase/auth'
import { travelersCol } from '../firestore'
import type { Traveler } from '../types'

// ─── useTravelers ──────────────────────────────────────────────────────────────
// يملك حالة المسافرين ويشترك في listener فوري (onSnapshot) عند توفّر مستخدم.
// يستبعد المسافرين المحذوفين منطقياً (deletedAt != null) عند مستوى الـ query.
// يُرجِع المسافرين + setTravelers (يستخدمه App في الـ handlers للتحديث المتفائل).
export interface UseTravelers {
  travelers: Traveler[]
  setTravelers: Dispatch<SetStateAction<Traveler[]>>
  // 🆕 true بعد وصول أول رد من Firestore (نجاحاً أو فشلاً) أو فوراً إن لم يوجد
  // مستخدم أصلاً — يُستخدم في App.tsx لعرض Skeleton Loading (انظر useExpenses)
  travelersLoaded: boolean
  // 🆕 Pull-to-Refresh: جلب مباشر من الخادم متجاوزاً الكاش — انظر التعليق
  // الكامل على refreshExpenses المطابق في useExpenses.ts لنفس المنطق والسبب.
  refreshTravelers: () => Promise<void>
}

export function useTravelers(
  user: User | null,
  setIsSyncing: Dispatch<SetStateAction<boolean>>
): UseTravelers {
  const [travelers, setTravelers] = useState<Traveler[]>([])
  const [travelersLoaded, setTravelersLoaded] = useState(false)

  useEffect(() => {
    if (!user) { setTravelersLoaded(true); return } // لا يوجد ما يُنتظر (وضع محلي بلا Firebase)
    setTravelersLoaded(false)
    setIsSyncing(true)

    // 🆕 استبعاد المسافرين المحذوفين منطقياً عند مستوى الـ query
    const q = query(travelersCol(), where('deletedAt', '==', null))

    // 🆕 includeMetadataChanges: true — لعرض/إخفاء شارة "جارٍ المزامنة" لكل
    // مسافر فور تأكيد الخادم لكتابة متفائلة (انظر App.tsx وقسم Optimistic
    // Updates في CLAUDE.md)
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => {
      const data = snap.docs
        .map(d => ({
          ...(d.data() as Omit<Traveler, 'id' | '_pending'>),
          id: Number(d.id),
          _pending: d.metadata.hasPendingWrites, // 🆕 للعرض فقط — لا يُكتب لـ Firestore أبداً
        }))
        .sort((a, b) => a.id - b.id)
      setTravelers(data)
      setIsSyncing(false)
      setTravelersLoaded(true) // 🆕 وصل أول رد فعلي — أوقف Skeleton Loading
    }, (err) => {
      console.error('Travelers listener error:', err)
      setIsSyncing(false)
      setTravelersLoaded(true) // 🆕 توقفنا عن الانتظار (حتى لو بخطأ)
    })

    return () => unsub()
  }, [user, setIsSyncing])

  const refreshTravelers = useCallback(async () => {
    if (!user) return // وضع محلي بلا Firebase — لا خادم لجلب شيء منه
    const q = query(travelersCol(), where('deletedAt', '==', null))
    const snap = await getDocsFromServer(q)
    const data = snap.docs
      .map(d => ({
        ...(d.data() as Omit<Traveler, 'id' | '_pending'>),
        id: Number(d.id),
        _pending: false, // 🆕 نتيجة مؤكَّدة من الخادم مباشرة — لا يوجد ما هو "معلّق"
      }))
      .sort((a, b) => a.id - b.id)
    setTravelers(data)
  }, [user])

  return { travelers, setTravelers, travelersLoaded, refreshTravelers }
}