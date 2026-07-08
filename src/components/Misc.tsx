import { Building2, Copy, Check } from '../icons'

interface BankDetails {
  bankName: string
  beneficiary: string
  iban: string
}

interface BankDetailsCardProps {
  bankDetails: BankDetails
  copied: boolean
  onCopy: () => void
}

export const BankDetailsCard = ({ bankDetails, copied, onCopy }: BankDetailsCardProps) => (
  <section className="bg-slate-800 rounded-2xl p-5 text-slate-100 shadow-lg">
    <div className="flex items-center gap-2 mb-4">
      <Building2 className="w-5 h-5 text-teal-300" />
      <h2 className="text-md font-bold">الحساب المعتمد</h2>
    </div>
    <div className="space-y-3 text-sm">
      <div><p className="text-slate-400 text-xs">البنك</p><p>{bankDetails.bankName}</p></div>
      <div><p className="text-slate-400 text-xs">الاسم</p><p>{bankDetails.beneficiary}</p></div>
      <div className="bg-slate-900/50 p-3 rounded-lg flex justify-between items-center mt-2">
        <div className="overflow-hidden">
          <p className="text-slate-400 text-[10px]">الآيبان</p>
          <p className="font-mono text-teal-300 text-[11px] truncate" dir="ltr">{bankDetails.iban}</p>
        </div>
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-md transition-colors shrink-0 ms-2 text-xs font-bold text-white"
        >
          {copied
            ? <><Check className="w-3.5 h-3.5" /> تم</>
            : <><Copy  className="w-3.5 h-3.5" /> نسخ</>
          }
        </button>
      </div>
    </div>
  </section>
)
