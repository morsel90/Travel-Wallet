import { useState } from 'react'
import { useAccountLink } from '../hooks/useAccountLink'
import { haptic } from '../utils/haptics'
import { Lock, Loader2, AlertTriangle, Mail } from '../icons'
import LinkWithEmailForm from './LinkWithEmailForm'

interface SaveAccountBannerProps {
  /** لا يُعرض شيء لغير المجهولين — الحساب الدائم لا يحتاج ترقية. */
  isAnonymous: boolean
  /** عدد الرحلات المعروضة — يجعل الرسالة ملموسة بدل تحذير عام. */
  tripCount: number
}

// ─── شريط «حفظ الحساب» ───────────────────────────────────────────────────────
//
// ⚠️ ترقية اختيارية لا مطالبة إجبارية. الدخول برمز الرحلة يبقى المسار الكامل
// الافتراضي؛ من يتجاهل هذا الشريط لا يفقد شيئاً اليوم. هذا شرط «الترقية
// السلسة» (Progressive Profiling) وليس تفصيلاً تجميلياً: إجبار التسجيل يقتل
// ميزة المنتج الأساسية — الانضمام لرحلة في ثوانٍ.
//
// موضعه في «رحلاتي» مقصود: هي الشاشة الوحيدة التي يرى فيها المستخدم بالضبط ما
// سيفقده لو مسح بيانات متصفحه، فتصل الرسالة في لحظة لها فيها معنى.
export const SaveAccountBanner = ({ isAnonymous, tripCount }: SaveAccountBannerProps) => {
  // إعادة التحميل بعد النجاح: خريطة trips تغيّرت في التوكن، وuseAuth يقرؤها
  // داخل onAuthStateChanged وحده — وهو لا يُطلَق عند تحديث التوكن. الشاشة هنا
  // بلا نماذج مفتوحة فلا يضيع إدخال.
  const link = useAccountLink(() => window.location.reload())
  const { isLinking, linkError, linkAccount } = link
  // 🆕 من لا يملك حساب Google — أو يتجنّب OAuth — يحتاج بديلاً حقيقياً، لا زخرفة.
  // مطوي افتراضياً: Google تبقى المسار الأسرع لمن يملكها (زرّ واحد بلا نموذج).
  const [showEmailForm, setShowEmailForm] = useState(false)

  if (!isAnonymous) return null

  // ⚠️ بلا هوامش خارجية عمداً: المكوّن يُستهلك في موضعين بتخطيطين مختلفين
  // (الشاشة الرئيسية داخل space-y-6، وTripPicker بهوامشه الخاصة). ترك التباعد
  // لموضع الاستدعاء يمنع تراكم الهوامش في أحدهما.
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-900 font-bold mb-1">
            {tripCount > 0
              ? `رحلاتك (${tripCount}) محفوظة على هذا المتصفح وحده`
              : 'رحلاتك محفوظة على هذا المتصفح وحده'}
          </p>
          <p className="text-xs text-amber-800 leading-relaxed mb-3">
            مسح بيانات المتصفح يفقدك الوصول إليها، وستحتاج رمز كل رحلة من جديد.
            احفظ حسابك لتفتحها من أي جهاز.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { haptic.light(); setShowEmailForm(false); void linkAccount() }}
              disabled={isLinking}
              className="flex items-center gap-2 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-60"
            >
              {isLinking && !showEmailForm
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ الحفظ...</>
                : <>حفظ الحساب عبر Google</>}
            </button>

            {!showEmailForm && (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 underline decoration-dotted underline-offset-2"
              >
                <Mail className="w-3.5 h-3.5" /> أو ببريد إلكتروني
              </button>
            )}
          </div>

          {showEmailForm && <LinkWithEmailForm link={link} onCancel={() => setShowEmailForm(false)} />}

          {/* خطأ Google يُعرض هنا فقط — نموذج البريد يعرض خطأه بنفسه لتفادي التكرار. */}
          {linkError && !showEmailForm && (
            <p className="text-xs text-rose-700 mt-2.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {linkError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
