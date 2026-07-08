import { useEffect, useState } from 'react'
import { getDocs, query, orderBy } from 'firebase/firestore'
import { depositLogsCol } from '../../firestore'
import { Modal } from '../Modal'
import { X, Loader2 } from '../../icons'
import type { DepositLogEntry } from '../../types'

// ─── DepositHistoryModal ────────────────────────────────────────────────────
// 🆕 سجل تدقيق تعديلات رصيد مسافر (من غيّره، متى، القيمة السابقة/الجديدة،
// والسبب إن وُجد) — مرئي للمسؤول فقط، ويُقرأ من subcollection غير قابلة
// للتعديل أو الحذف (انظر firestore.rules). قراءة لمرة واحدة عند الفتح؛ سجل
// التدقيق لا يحتاج تحديثًا فوريًا (live) بخلاف بيانات المصاريف/المسافرين.
interface DepositHistoryModalProps {
  travelerId: number
  travelerName: string
  onClose: () => void
}

const MODE_LABELS: Record<string, string> = {
  add: 'إضافة',
  subtract: 'خصم',
  set: 'تحديد قيمة',
}

const DepositHistoryModal = ({ travelerId, travelerName, onClose }: DepositHistoryModalProps) => {
  const [logs, setLogs] = useState<DepositLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDocs(query(depositLogsCol(travelerId), orderBy('createdAt', 'desc')))
        if (cancelled) return
        setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DepositLogEntry, 'id'>) })))
      } catch {
        if (!cancelled) setError('تعذر تحميل سجل التعديلات. تأكد من صلاحياتك وحاول مجددًا.')
      }
    })()
    return () => { cancelled = true }
  }, [travelerId])

  return (
    <Modal maxWidth="max-w-md" onClose={onClose}>
      <button type="button" onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 transition-colors">
        <X className="w-5 h-5" />
      </button>
      <h3 className="font-bold mb-4">سجل تعديلات رصيد {travelerName}</h3>

      {error && <p className="text-xs text-rose-500 text-center py-6">{error}</p>}

      {!error && logs === null && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
        </div>
      )}

      {!error && logs !== null && logs.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-8">
          لا توجد أي تعديلات مسجّلة على رصيد هذا المسافر بعد.
        </p>
      )}

      {!error && logs !== null && logs.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="border border-slate-100 rounded-xl p-3 text-xs">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-slate-700">{MODE_LABELS[log.mode] ?? log.mode}</span>
                <span className="text-slate-400">
                  {new Date(log.createdAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-slate-500" dir="ltr">
                {log.previousDeposited.toFixed(2)} ← {log.newDeposited.toFixed(2)}
                <span className={`font-bold ${log.delta >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                  {' '}({log.delta >= 0 ? '+' : ''}{log.delta.toFixed(2)})
                </span>
              </p>
              <p className="text-slate-400 mt-1.5">بواسطة: {log.changedByEmail || 'غير معروف'}</p>
              {log.reason && (
                <p className="text-slate-600 mt-1.5 bg-slate-50 rounded-lg p-2">"{log.reason}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default DepositHistoryModal
