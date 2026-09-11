// ─── AccountMenu — شيئان لا أكثر: من أنت، والخروج ────────────────────────────
// 🆕 كانت تجمع أربعة: بطاقة البروفايل، «رحلاتي»، «الدخول بحساب آخر»، والخروج.
//
// ⚠️ **و«رحلاتي» تحديداً لم تكن مكانها هنا إطلاقاً.** هي المسار الرئيسي
// (دخول ← رحلاتي ← الرحلة)، فوضعها داخل قائمة حساب جعل الرجوع لقائمة الرحلات
// يمرّ بـ«حسابي» — أي بالضبط `دخول ← حساب ← … ← رحلات` الذي رفضه صاحب الحساب.
// صارت زرّاً مستقلاً مجاوراً في الهيدر (Header.tsx): نقرة واحدة، نمط زرّ
// الرجوع من المحادثة إلى قائمة المحادثات.
//
// ⚠️ و«الدخول بحساب آخر» حُذف بنافذته وخطّافه كاملاً — انظر docs/DECISIONS.md.
//
// ما بقي هو ما يصنع قائمة حساب فعلاً: بطاقة تقول من أنت وتفتح بروفايلك،
// وتسجيل الخروج. أي بند خامس هنا يجب أن يجيب أولاً: هل هو «حساب» أم مسار؟
import { useEffect, useRef, useState } from 'react'
import { LogOut, ChevronDown, ChevronLeft } from '../icons'
import { haptic } from '../utils/haptics'

interface AccountMenuProps {
  displayName: string | null
  email: string | null
  onShowProfile: () => void
  onSignOut: () => void
}

export default function AccountMenu({
  displayName, email, onShowProfile, onSignOut,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const label = (displayName?.trim() || email?.trim() || '؟')
  const initial = label[0]?.toUpperCase() ?? '؟'

  // إغلاق عند الضغط خارج القائمة أو Escape — نمط قائمة منسدلة قياسي، لا يستحق
  // حِمل useDialogA11y الكامل (حصر تركيز + Bottom Sheet) المصمَّم لمودال كامل.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const runAndClose = (action: () => void) => {
    haptic.light()
    setIsOpen(false)
    action()
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="حسابي"
        className="flex items-center gap-1 bg-teal-800/50 hover:bg-teal-800 text-teal-50 hover:text-white transition-all duration-200 rounded-xl border border-teal-500/30 backdrop-blur-sm shrink-0 min-h-[44px] min-w-[44px] px-1.5 py-1.5"
      >
        <span className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm shrink-0">
          {initial}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="حسابي"
          className="absolute left-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-lg border border-slate-200 py-2 z-[110] text-right"
        >
          {/* 🆕 بطاقة المستخدم نفسها هي زر «بروفايلي» الآن — نمط تطبيقات الجوّال
              الأصلية (إعدادات iOS/Android: بطاقة الحساب العلوية تفتح صفحة الحساب
              مباشرة)، بدل عنصر قائمة منفصل يكرّر نفس المعلومات المعروضة أصلاً هنا. */}
          <button
            type="button" role="menuitem"
            // 🆕 aria-label ثابت: الاسم/البريد داخل الزر بيانات المستخدم المتغيّرة،
            // فالاسم الوصولي (accessible name) يجب ألا يعتمد عليها — aria-label
            // يتجاوز محتوى الزر النصّي في حساب الاسم الوصولي (لهذا لم يتغيّر أي
            // اختبار e2e كان يستهدف عنصر «بروفايلي» سابقاً).
            aria-label="بروفايلي"
            onClick={() => runAndClose(onShowProfile)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors text-right"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800 truncate">{label}</span>
              {email && <span className="block text-xs text-slate-400 truncate">{email}</span>}
            </span>
            <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
          </button>

          <div className="pt-1">
            <button
              type="button" role="menuitem"
              onClick={() => runAndClose(onSignOut)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-4 h-4" /> تسجيل الخروج
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
