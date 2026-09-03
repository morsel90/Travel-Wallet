import { memo, useCallback, useState } from 'react'
import { Pencil, Trash2, Plus, X, History, Loader2, UserCheck, FileText } from '../icons'
import type { Traveler, TravelerBalance, PeriodKey } from '../types'
import { useTripData, useTripActions } from '../store/tripStore'
import { matchesTraveler } from '../utils/participants'
// تأكد من مسار استيراد النافذة الجديدة بناءً على مكان حفظك لها
import TravelerProfileModal from './modals/TravelerProfileModal'

/** 🆕 حاضرة فقط في الرحلة الطويلة (انظر App.tsx) — غيابها يعني رحلة قياسية.
 *  البطاقة لا تعرض زرّ خروج بعد الآن: مُمرَّرة إلى TravelerProfileModal التي
 *  تعرضه أسفل «الخلاصة والتسويات» — راجع فتحه (منظّم مصروفاته ثم يقرر)
 *  وموقعه الطبيعي لخروج ذاتي مستقبلاً حين يُربط حساب المنتدَب بمصادقة حقيقية. */
interface LongTermExitProps {
  canManage: boolean
  isBusy: boolean
}

interface TravelerCardProps {
  traveler: TravelerBalance
  longTermExit?: LongTermExitProps
  /** 🆕 محفظة الدورة الحالية لهذا المسافر (مرحّل + حصته من مصاريف الدورة) —
   *  undefined في الرحلة القياسية، فتبقى البطاقة كما كانت بلا حرف. حاضرة في
   *  الرحلة الطويلة فقط (انظر TravelersPanel.tsx). */
  cycleWallet?: number
  /** 🆕 الفترات المتاحة في ملف المسافر — انظر تعليقها في TravelerProfileModal.tsx. */
  periods?: PeriodKey[]
}

// دالة تحويل الأرقام الهندية/الشرقية (١٢٣) إلى أرقام غربية (123) لمنع خطأ الـ NaN
const convertArabicNumerals = (str: string): string => {
  const map: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  return str.replace(/[٠-٩]/g, ch => map[ch] ?? ch);
};

