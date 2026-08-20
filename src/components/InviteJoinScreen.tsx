import { useState } from 'react'
import { Loader2, Users } from '../icons'
import type { InviteJoinStatus } from '../hooks/useInviteJoin'

interface InviteJoinScreenProps {
  status: InviteJoinStatus
  onSubmitName: (name: string) => void
  onSkipName: () => void
  isSubmittingName: boolean
}

// ─── InviteJoinScreen ───────────────────────────────────────────────────────
// 🆕 شاشة كاملة تُعرض أثناء استهلاك رابط دعوة (?invite=TOKEN) — بديل بوابة رمز
// الرحلة (TripGate) لمن دخل برابط دعوة بدل رابط رحلة عادي.
//
// حالتان: 'joining' عرض حالة بحت بلا تفاعل (العملية تلقائية بالكامل — انظر
// useInviteJoin)، و'needsName' نموذج اسم من خطوة واحدة يظهر فقط حين زوَّد
// joinViaInvite ملفاً جديداً بلا اسم عرض حقيقي (جلسة مجهولة غالباً) — حتى يرى
// المنظّم من انضمّ فعلاً بدل "مسافر جديد" في قائمته.
export default function InviteJoinScreen({ status, onSubmitName, onSkipName, isSubmittingName }: InviteJoinScreenProps) {
  const [name, setName] = useState('')

  if (status === 'needsName') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs">
          <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-teal-600" />
          </div>
          <p className="text-sm font-bold text-slate-800 text-center mb-1">أهلاً بك في الرحلة!</p>
          <p className="text-xs text-slate-500 text-center mb-5">أدخل اسمك ليظهر للشباب في الرحلة</p>

          <form
            onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmitName(name) }}
            className="space-y-3"
          >
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isSubmittingName}
              placeholder="مثال: سعد الغامدي"
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-base text-slate-800 font-bold text-center focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all placeholder:text-slate-300 placeholder:font-normal disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSubmittingName || !name.trim()}
              className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 active:scale-[0.99] transition-all text-sm shadow-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {isSubmittingName && <Loader2 className="w-4 h-4 animate-spin" />}
              متابعة إلى الرحلة
            </button>
            <button
              type="button"
              onClick={onSkipName}
              disabled={isSubmittingName}
              className="w-full text-slate-400 hover:text-slate-600 font-bold py-1.5 text-xs transition-colors disabled:opacity-40"
            >
              تخطّي، لاحقاً
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6 text-teal-600" />
        </div>
        <p className="text-sm font-bold text-slate-700 mb-3">جارٍ الانضمام إلى الرحلة...</p>
        <Loader2 className="w-5 h-5 text-teal-500 animate-spin mx-auto" />
      </div>
    </div>
  )
}
