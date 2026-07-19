import { useState, useRef, FormEvent } from 'react'
import { Plus, AlertTriangle } from '../icons'
import { haptic } from '../utils/haptics'

interface SmartInputBarProps {
  visible: boolean
  onQuickAdd: (description: string, amount: number) => string | null
  onExpand: (desc: string, amount: string) => void
}

// تحويل الأرقام الهندية/الشرقية إلى غربية
const convertArabicNumerals = (str: string): string => {
  const map: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' }
  return str.replace(/[٠-٩]/g, ch => map[ch] ?? ch)
}

const SmartInputBar = ({ visible, onQuickAdd, onExpand }: SmartInputBarProps) => {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const descRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  if (!visible) return null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = parseFloat(amount)
    if (!desc.trim()) { haptic.error(); setError('أدخل وصفاً'); return }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { haptic.error(); setError('مبلغ غير صحيح'); return }

    const resultError = onQuickAdd(desc, parsedAmount)

    if (resultError) {
      haptic.error()
      setError(resultError)
    } else {
      setDesc('')
      setAmount('')
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg bg-white/95 backdrop-blur-xl border border-slate-200/60 p-2 rounded-2xl z-40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-transform">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-1.5">

          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-teal-500/50 transition-all shadow-sm h-11">

            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={e => {
                const converted = convertArabicNumerals(e.target.value)
                const sanitized = converted.replace(/[^0-9.]/g, '')
                const parts = sanitized.split('.')
                const finalValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized
                setAmount(finalValue)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  descRef.current?.focus()
                }
              }}
              className="w-20 sm:w-28 bg-transparent px-3 h-full text-base font-black text-teal-700 outline-none placeholder:text-slate-400 text-center"
              dir="ltr"
            />
            <div className="w-px h-6 bg-slate-200 shrink-0" />

            <input
              ref={descRef}
              type="text"
              placeholder="عشاء، بنزين..."
              value={desc}
              onChange={e => { setDesc(e.target.value); setError(null) }}
              className="w-full bg-transparent px-3 h-full text-base font-bold outline-none placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>

          <button
            type="button"
            onClick={() => { haptic.light(); onExpand(desc, amount) }}
            title="إضافة تفاصيل"
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 w-11 h-11 flex items-center justify-center rounded-xl transition-colors shrink-0 shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>

          <button
            type="submit"
            disabled={!desc.trim() || !amount}
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white w-11 h-11 flex items-center justify-center rounded-xl transition-colors shrink-0 shadow-sm disabled:shadow-none"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-500 mt-2 px-1 font-bold flex items-center gap-1.5 animate-fadeIn">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </form>
    </div>
  )
}

export default SmartInputBar