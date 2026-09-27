// ─── useTripStats ─────────────────────────────────────────────────────────────
// الرقمان الوحيدان على بطاقة «رحلاتي»: عدد المسافرين وإجمالي المصروف.
//
// ⚠️ تجميع خادمي لا قراءة المجموعات — «رحلاتي» شاشة الدخول، وقراءة كل مصاريف
// رحلة طويلة تنمو بلا حدّ (DECISIONS.md).
// ⚠️ المجموع ناقص المحذوف، لا فلتر `deletedAt == null`: المستندات القديمة بلا
// الحقل أصلاً فتسقط صمتاً. `> 0` لا يطابق null ولا الغياب.
// ⚠️ يجب أن يساوي ما تعرضه ترويسة الرحلة بعد فتحها — وإلا تناقض مالي ظاهر.
import { useState, useEffect } from 'react'
import type { User } from 'firebase/auth'
import { getCountFromServer, getAggregateFromServer, query, where, sum } from 'firebase/firestore'
import { expensesColByTrip, travelersColByTrip } from '../firestore'

export interface TripStats {
  /** عدد المسافرين غير المحذوفين. */
  travelerCount: number
  /** إجمالي المصروف بالريال (المصاريف غير المحذوفة) — `Expense.amount` محوَّل أصلاً. */
  totalSpent: number
}

/** مفتاحها معرّف الرحلة. الرحلة الغائبة منها = إحصاءاتها لم تصل (بعد، أو أصلاً). */
export type TripStatsMap = Record<string, TripStats>

const isDeleted = where('deletedAt', '>', 0)

async function readTripStats(tripId: string): Promise<TripStats | null> {
  const travelers = travelersColByTrip(tripId)
  const expenses  = expensesColByTrip(tripId)

  const [allTravelers, delTravelers, allExpenses, delExpenses] = await Promise.all([
    getCountFromServer(travelers),
    getCountFromServer(query(travelers, isDeleted)),
    getAggregateFromServer(expenses, { total: sum('amount') }),
    getAggregateFromServer(query(expenses, isDeleted), { total: sum('amount') }),
  ])

  const travelerCount = allTravelers.data().count - delTravelers.data().count
  const totalSpent    = allExpenses.data().total  - delExpenses.data().total

  // مستند تالف واحد يُفسد المجموع الخادمي كله — لا رقم أفضل من NaN.
  if (!Number.isFinite(travelerCount) || !Number.isFinite(totalSpent)) return null
  return { travelerCount: Math.max(0, travelerCount), totalSpent }
}

/**
 * جلبة واحدة عند التركيب، لا listener — الشاشة عابرة واختيار رحلة يعيد التحميل.
 *
 * ⚠️ الفشل صامت عمداً (التجميع يفشل دائماً بلا اتصال): البطاقة تُرسم بلا أرقام.
 *
 * @param tripIds معرّفات الرحلات المعروضة فعلاً — لا كل ما يملكه المستخدم.
 */
export function useTripStats(tripIds: string[], user: User | null): TripStatsMap {
  const [stats, setStats] = useState<TripStatsMap>({})

  // المحتوى هو المفتاح لا المرجع — المصفوفة تُبنى من جديد في كل عرض.
  const key = tripIds.join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!user || ids.length === 0) return

    let cancelled = false
    void (async () => {
      const entries = await Promise.all(ids.map(async id => {
        try {
          return [id, await readTripStats(id)] as const
        } catch {
          // فشل رحلة واحدة (صلاحية سُحبت، أو انقطاع) لا يُسقط أرقام البقية.
          return [id, null] as const
        }
      }))
      if (cancelled) return
      // دمج لا استبدال: جلب القائمة المؤرشفة لاحقاً لا يمحو أرقام النشطة.
      setStats(prev => {
        const next = { ...prev }
        entries.forEach(([id, s]) => { if (s) next[id] = s })
        return next
      })
    })()

    return () => { cancelled = true }
  }, [key, user])

  return stats
}
