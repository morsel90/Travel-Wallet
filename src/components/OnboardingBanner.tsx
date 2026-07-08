import { useEffect, useState } from 'react'
import { Info, X } from '../icons'

// ─── OnboardingBanner ─────────────────────────────────────────────────────────
// شريط ترحيب قصير يظهر مرة واحدة فقط لكل جهاز (يُحفظ في localStorage)، يشرح
// معنى الأرقام الأساسية (الدفع المسبق / المتبقي) ودور "وضع المسؤول"، ثم يمكن
// إغلاقه نهائيًا. لا يعيق أي إجراء ولا يحتاج أي حالة خادم.
const STORAGE_KEY = 'travelapp_onboarding_dismissed_v1'

const OnboardingBanner = () => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setShow(true)
    } catch {
      // localStorage غير متاح (وضع خاص أو صلاحيات متصفح)، لا داعي لإظهار الشريط حينها
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* تجاهل بصمت */ }
  }

  if (!show) return null

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
      <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs sm:text-sm text-teal-900 space-y-1.5">
        <p>
          <span className="font-bold">الدفع المسبق</span> هو ما دفعه كل مسافر مقدمًا كوديعة، و
          <span className="font-bold"> المتبقي</span> هو هذا المبلغ ناقص نصيبه من المصاريف المشتركة حتى الآن.
        </p>
        <p>
          <span className="font-bold">وضع المسؤول</span> (الزر أعلى الصفحة) مخصص لمنظّم الرحلة فقط، لتعديل المصاريف وإدارة المسافرين والودائع.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إغلاق شريط الترحيب"
        className="text-teal-400 hover:text-teal-600 transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default OnboardingBanner
