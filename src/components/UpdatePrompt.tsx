import { useEffect, useState } from 'react'
import { RefreshCw, X } from '../icons'

interface UpdatePromptProps {
  hasUnsavedData?: () => boolean
}

const UpdatePrompt = ({ hasUnsavedData }: UpdatePromptProps) => {
  const [show, setShow] = useState(false)
  const [reg,  setReg]  = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setReg(registration); setShow(true); return
      }
      registration.addEventListener('updatefound', () => {
        const newSW = registration.installing
        newSW?.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setReg(registration); setShow(true)
          }
        })
      })
    })
  }, [])

  const handleUpdate = () => {
    if (hasUnsavedData?.()) {
      const confirmed = window.confirm(
        'لديك بيانات غير محفوظة في النماذج المفتوحة. سيتم فقدانها عند التحديث. هل تريد المتابعة؟'
      )
      if (!confirmed) return
    }
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  if (!show) return null

  return (
    // 🆕 bottom-24 بدل bottom-4 — يفسح مجالاً لزر Quick Add العائم (FAB) الثابت
    // في الزاوية السفلية اليمنى (bottom-6، ارتفاعه 56px) حتى لا تتداخل معه هذه
    // النافذة إن ظهرت الاثنتان معاً (نادر: فقط مباشرةً بعد نشر تحديث جديد)
    <div className="fixed bottom-24 right-4 left-4 md:left-auto md:w-80 z-[9999] bg-slate-800 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-3">
      <div>
        <p className="font-bold text-sm">تحديث متاح</p>
        <p className="text-xs text-slate-300 mt-0.5">نسخة جديدة من التطبيق جاهزة</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => setShow(false)} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <button onClick={handleUpdate} className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>
    </div>
  )
}

export default UpdatePrompt
