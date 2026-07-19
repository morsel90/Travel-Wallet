import { useState } from 'react'
import { Building2, Copy, Check, Share2 } from '../icons'
import { haptic } from '../utils/haptics'
import { cn } from '../utils/cn'

interface BankDetails {
  bankName: string
  beneficiary: string
  iban: string
}

interface BankDetailsCardProps {
  bankDetails: BankDetails
}

// 🆕 بطاقة الحساب البنكي — تصميم مينيمال بلمسة واحدة للنسخ: كل حقل (الآيبان،
// المستفيد) زر كامل العرض بدل أيقونة صغيرة، لسهولة اللمس على الجوال. اسم البنك
// يُعرض في الرأس كعنوان غير قابل للنسخ (نادراً ما يُنسخ بمفرده)، مع زر مشاركة
// يستخدم Web Share API الأصلي ويسقط إلى نسخ النص كاملاً عند عدم توفّره.
//
// ⚠️ ملاحظات تكييف عن التصميم المُقترَح أصلاً:
// - أُبقي على لون التطبيق الأساسي (teal) بدل indigo لتبقى البطاقة متّسقة مع
//   بقية الواجهة (الأزرار، الهيدر، EmptyState تستخدم teal بالكامل).
// - استُبدلت مسافات pl-2/ml-2 الفيزيائية بـ gap على الحاوية Flex، لأن التطبيق
//   بأكمله dir="rtl" (انظر index.html) ويعتمد أصلاً على خصائص منطقية
//   (ms-*/ps-*/gap-*) في كل مكان — الهوامش الفيزيائية لا تنعكس تلقائياً مع RTL.
// - تنظيف المسافات (إزالة الفراغات) عند النسخ يُطبَّق على الآيبان فقط، وليس
//   على اسم المستفيد — تطبيقه على الاسم كان سيُنتج نسخاً خاطئاً كـ"أحمدالغامدي".
export const BankDetailsCard = ({ bankDetails }: BankDetailsCardProps) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = (text: string, field: string, stripSpaces = false) => {
    const textToCopy = stripSpaces ? text.replace(/\s+/g, '') : text
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        haptic.light()
        haptic.flash() // ومضة نجاح صريحة عند النسخ
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
      })
      .catch(() => {})
  }

  const handleShare = () => {
    const text = `🏦 البنك: ${bankDetails.bankName}\n👤 المستفيد: ${bankDetails.beneficiary}\n📋 الآيبان: ${bankDetails.iban}`
    if (navigator.share) {
      navigator.share({ title: 'تفاصيل التحويل البنكي', text })
        .then(() => { haptic.success(); haptic.flash() }) // ومضة نجاح صريحة عند المشاركة
        .catch(() => {}) // إلغاء المستخدم للمشاركة — تجاهل صامت
    } else {
      navigator.clipboard.writeText(text)
        .then(() => {
          haptic.success()
          haptic.flash()
          setCopiedField('share')
          setTimeout(() => setCopiedField(null), 2000)
        })
        .catch(() => {})
    }
  }

  // تقسيم الآيبان بمسافات رفيعة كل 4 خانات لتحسين القراءة (لا تؤثر على النسخ
  // الفعلي — handleCopy يستخدم bankDetails.iban الخام مع stripSpaces).
  const formatIBAN = (iban: string) => {
    const cleaned = iban.replace(/\s+/g, '')
    return cleaned.replace(/(.{4})/g, '$1 ').trim()
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 shadow-sm select-none">

      {/* رأس البطاقة: اسم البنك (عرض فقط) وزر المشاركة */}
      <div className="flex items-center justify-between gap-2 pb-3.5 mb-4 border-b border-slate-200">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] text-teal-700 font-bold uppercase tracking-wider mb-0.5">البنك المستلم</span>
            <h2 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
              {bankDetails.bankName}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-100 text-[11px] text-teal-700 font-bold active:scale-95 transition-all shrink-0 hover:bg-teal-100"
        >
          {copiedField === 'share'
            ? <Check className="w-3.5 h-3.5 text-emerald-600" />
            : <Share2 className="w-3.5 h-3.5" />
          }
          مشاركة
        </button>
      </div>

      {/* حقل الآيبان */}
      <div className="mb-4">
        <span className="block text-[10px] text-slate-500 font-medium tracking-wide mb-1 px-1">رقم الآيبان (IBAN)</span>
        <button
          type="button"
          onClick={() => handleCopy(bankDetails.iban, 'iban', true)}
          title="نسخ الآيبان"
          className={cn(
            'w-full flex items-center justify-between gap-2 p-3 rounded-xl transition-all duration-150 text-right outline-none',
            'border active:scale-[0.98]',
            copiedField === 'iban'
              ? 'bg-teal-50 border-teal-200 text-teal-700'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          )}
        >
          <span
            className={cn(
              'font-mono text-xs sm:text-[13px] font-semibold tracking-wider transition-colors',
              copiedField === 'iban' ? 'text-teal-700' : 'text-slate-900'
            )}
            dir="ltr"
          >
            {formatIBAN(bankDetails.iban)}
          </span>

          <div className="shrink-0">
            {copiedField === 'iban'
              ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">تم النسخ</span>
              : <Copy className="w-4 h-4 text-slate-400" />
            }
          </div>
        </button>
      </div>

      {/* حقل اسم المستفيد */}
      <div>
        <span className="block text-[10px] text-slate-500 font-medium tracking-wide mb-1 px-1">المستفيد</span>
        <button
          type="button"
          onClick={() => handleCopy(bankDetails.beneficiary, 'beneficiary')}
          title="نسخ اسم المستفيد"
          className={cn(
            'w-full flex items-center justify-between gap-2 p-3 rounded-xl transition-all duration-150 text-right outline-none',
            'border active:scale-[0.98]',
            copiedField === 'beneficiary'
              ? 'bg-teal-50 border-teal-200 text-teal-700'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          )}
        >
          <span className={cn(
            'text-xs font-semibold truncate min-w-0 transition-colors',
            copiedField === 'beneficiary' ? 'text-teal-700' : 'text-slate-900'
          )}>
            {bankDetails.beneficiary}
          </span>

          <div className="shrink-0">
            {copiedField === 'beneficiary'
              ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">تم النسخ</span>
              : <Copy className="w-4 h-4 text-slate-400" />
            }
          </div>
        </button>
      </div>
    </section>
  )
}
