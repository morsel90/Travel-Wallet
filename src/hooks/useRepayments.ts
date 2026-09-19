// 🆕 قيود السداد بين المسافرين — مستمع حيّ، وحذف ليّن/استعادة.
//
// نفس بنية useExpenses: onSnapshot مع includeMetadataChanges لشارة «جارٍ
// المزامنة»، وجلبة طازجة من الخادم للسحب-للتحديث. والفرق الوحيد أن **الإنشاء
// ليس هنا**: قيد السداد يكتبه الخادم وحده (recordSettlement — السقف والاتجاه
// لا يُفحصان إلا على الدفتر كاملاً). هنا فقط ما تسمح به القواعد للعميل:
// تغيير `deletedAt` وحده (انظر match /repayments في firestore.rules).
//
// ⚠️ **الرصيد ينتظر هذا المستمع.** بلا `repaymentsLoaded` في isInitialLoading
// كانت الأرصدة تُحسب لحظةً بلا السداد، فتومض تسويةٌ سُدّدت فعلاً ثم تختفي.
import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { onSnapshot, getDocsFromServer, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { repaymentsCol, repaymentDoc } from '../firestore'
import { haptic } from '../utils/haptics'
import type { Repayment, ToastMessage } from '../types'

export interface UseRepayments {
  repayments: Repayment[]
  setRepayments: Dispatch<SetStateAction<Repayment[]>>
  repaymentsLoaded: boolean
  refreshRepayments: () => Promise<void>
}

interface UseRepaymentActionsParams {
  setRepayments: Dispatch<SetStateAction<Repayment[]>>
  showToast: (msg: ToastMessage, durationMs?: number) => void
  handleFirestoreError: (err: unknown, fallback: string) => void
}

export interface UseRepaymentActions {
  /** حذف ليّن — القيد ينتقل إلى سلة المهملات، ويعود الرصيدان كما كانا قبله. */
  deleteRepayment: (id: string) => void
  restoreRepayment: (id: string) => void
}

const toRepayment = (id: string, data: Omit<Repayment, 'id' | '_pending'>, pending: boolean): Repayment =>
  ({ id, ...data, _pending: pending })

// ⚠️ مقسومٌ اثنين كـ useExpenses/useExpenseActions: المستمع يُستدعى قبل
// showToast/handleFirestoreError في useAppCoordinator، والأرصدة تحتاجه قبلهما.
export function useRepayments(user: User | null): UseRepayments {
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [repaymentsLoaded, setRepaymentsLoaded] = useState(false)

  useEffect(() => {
    if (!user) { setRepaymentsLoaded(true); return }
    setRepaymentsLoaded(false)

    const unsub = onSnapshot(repaymentsCol(), { includeMetadataChanges: true }, snap => {
      setRepayments(snap.docs
        .map(d => toRepayment(d.id, d.data() as Omit<Repayment, 'id' | '_pending'>, d.metadata.hasPendingWrites))
        .sort((a, b) => b.createdAt - a.createdAt))
      setRepaymentsLoaded(true)
    }, () => {
      // الفشل لا يوقف الشاشة: الأرصدة تُعرض بلا السداد، وهو ما كانت عليه قبل
      // هذه الميزة. رسالة الاتصال العامة يعرضها مستمع المصاريف أصلاً.
      setRepaymentsLoaded(true)
    })

    return () => unsub()
  }, [user])

  const refreshRepayments = useCallback(async () => {
    if (!user) return
    const snap = await getDocsFromServer(repaymentsCol())
    setRepayments(snap.docs
      .map(d => toRepayment(d.id, d.data() as Omit<Repayment, 'id' | '_pending'>, false))
      .sort((a, b) => b.createdAt - a.createdAt))
  }, [user])

  return { repayments, setRepayments, repaymentsLoaded, refreshRepayments }
}

export function useRepaymentActions({ setRepayments, showToast, handleFirestoreError }: UseRepaymentActionsParams): UseRepaymentActions {
  const setDeletedAt = useCallback((id: string, deletedAt: number | null, successText: string, fallback: string) => {
    // تحديث متفائل (القاعدة ١٠): الكتابة واحدة ونتيجتها معروفة سلفاً — بخلاف
    // الإنشاء الذي يحسبه الخادم.
    setRepayments((prev: Repayment[]) => prev.map(r => (r.id === id ? { ...r, deletedAt } : r)))
    haptic.light()
    showToast({ text: successText, type: 'success' })
    updateDoc(repaymentDoc(id), { deletedAt }).catch(err => handleFirestoreError(err, fallback))
  }, [setRepayments, showToast, handleFirestoreError])

  const deleteRepayment = useCallback(
    (id: string) => setDeletedAt(id, Date.now(), 'نُقل السداد إلى سلة المهملات', 'تعذّر حذف السداد.'),
    [setDeletedAt],
  )
  const restoreRepayment = useCallback(
    (id: string) => setDeletedAt(id, null, 'استُعيد السداد', 'تعذّر استعادة السداد.'),
    [setDeletedAt],
  )

  return { deleteRepayment, restoreRepayment }
}

