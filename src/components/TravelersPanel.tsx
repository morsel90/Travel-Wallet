import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { Traveler, TravelerBalance } from '../types'
import { TravelerCard, AddTravelerForm } from './TravelerSection'
import { TravelerCardSkeleton } from './Skeleton'
import EmptyState from './EmptyState'
import { Users, Plus } from '../icons'

/** حقول نموذج إضافة مسافر — مجمّعة لأنها تُمرَّر ككتلة واحدة إلى AddTravelerForm. */
export interface TravelerFormProps {
  name: string
  setName: Dispatch<SetStateAction<string>>
  deposit: string
  setDeposit: Dispatch<SetStateAction<string>>
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

/** 🆕 مصدرها useAppCoordinator.longTerm — undefined في الرحلة القياسية، فلا
 *  تُمرَّر شيئاً إلى TravelerCard ولا يظهر زرّ الخروج بحرف. */
interface LongTermExitProps {
  canManage: boolean
  isBusy: boolean
}

interface TravelersPanelProps {
  isInitialLoading: boolean
  isAdmin: boolean
  activeTravelers: Traveler[]
  balances: TravelerBalance[]
  isAddingTraveler: boolean
  onStartAddTraveler: () => void
  travelerForm: TravelerFormProps
  longTermExit?: LongTermExitProps
}

// ─── قسم أرصدة المسافرين ──────────────────────────────────────────────────────
// عرضي بالكامل: لا يقرأ سياقاً ولا يكتب إلى Firestore. TravelerCard وحده يقرأ
// من DataContext/UIActionsContext كما كان — لم يتغيّر شيء في استهلاكه للسياق.
export const TravelersPanel = ({
  isInitialLoading, isAdmin, activeTravelers, balances,
  isAddingTraveler, onStartAddTraveler, travelerForm, longTermExit,
}: TravelersPanelProps) => (
  <section id="travelers-section" className="scroll-mt-24">
    <div className="flex justify-between items-center mb-4 px-1">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <Users className="w-5 h-5 text-slate-500" /> أرصدة المسافرين
        {!isInitialLoading && (
          <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full tabular-nums">
            {activeTravelers.length}
          </span>
        )}
      </h2>
    </div>

    {!isInitialLoading && activeTravelers.length === 0 && !isAddingTraveler ? (
      <EmptyState
        Icon={Users}
        title="لا يوجد مسافرون بعد"
        description="أضف المسافرين المشاركين في الرحلة لتتمكّن من توزيع المصاريف وحساب من يدين لمن."
        actionLabel={isAdmin ? 'إضافة أول مسافر' : undefined}
        onAction={isAdmin ? onStartAddTraveler : undefined}
        ActionIcon={isAdmin ? Plus : undefined}
      />
    ) : (
      <div className={`grid gap-3 sm:gap-4 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
        {isInitialLoading
          ? Array.from({ length: 4 }, (_, i) => <TravelerCardSkeleton key={i} />)
          : balances.map(traveler => (
              <TravelerCard key={traveler.id} traveler={traveler} longTermExit={longTermExit} />
            ))
        }

        {isAdmin && !isAddingTraveler && !isInitialLoading && (
          <button
            type="button"
            onClick={onStartAddTraveler}
            className="border-2 border-dashed border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 rounded-xl p-4 flex flex-row sm:flex-col items-center justify-center gap-3 text-slate-500 hover:text-teal-600 transition-all shadow-sm bg-slate-50/10 group cursor-pointer min-h-[76px] sm:min-h-[120px]"
          >
            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-teal-100 flex items-center justify-center text-slate-600 group-hover:text-teal-700 transition-colors shrink-0 shadow-sm">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold">إضافة مسافر جديد</span>
          </button>
        )}
      </div>
    )}

    {isAddingTraveler && (
      <AddTravelerForm
        newTravelerName={travelerForm.name}
        setNewTravelerName={travelerForm.setName}
        newTravelerDeposit={travelerForm.deposit}
        setNewTravelerDeposit={travelerForm.setDeposit}
        onSubmit={travelerForm.onSubmit}
        cancelAddTraveler={travelerForm.onCancel}
      />
    )}
  </section>
)
