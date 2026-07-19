import { useEffect, useState } from 'react'
import { getDocs, query, orderBy } from 'firebase/firestore'
import { depositLogsCol } from '../firestore'
import type { DepositLogEntry } from '../types'

// 🆕 يجلب سجل تعديلات رصيد مسافر (subcollection depositLogs) لمرة واحدة عند
// الحاجة — نفس نمط DepositHistoryModal. السجل مقروء للمسؤول فقط (firestore.rules)،
// لذا نمرّر enabled=false لغير المسؤول فلا نحاول القراءة أصلاً (تفادياً لخطأ صلاحية).
// يُعيد logs=null أثناء التحميل أو عند التعطيل، ومصفوفة عند النجاح، وerror عند الفشل.
export function useDepositLogs(travelerId: number | null, enabled: boolean): {
  logs: DepositLogEntry[] | null
  error: boolean
} {
  const [logs, setLogs] = useState<DepositLogEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled || travelerId == null) {
      setLogs(null)
      setError(false)
      return
    }
    let cancelled = false
    setLogs(null)
    setError(false)
    getDocs(query(depositLogsCol(travelerId), orderBy('createdAt', 'desc')))
      .then(snap => {
        if (cancelled) return
        setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DepositLogEntry, 'id'>) })))
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [travelerId, enabled])

  return { logs, error }
}
