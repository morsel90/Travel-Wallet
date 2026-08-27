// 🆕 بروفايل المستخدم العام (اسم/بنك) — مستقل عن أي رحلة، وهو **المصدر
// الوحيد** لبيانات البنك المعروضة في كل رحلة ينظّمها هذا الحساب (قراءة حيّة،
// لا نسخة — انظر useOrganizerBankDetails.ts وdocs/DECISIONS.md).
import { useState } from 'react'
import { Save, Loader2, User, Building2, Smartphone } from '../../icons'
import { Modal } from '../Modal'
import type { BankDetails, UserProfile } from '../../types'

interface UserProfileModalProps {
  profile: UserProfile
  isSaving: boolean
  onSave: (patch: { displayName: string; bankDetails: BankDetails }) => Promise<void>
  onClose: () => void
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

type PaymentType = 'bank' | 'wallet'

export default function UserProfileModal({ profile, isSaving, onSave, onClose }: UserProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '')
  // 🆕 نوع الدفع المختار — الحقول غير المختارة تبقى محفوظة محلياً في حالتها
  // الخاصة كي لا يُفقَد ما كتبه المستخدم عند التبديل بين النوعين قبل الحفظ.
  const [paymentType, setPaymentType] = useState<PaymentType>(profile.bankDetails?.paymentType ?? 'bank')
  const [bankName, setBankName] = useState(profile.bankDetails?.bankName ?? '')
  const [beneficiary, setBeneficiary] = useState(profile.bankDetails?.beneficiary ?? '')
  const [iban, setIban] = useState(profile.bankDetails?.iban ?? '')
  const [walletName, setWalletName] = useState(profile.bankDetails?.walletName ?? '')
  const [walletPhone, setWalletPhone] = useState(profile.bankDetails?.walletPhone ?? '')

  const submit = async () => {
    await onSave({
      displayName: displayName.trim(),
      bankDetails: {
        paymentType,
        bankName: bankName.trim(),
        beneficiary: beneficiary.trim(),
        iban: iban.trim().replace(/\s+/g, ''),
        walletName: walletName.trim(),
        walletPhone: walletPhone.trim().replace(/\s+/g, ''),
      },
    })
    onClose()
  }

  return (
    <Modal onClose={onClose} label="بروفايلي">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-4 h-4 text-teal-600" />
        <h3 className="font-bold text-slate-800">بروفايلي</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        بيانات الدفع هنا تظهر مباشرة في كل رحلة تنظّمها — أي تعديل هنا ينعكس
        فوراً على كل تلك الرحلات، بلا حاجة لتعديل كل رحلة على حدة.
      </p>

      <form onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="profile-name">اسمك</label>
          <input
            id="profile-name"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className={inputClass}
          />
        </div>

        <hr className="border-slate-100" />

        <div>
          <label className={labelClass}>طريقة استلام التحويلات</label>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPaymentType('bank')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
                paymentType === 'bank' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> حساب بنكي
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('wallet')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
                paymentType === 'wallet' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> محفظة رقمية
            </button>
          </div>
        </div>

        {paymentType === 'bank' ? (
          <>
            <div>
              <label className={labelClass} htmlFor="profile-bank-name">اسم البنك</label>
              <input
                id="profile-bank-name"
                type="text"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-bank-beneficiary">اسم المستفيد</label>
              <input
                id="profile-bank-beneficiary"
                type="text"
                value={beneficiary}
                onChange={e => setBeneficiary(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-bank-iban">رقم الآيبان (IBAN)</label>
              <input
                id="profile-bank-iban"
                type="text"
                dir="ltr"
                value={iban}
                onChange={e => setIban(e.target.value)}
                placeholder="SA0000000000000000000000"
                className={`${inputClass} text-right tabular-nums`}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">تُحذف المسافات تلقائياً عند الحفظ.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelClass} htmlFor="profile-wallet-name">اسم المحفظة</label>
              <input
                id="profile-wallet-name"
                type="text"
                value={walletName}
                onChange={e => setWalletName(e.target.value)}
                placeholder="مثال: stc pay، برق، بنفت"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-wallet-phone">رقم الجوال</label>
              <input
                id="profile-wallet-phone"
                type="tel"
                dir="ltr"
                value={walletPhone}
                onChange={e => setWalletPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                className={`${inputClass} text-right tabular-nums`}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">تُحذف المسافات تلقائياً عند الحفظ.</p>
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl font-bold transition-colors disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold transition-colors"
          >
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}
