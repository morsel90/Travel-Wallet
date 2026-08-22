// 🆕 قائمة حساب موحّدة في الهيدر — تجمع كل ما كان أزراراً منفصلة (رحلاتي،
// بروفايلي، تبديل وضع المسؤول) في نقطة دخول واحدة بنمط تطبيقات جوجل: صورة/حرف
// أول للمستخدم، وقائمة منسدلة عند الضغط. انظر docs/DECISIONS.md للسياق.
import { useEffect, useRef, useState } from 'react'
import { Luggage, Settings, Lock, LogOut, ChevronDown, ChevronLeft } from '../icons'
import { haptic } from '../utils/haptics'

interface AccountMenuProps {
  displayName: string | null
  email: string | null
  isAdmin: boolean
  /** 🆕 منظّم هذه الرحلة تحديداً (لا مسؤول عالمي) — يرى «إدارة الرحلة» أيضاً. نقطة الوصول
   * الوحيدة الآن للوحة الإدارة، بعد إزالة زرّها المكرَّر من ExpensesPanel. */
  isOrganizer: boolean
  /** 🆕 يُمرَّر فقط حين يكون المستخدم عضواً في أكثر من رحلة — لا معنى لعنصر تبديل لمن يملك رحلة واحدة. */
  onShowMyTrips?: () => void
  onShowProfile: () => void
  /** 🆕 فتح لوحة الإدارة — يظهر لمن يملك صلاحية admin (بتسمية «لوحة الإدارة») أو منظّم
   * هذه الرحلة (بتسمية «إدارة الرحلة»). كلاهما نفس الدالة (modals.openTripAdmin). */
  onOpenAdminPanel: () => void
  /** 🆕 تسجيل الدخول بحساب مسؤول منفصل — يظهر فقط لمن لا يملك admin ولا isOrganizer. */
  onAdminSignIn: () => void
  onSignOut: () => void
}

export default function AccountMenu({
  displayName, email, isAdmin, isOrganizer,
  onShowMyTrips, onShowProfile, onOpenAdminPanel, onAdminSignIn, onSignOut,
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
          className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-lg border border-slate-200 py-2 z-[110] text-right"
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

          <div className="py-1">
            {onShowMyTrips && (
              <button
                type="button" role="menuitem"
                onClick={() => runAndClose(onShowMyTrips)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Luggage className="w-4 h-4 text-slate-500" /> رحلاتي
              </button>
            )}

            {isAdmin ? (
              <button
                type="button" role="menuitem"
                onClick={() => runAndClose(onOpenAdminPanel)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-500" /> لوحة الإدارة
              </button>
            ) : isOrganizer ? (
              <button
                type="button" role="menuitem"
                onClick={() => runAndClose(onOpenAdminPanel)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-500" /> إدارة الرحلة
              </button>
            ) : (
              <button
                type="button" role="menuitem"
                onClick={() => runAndClose(onAdminSignIn)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Lock className="w-4 h-4 text-slate-500" /> تسجيل الدخول كمسؤول
              </button>
            )}
          </div>

          <div className="pt-1 border-t border-slate-100">
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
