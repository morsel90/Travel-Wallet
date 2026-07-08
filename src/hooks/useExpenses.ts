import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react'
import { onSnapshot, getDocsFromServer } from 'firebase/firestore'
import type { User }  from 'firebase/auth'
import { expensesCol } from '../firestore'
import type { Expense } from '../types'

// ─── useExpenses ──────────────────────────────────────────────────────────────
// يملك حالة المصاريف ويشترك في listener فوري (onSnapshot) عند توفّر مستخدم.
// يُرجِع المصاريف + setExpenses (يستخدمه App في الـ handlers للتحديث المتفائل).
// حالة المزامنة/الخطأ تبقى مملوكة لـ App وتُمرَّر setters لها (دوال ثابتة).
export interface UseExpensesReporters {
  setIsSyncing: Dispatch<SetStateAction<boolean>>
  setSyncError: Dispatch<SetStateAction<string | null>>
}

export interface UseExpenses {
  expenses: Expense[]
  setExpenses: Dispatch<SetStateAction<Expense[]>>
  // 🆕 true بعد وصول أول رد من Firestore (نجاحاً أو فشلاً) أو فوراً إن لم يوجد
  // مستخدم أصلاً (لا شيء يُنتظر). يُستخدم في App.tsx لعرض Skeleton Loading بدل
  // فراغات/رسائل "لا توجد بيانات" مضلِّلة أثناء التحميل الأول فقط.
  expensesLoaded: boolean
  // 🆕 Pull-to-Refresh: يجلب أحدث نسخة من الخادم مباشرة متجاوزاً الكاش المحلي
  // تماماً (getDocsFromServer) — يُستخدم فقط عند طلب صريح من المستخدم (سحب
  // لأسفل في components/PullToRefresh.tsx)، وليس جزءاً من التدفق الفوري
  // المعتاد؛ onSnapshot أعلاه يكفي وحده لكل التحديثات التلقائية أثناء الاستخدام
  // العادي. يُحدّث state مباشرة (بدل انتظار onSnapshot لإعادة الإطلاق تلقائياً
  // من الكاش) لضمان انعكاس فوري ومضمون لنتيجة الجلب الصريح.
  refreshExpenses: () => Promise<void>
}

export function useExpenses(user: User | null, reporters: UseExpensesReporters): UseExpenses {
  const { setIsSyncing, setSyncError } = reporters
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoaded, setExpensesLoaded] = useState(false)

  useEffect(() => {
    if (!user) { setExpensesLoaded(true); return } // لا يوجد ما يُنتظر (وضع محلي بلا Firebase)
    setExpensesLoaded(false)
    setIsSyncing(true)

    const handleErr = (err: Error) => {
      setSyncError(
        err.message?.includes('permission')
          ? 'خطأ في الصلاحيات: يرجى مراجعة Firestore Rules.'
          : 'تعذر الاتصال بقاعدة البيانات. تحقق من اتصالك بالإنترنت.'
      )
      setIsSyncing(false)
      setExpensesLoaded(true) // 🆕 توقفنا عن الانتظار (حتى لو بخطأ) — لا داعٍ لبقاء Skeleton للأبد
    }

    // 🆕 includeMetadataChanges: true — يُعيد استدعاء onNext أيضاً عند تغيّر
    // hasPendingWrites فقط (بلا تغيّر بيانات فعلي)، لنعرض/نُخفي شارة "جارٍ
    // المزامنة" فور تأكيد الخادم لكتابة متفائلة (انظر App.tsx وقسم Optimistic
    // Updates في CLAUDE.md). الكتابة نفسها تُطبَّق على كاش Firestore المحلي
    // فوراً بمجرد استدعاء setDoc/addDoc/updateDoc — قبل هذا التأكيد أصلاً.
    const unsub = onSnapshot(expensesCol(), { includeMetadataChanges: true }, snap => {
      const data = snap.docs
        .map(d => ({
          id: d.id,
          ...(d.data() as Omit<Expense, 'id' | '_pending'>),
          _pending: d.metadata.hasPendingWrites, // 🆕 للعرض فقط — لا يُكتب لـ Firestore أبداً
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
      setExpenses(data)
      setSyncError(null)
      setIsSyncing(false)
      setExpensesLoaded(true) // 🆕 وصل أول رد فعلي — أوقف Skeleton Loading
    }, handleErr)

    return () => unsub()
  }, [user, setIsSyncing, setSyncError])

  const refreshExpenses = useCallback(async () => {
    if (!user) return // وضع محلي بلا Firebase — لا خادم لجلب شيء منه
    const snap = await getDocsFromServer(expensesCol())
    const data = snap.docs
      .map(d => ({
        id: d.id,
        ...(d.data() as Omit<Expense, 'id' | '_pending'>),
        _pending: false, // 🆕 نتيجة مؤكَّدة من الخادم مباشرة — لا يوجد ما هو "معلّق"
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
    setExpenses(data)
  }, [user])

  return { expenses, setExpenses, expensesLoaded, refreshExpenses }
}