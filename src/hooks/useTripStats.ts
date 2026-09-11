// ─── useTripStats ─────────────────────────────────────────────────────────────
// 🆕 الرقمان الوحيدان على بطاقة الرحلة في «رحلاتي»: عدد المسافرين وإجمالي
// المصروف. لا شيء غيرهما — البطاقة قائمة تنقّل لا لوحة معلومات (انظر
// TripPicker.tsx وdocs/DECISIONS.md).
//
// ⚠️ **استعلامات تجميع (aggregation) لا قراءة المجموعات.** المغري هو
// getDocs على المصاريف ثم calculateTotalSpent محلياً — وهو خطأ هنا تحديداً:
// «رحلاتي» هي شاشة *الدخول* للتطبيق، وتكلفة قراءة كل مصاريف كل رحلة تنمو مع
// طول الرحلة لا مع عدد الرحلات. رحلة طويلة بدورات شهرية (انظر closeMonth) تصل
// لآلاف المستندات، فتُقرأ كلها قبل أن يرى المستخدم أسماء رحلاته. التجميع
// خادمي ويُحاسَب بقراءة واحدة لكل ١٠٠٠ مستند مطابق، فالتكلفة ثابتة عملياً.
//
// ⚠️ **ولماذا استعلامان لكل مجموعة بدل فلتر واحد؟** الحذف ليّن، و`deletedAt`
// **قد يكون غائباً تماماً** من المستندات القديمة (انظر isValidExpense في
// firestore.rules: `!('deletedAt' in d)`). فلتر `deletedAt == null` يُسقط كل
// مستند لا يملك الحقل أصلاً — أي كل المصاريف القديمة — فيظهر إجمالي أقل من
// الحقيقة بلا أي خطأ ظاهر. الطرح هو الطريق الصحيح: المجموع الكامل ناقص
// المحذوف. و`deletedAt > 0` يطابق المحذوف وحده لأن مقارنات المدى في Firestore
// لا تطابق إلا القيم من نفس النوع — فلا null ولا حقل غائب يدخل فيها.
//
// النتيجة يجب أن تساوي ما تعرضه ترويسة الرحلة نفسها بعد فتحها
// (useAppCoordinator: activeExpenses/activeTravelers ثم useBalances) — أي رقم
// مختلف هنا هو تناقض مالي يراه المستخدم على شاشتين متتاليتين.
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

// المحذوف وحده — انظر التحذير أعلاه.
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

  // مستند واحد بمبلغ غير منتهٍ يُفسد المجموع الخادمي كله (بخلاف
  // calculateTotalSpent الذي يُحصّن كل مستند على حدة). لا رقم أفضل من NaN.
  if (!Number.isFinite(travelerCount) || !Number.isFinite(totalSpent)) return null
  return { travelerCount: Math.max(0, travelerCount), totalSpent }
}

/**
 * جلبة واحدة عند التركيب — لا listener ولا إعادة جلب. الشاشة عابرة، واختيار
 * رحلة منها يُعيد تحميل الصفحة بالكامل (TRIP_ID يُقرأ مرة واحدة — انظر
 * utils/tripId.ts)، فلا عمر لهذه الأرقام أطول من عمر الشاشة نفسها.
 *
 * ⚠️ الفشل صامت بالتصميم: التجميع خادمي بحتاً ولا يعمل من الكاش المحلي، فهو
 * يفشل دائماً بلا اتصال. وحينها تبقى الرحلة غائبة من الخريطة، وتُرسم بطاقتها
 * بالاسم والحالة وحدهما — وهي بالضبط بطاقة ما قبل هذه الميزة. لا رسالة خطأ
 * على رقم ثانوي يمنع المستخدم من فتح رحلته.
 *
 * @param tripIds معرّفات الرحلات المعروضة فعلاً — لا كل ما يملكه المستخدم.
 */
export function useTripStats(tripIds: string[], user: User | null): TripStatsMap {
  const [stats, setStats] = useState<TripStatsMap>({})

  // نفس سبب useMyTrips: المصفوفة تُبنى من جديد في كل عرض، فمقارنة المرجع
  // تُعيد التنفيذ بلا داعٍ — المحتوى نفسه هو المفتاح.
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
      // دمج لا استبدال: القائمة المؤرشفة تُطلب لاحقاً عند فتحها، فلا يجوز أن
      // يمحو جلبها أرقام القائمة النشطة التي وصلت قبلها.
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