// مكوّن عرض بطاقة رصيد المسافر المنفرد (Traveler Card)
export const TravelerCard = memo(({ traveler, longTermExit, cycleWallet, periods }: TravelerCardProps) => {
  // جلبنا settlements و travelers لدعم بيانات النافذة المنبثقة
  const { isAdmin, isOrganizer, expenses, travelers, user } = useTripData()
  // 🆕 نموذج الهوية الهجين: تمييز بطاقة المستخدم نفسه بين بطاقات بقية المسافرين
  // — traveler.uid يُقارَن لا يُفترض، فمن دون حساب (تصفّح محلي) أو مسافر غير
  // مربوط لا يرى الشارة على أي بطاقة، وهذا صحيح ومقصود.
  const isMine = !!(traveler.uid && user && traveler.uid === user.uid)
  // إجراءات فقط — البطاقة تتكرر لكل مسافر، فلا يجوز أن تشترك في حالة نموذج متقلبة
  const { openDeposit, requestDeleteTraveler, openDepositHistory } = useTripActions()
  
  // حالة التحكم في ظهور نافذة ملف المسافر + التبويب الذي تُفتح عليه — الفتح
  // بالضغط على البطاقة نفسها يبدأ من "الخلاصة" كالمعتاد، أما زر "كشف حسابي"
  // (لصاحب البطاقة وحده) فيفتح مباشرة على "كشف الحساب التفصيلي".
  const [showProfile, setShowProfile] = useState(false)
  const [profileInitialTab, setProfileInitialTab] = useState<'summary' | 'statement'>('summary')

  const openStatement = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setProfileInitialTab('statement')
    setShowProfile(true)
  }, [])
  
  const hasExpenses = expenses.some(e => e.participants.some(p => matchesTraveler(traveler, p)))
  const isNegative = traveler.remaining < 0
  // 🆕 في الرحلة الطويلة، أساس الشريط والنسبة محفظة الدورة الحالية لا إجمالي
  // المودَع التراكمي — ذاك يكبر مع كل ترحيل شهري فيُظهر الشريط شبه فارغ دوماً
  // مهما بلغ إنفاق هذا الشهر (انظر tripCycleBudget أدناه ولماذا cycleWallet
  // undefined = رحلة قياسية بلا أي أثر).
  const tripCycleBudget = cycleWallet ?? traveler.deposited
  const percentage = Math.min(100, Math.max(0, (traveler.remaining / tripCycleBudget) * 100)) || 0

  // استخراج كائن المسافر الأساسي من القائمة
  const baseTraveler: Traveler = travelers.find(t => t.id === traveler.id) ?? traveler

  return (
    <>
      <div
        onClick={() => { setProfileInitialTab('summary'); setShowProfile(true) }}
        // 🆕 لا حدّ افتراضي — بطاقة عائمة تعتمد على shadow-sm/hover:shadow-md وحده
        // للتمايز عن خلفية الصفحة الرمادية، لا خطاً محيطاً. isMine يبقى استثناءً
        // مقصوداً: حدّ تيل واضح تمييزٌ دلالي («بطاقتك أنت»)، لا خط فاصل قائمة.
        className={`bg-white rounded-xl p-3.5 sm:p-4 shadow-sm flex flex-col gap-2.5 relative group transition-all hover:shadow-md cursor-pointer ${
          isMine ? 'border-2 border-teal-300 hover:border-teal-400' : ''
        }`}
      >
        {traveler._pending && (
          <div className="absolute -top-1.5 -right-1.5 bg-teal-500 text-white p-1 rounded-full shadow-sm z-10" title="جارٍ المزامنة...">
            <Loader2 className="w-3 h-3 animate-spin" />
          </div>
        )}

        <div className="flex justify-between items-center gap-3 min-w-0 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
              {traveler.name[0]}
            </div>
            
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
              <span className="font-bold text-slate-800 text-base sm:text-lg truncate min-w-0 leading-tight flex items-center gap-1.5">
                {traveler.name}
                {isMine && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full shrink-0">
                    <UserCheck className="w-3 h-3" /> حسابك
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-500 truncate min-w-0 leading-tight">
                {/* 🆕 محفظة الدورة (مرحّل + مصاريف هذه الدورة) لا إجمالي المودَع
                    التراكمي — ذاك يتضخّم مع كل ترحيل شهري ويوهم بأن رصيداً
                    ضخماً «مودَع الآن» بينما هو مجموع كل الأشهر منذ بداية
                    الرحلة. cycleWallet غائبة تماماً في الرحلة القياسية. */}
                {cycleWallet !== undefined ? 'ميزانية الدورة' : 'المودع'}:{' '}
                <span className="font-bold text-slate-700">
                  {cycleWallet !== undefined ? cycleWallet.toFixed(2) : traveler.deposited} ﷼
                </span>
              </span>
            </div>
          </div>

          {/* 🆕 شارة ناعمة (Soft Badge) — خلفية مُلوَّنة شفافة جداً (rose-50/teal-50)
              بدل خلفية محايدة + حدّ، ونصّ داكن اللون فوقها. نمط Fintech حديث: يوصل
              حالة الرصيد بوضوح دون أن يقرأه المستخدم كرسالة خطأ/تنبيه حرج. */}
          <div className={`text-left shrink-0 px-3 py-1.5 rounded-2xl ${isNegative ? 'bg-rose-50' : 'bg-teal-50'}`}>
            <div className="text-[10px] sm:text-xs font-medium text-slate-400 mb-0.5 text-center">
              {cycleWallet !== undefined ? 'متبقي الدورة' : 'المتبقي'}
            </div>
            <div className={`text-sm sm:text-base font-black tabular-nums text-center leading-none ${isNegative ? 'text-rose-700' : 'text-teal-700'}`} dir="ltr">
              {traveler.remaining.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 🆕 شريط تقدّم نحيف (h-1 = 4px) بلون هادئ بدل خط سفلي عريض صارخ —
            bg-rose-400 لا rose-500: نفس المعلومة بحدّة أقلّ. */}
        <div className="w-full flex items-center gap-2 mt-0.5" dir="ltr" title={`استهلاك ${percentage.toFixed(1)}%`}>
          <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isNegative ? 'bg-rose-400' : 'bg-gradient-to-r from-teal-400 to-teal-600'}`}
              style={{ width: `${isNegative ? 100 : percentage}%` }}
            />
          </div>
        </div>

        {/* 🆕 نموذج الهوية الهجين — زر مباشر لصاحب البطاقة إلى كشف حسابه
            الشخصي. ظاهر دائماً لا خلف التحويم (بخلاف أزرار المسؤول أدناه):
            هذا زر لصاحب الحساب نفسه على جهاز قد يكون لمسياً بلا تحويم أصلاً. */}
        {isMine && (
          <button
            type="button"
            onClick={openStatement}
            className="w-full flex items-center justify-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs py-2 rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> كشف حسابي
          </button>
        )}

        {isAdmin && (
          <div className="flex items-center justify-end gap-1.5 mt-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); openDeposit(traveler); }} 
              title="تعديل الرصيد" 
              className="p-1.5 bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); openDepositHistory(traveler); }} 
              title="سجل التعديلات" 
              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
            >
              <History className="w-4 h-4" />
            </button>
            
            {hasExpenses ? (
              <span
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 flex items-center"
              >
                مربوط بمصاريف
              </span>
            ) : (
               <button
                type="button"
                onClick={(e) => { e.stopPropagation(); requestDeleteTraveler(traveler); }}
                title="حذف المسافر"
                className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* استدعاء النافذة المنبثقة عند النقر على البطاقة */}
      {showProfile && (
        <TravelerProfileModal
          traveler={baseTraveler}
          balance={traveler}
          expenses={expenses}
          settlements={[]}
          periods={periods}
          allTravelers={travelers}
          isAdmin={isAdmin}
          isOrganizer={isOrganizer}
          isSelf={isMine}
          initialTab={profileInitialTab}
          onClose={() => setShowProfile(false)}
          longTermExit={longTermExit ? {
            canManage: longTermExit.canManage,
            isBusy: longTermExit.isBusy,
            // 🆕 يُغلق ملف المسافر أولاً بدل ترك نافذة التأكيد فوق نافذة أخرى —
            // فرصده هنا سواء أنجح الخروج أو أُلغي، بلا حاجة لانتظار تحديث
            // القائمة (onSnapshot) ليختفي الملف من تلقاء نفسه.
            onExit: () => { setShowProfile(false); requestDeleteTraveler(traveler) },
          } : undefined}
        />
      )}
    </>
  )
})

interface AddTravelerFormProps {
  newTravelerName: string
  setNewTravelerName: (v: string) => void
  newTravelerDeposit: string
  setNewTravelerDeposit: (v: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  cancelAddTraveler: () => void
}

// مكوّن نموذج تفاصيل إضافة المسافر الجديد
export const AddTravelerForm = memo(({
  newTravelerName, setNewTravelerName,
  newTravelerDeposit, setNewTravelerDeposit,
  onSubmit, cancelAddTraveler
}: AddTravelerFormProps) => {
  
  const handleDepositChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const converted = convertArabicNumerals(e.target.value);
    const sanitized = converted.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const finalValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setNewTravelerDeposit(finalValue);
  }, [setNewTravelerDeposit]);

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 mt-5 animate-fadeIn">
      <div className="flex justify-between items-center mb-5 pb-3.5 border-b border-slate-100">
        <h3 className="font-bold text-base sm:text-lg text-slate-800">إضافة مسافر جديد</h3>
        <button 
          type="button" 
          onClick={cancelAddTraveler} 
          className="flex items-center gap-1 p-1.5 text-slate-400 bg-slate-50 hover:bg-slate-100 hover:text-slate-700 rounded-lg font-bold transition-colors"
          aria-label="إغلاق النموذج"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">اسم المسافر الجديد</label>
            <input
              type="text" 
              required 
              autoFocus 
              value={newTravelerName}
              onChange={(e) => setNewTravelerName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-base text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all placeholder:text-slate-300 placeholder:font-normal"
              placeholder="مثال: سعد الغامدي"
            />
          </div>
          
          <div className="relative">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">الدفع المسبق (اختياري)</label>
            <div className="relative">
              <input
                type="text" 
                inputMode="decimal" 
                value={newTravelerDeposit}
                onChange={handleDepositChange}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 pl-8 text-base text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all placeholder:text-slate-300 placeholder:font-normal"
                placeholder="0.00"
                dir="ltr"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">﷼</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-teal-600 text-white font-bold py-3.5 rounded-xl hover:bg-teal-700 active:scale-[0.99] transition-all text-base shadow-sm mt-2 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> اعتماد المسافر الجديد
        </button>
      </form>
    </div>
  )
})