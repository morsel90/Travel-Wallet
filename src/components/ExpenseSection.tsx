import { memo, useRef, useState, useCallback, useMemo } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { Plus, Pencil, Trash2, X, Loader2 } from '../icons'
import type { Expense } from '../types'
import { useData } from '../context/DataContext'
import { useUI } from '../context/UIContext'
import { toDisplayNames } from '../utils/participants'
import { EXPENSE_CATEGORIES } from '../constants'
import { splitByShares } from '../utils/calculations'

// دالة تحويل الأرقام الهندية/الشرقية (١٢٣) إلى أرقام غربية (123) تلقائياً
const convertArabicNumerals = (str: string): string => {
  const map: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  return str.replace(/[٠-٩]/g, ch => map[ch] ?? ch);
};

// 🆕 العملات المثبّتة دائماً بأعلى مجموعة "الشائعة" وبهذا الترتيب — بغضّ النظر عن
// استخدامها في الرحلة. الريال أولاً (العملة الأساس)، ثم الأكثر تداولاً للمسافر
// السعودي. تُدمج معها لاحقاً العملات المستخدمة فعلياً في هذه الرحلة (مرتّبة بالتكرار).
const PINNED_CURRENCIES = ['SAR', 'USD', 'EUR', 'AED', 'GBP']

// 1️⃣ مكوّن نموذج تفاصيل المصروف الكامل (Fintech Style)
export const ExpenseForm = memo(() => {
  const { travelers, currencies, ratesUpdatedAt, expenses } = useData()

  const {
    isExpenseFormOpen,
    expenseForm, setExpenseForm,
    isEditingExpense, submitExpense, cancelExpenseForm,
    toggleParticipant, toggleAllParticipants,
  } = useUI()

  // 🆕 منطق فصل العملات لقائمة منسدلة لا تُزدحم مهما بلغ عددها:
  //   • "الشائعة": العملات المثبّتة (PINNED، بترتيب ثابت) + العملات المستخدمة فعلياً
  //     في هذه الرحلة، بحيث تظهر الأكثر استخداماً أولاً — دائماً بأعلى القائمة.
  //   • "جميع العملات": بقية العملات مرتّبة أبجدياً حسب الاسم المعروض.
  // ملاحظة: expenses هنا هي المصاريف النشطة (غير المحذوفة) أصلاً من DataContext،
  // لكن نُبقي فحص currencies[code] لتجاهل أي عملة قديمة لم تعد ضمن القائمة.
  const { popular, others } = useMemo(() => {
    const labelOf = (code: string) => currencies[code]?.label ?? code
    const byLabel = (a: string, b: string) => labelOf(a).localeCompare(labelOf(b), 'ar')

    // عدّ تكرار استخدام كل عملة في مصاريف الرحلة الحالية
    const usage = new Map<string, number>()
    expenses.forEach(exp => {
      if (!exp.currency || !currencies[exp.currency]) return
      usage.set(exp.currency, (usage.get(exp.currency) ?? 0) + 1)
    })

    // مجموعة "الشائعة": المثبّتة أولاً (بترتيبها)، ثم المستخدمة الأكثر تكراراً
    const seen = new Set<string>()
    const p: string[] = []
    PINNED_CURRENCIES.forEach(code => {
      if (currencies[code] && !seen.has(code)) { seen.add(code); p.push(code) }
    })
    ;[...usage.keys()]
      .filter(code => !seen.has(code))
      .sort((a, b) => (usage.get(b)! - usage.get(a)!) || byLabel(a, b))
      .forEach(code => { seen.add(code); p.push(code) })

    // البقية أبجدياً
    const o = Object.keys(currencies)
      .filter(code => !seen.has(code))
      .sort(byLabel)

    return { popular: p, others: o }
  }, [currencies, expenses])

  const amountSAR = useMemo(() => {
    const amount = parseFloat(expenseForm.amount || '0');
    const rate = parseFloat(expenseForm.exchangeRate || '1');
    if (isNaN(amount) || isNaN(rate)) return '0.00';
    return (amount * rate).toFixed(2);
  }, [expenseForm.amount, expenseForm.exchangeRate]);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const converted = convertArabicNumerals(e.target.value);
    const sanitized = converted.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const finalValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setExpenseForm(prev => ({ ...prev, amount: finalValue }));
  }, [setExpenseForm]);

  const handleRateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const converted = convertArabicNumerals(e.target.value);
    const sanitized = converted.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const finalValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setExpenseForm(prev => ({ ...prev, exchangeRate: finalValue }));
  }, [setExpenseForm]);

  const handleCurrencyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const curr = e.target.value;
    setExpenseForm(prev => ({ ...prev, currency: curr, exchangeRate: String(currencies[curr]?.rate ?? 1) }));
  }, [setExpenseForm, currencies]);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setExpenseForm(prev => ({ ...prev, description: e.target.value }));
  }, [setExpenseForm]);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setExpenseForm(prev => ({ ...prev, date: e.target.value }));
  }, [setExpenseForm]);

  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setExpenseForm(prev => ({ ...prev, category: e.target.value }));
  }, [setExpenseForm]);

  const handleToggleSplitMode = useCallback(() => {
    setExpenseForm(prev => {
      if (prev.splitMode === 'custom') {
        return { ...prev, splitMode: 'equal', shares: {} };
      } else {
        const shares = { ...prev.shares };
        prev.participants.forEach(id => { shares[id] = shares[id] ?? 1 });
        return { ...prev, splitMode: 'custom', shares };
      }
    });
  }, [setExpenseForm]);

  const previewShares = useMemo(() => {
    const previewTotal = parseFloat(amountSAR) || 0;
    if (previewTotal <= 0 || expenseForm.participants.length === 0) return [];
    return splitByShares(previewTotal, expenseForm.participants, expenseForm.shares);
  }, [amountSAR, expenseForm.participants, expenseForm.shares]);

  // ⚠️ الخروج المبكر يجب أن يأتي بعد كل الـ hooks (useMemo/useCallback أعلاه) وليس
  // قبلها — وإلا اختلف عدد الـ hooks بين فتح النموذج وإغلاقه فيرمي React خطأ
  // "Rendered more hooks than during the previous render" (مخالفة Rules of Hooks).
  if (!isExpenseFormOpen) return null

  return (
    <div className="p-5 sm:p-6 bg-white">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
        <h3 className="font-bold text-lg text-slate-800">
          {isEditingExpense ? 'تعديل المصروف' : 'تفاصيل المصروف'}
        </h3>
        <button 
          type="button" 
          onClick={cancelExpenseForm} 
          className="flex items-center gap-1 p-1.5 text-slate-400 bg-slate-50 hover:bg-slate-100 hover:text-slate-700 rounded-lg font-bold transition-colors"
          aria-label="إغلاق النموذج"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={submitExpense} className="space-y-5">

        {/* المبلغ والعملة */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">المبلغ</label>
            <input
              type="text"
              inputMode="decimal"
              required 
              value={expenseForm.amount}
              onChange={handleAmountChange}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-lg text-teal-700 font-black focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              dir="ltr"
              aria-label="المبلغ"
            />
          </div>

          <div className="w-[140px]">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">العملة</label>
            <select
              value={expenseForm.currency}
              onChange={handleCurrencyChange}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              aria-label="العملة"
            >
              {popular.length > 0 && (
                <optgroup label="⭐ العملات الشائعة">
                  {popular.map((code: string) => (
                    <option key={code} value={code}>{currencies[code]?.label || code}</option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="جميع العملات (أبجدياً)">
                  {others.map((code: string) => (
                    <option key={code} value={code}>{currencies[code]?.label || code}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* سعر الصرف للعملات الأجنبية */}
        {expenseForm.currency !== 'SAR' && (
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-amber-700">سعر الصرف المستخدَم</label>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                المعادل: {amountSAR} ﷼
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              required
              value={expenseForm.exchangeRate}
              onChange={handleRateChange}
              className="w-full bg-white border border-amber-200 rounded-lg p-2.5 text-base text-amber-900 font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
              aria-label="سعر الصرف"
            />
            <p className="text-[10px] text-amber-600 mt-2 font-medium">
              {ratesUpdatedAt ? `السوق: ${ratesUpdatedAt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}` : 'سعر تقريبي (يمكنك تعديله)'}
            </p>
          </div>
        )}

        {/* الوصف / البيان */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">الوصف / البيان</label>
          <input
            type="text" 
            required 
            placeholder="مثال: وقود، عشاء..." 
            value={expenseForm.description}
            onChange={handleDescriptionChange}
            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-base text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all placeholder:text-slate-300 placeholder:font-normal"
            aria-label="الوصف"
          />
        </div>

        {/* التاريخ والفئة */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <div className="min-w-0">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">التاريخ</label>
            <input
              type="date" 
              required 
              value={expenseForm.date}
              onChange={handleDateChange}
              className="block w-full min-h-[44px] bg-white border border-slate-200 rounded-xl p-2 text-base text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              aria-label="التاريخ"
            />
          </div>

          <div className="min-w-0 relative">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ms-1">الفئة</label>
            <select
              value={expenseForm.category}
              onChange={handleCategoryChange}
              className="block w-full min-h-[44px] bg-white border border-slate-200 rounded-xl p-2 pl-8 text-base text-slate-800 font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              aria-label="الفئة"
            >
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <svg 
              className="pointer-events-none absolute bottom-3 left-3 w-4 h-4 text-slate-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* اختيار المشاركين */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-slate-800">يُقسم على:</label>
            <button 
              type="button" 
              onClick={toggleAllParticipants} 
              className="text-[11px] font-bold text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              {expenseForm.participants.length === travelers.length ? 'إلغاء الكل' : 'تحديد الكل'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {travelers.map(t => {
              const isSelected = expenseForm.participants.includes(t.id)
              return (
                <button
                  key={t.id} 
                  type="button" 
                  onClick={() => toggleParticipant(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    isSelected
                      ? 'bg-teal-600 text-white border border-teal-600 shadow-sm'
                      : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                  }`}
                  aria-pressed={isSelected}
                >
                  {isSelected && <Plus className="w-3.5 h-3.5 rotate-45" />}
                  {t.shortName}
                </button>
              )
            })}
          </div>
        </div>

        {/* التخصيص غير المتساوي للحصص */}
        {expenseForm.participants.length > 0 && (
          <div>
            <button
              type="button"
              onClick={handleToggleSplitMode}
              className="w-full py-3 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {expenseForm.splitMode === 'custom' ? 'العودة للتقسيم بالتساوي' : 'تخصيص التقسيم بنسب مختلفة؟'}
            </button>

            {expenseForm.splitMode === 'custom' && (
              <div className="mt-2 space-y-2 bg-slate-50 border border-slate-100 rounded-xl p-4">
                {expenseForm.participants.map((id, i) => {
                  const traveler = travelers.find(t => t.id === id)
                  if (!traveler) return null
                  const weight = expenseForm.shares[id] ?? 1
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-sm font-bold text-slate-700 ms-1">{traveler.shortName}</span>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={weight}
                          onChange={(e) => {
                            const converted = convertArabicNumerals(e.target.value);
                            const sanitized = converted.replace(/[^0-9.]/g, '');
                            const w = parseFloat(sanitized);
                            setExpenseForm(prev => ({
                              ...prev,
                              shares: { ...prev.shares, [id]: isNaN(w) || w <= 0 ? 1 : w },
                            }));
                          }}
                          className="w-16 bg-slate-50 border border-slate-200 rounded-lg py-1.5 text-base text-center focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none font-bold text-teal-700"
                          aria-label={`حصة ${traveler.shortName}`}
                        />
                        <span className="text-xs font-bold text-slate-400 w-16 text-left" dir="ltr">
                          {(previewShares[i] ?? 0).toFixed(2)} ﷼
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={expenseForm.participants.length === 0}
          className="w-full bg-teal-600 text-white font-bold py-4 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 mt-2 text-base shadow-sm"
        >
          {isEditingExpense ? 'حفظ التعديلات' : 'اعتماد المصروف'}
        </button>
      </form>
    </div>
  )
})

// === إعدادات مكون السحب والبطاقات ===
interface ExpenseListItemProps {
  expense: Expense
}

const SWIPE_MAX_PX = 88
const SWIPE_TRIGGER_PX = 60
// ===================================

// 2️⃣ مكوّن عرض كارت بطاقة المصروف المنفرد في السجل
export const ExpenseListItem = memo(({ expense }: ExpenseListItemProps) => {
  const { isAdmin, currencies, travelers, user } = useData()
  const { startEditExpense, requestDeleteExpense } = useUI()
  const canManage = isAdmin || (user?.uid != null && expense.createdByUid === user.uid)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const axisRef = useRef<'x' | 'y' | null>(null)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (!canManage) return
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    axisRef.current = null
    setIsDragging(true)
  }, [canManage])

  const handleTouchMove = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (!canManage || !touchStartRef.current) return
    const t = e.touches[0]
    const deltaX = t.clientX - touchStartRef.current.x
    const deltaY = t.clientY - touchStartRef.current.y

    if (axisRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
      axisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    }
    if (axisRef.current === 'y') return

    setDragX(Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, deltaX)))
  }, [canManage])

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) { setIsDragging(false); return }
    const finalX = dragX
    const wasHorizontal = axisRef.current === 'x'
    touchStartRef.current = null
    axisRef.current = null
    setIsDragging(false)
    setDragX(0)

    if (!wasHorizontal) return
    if (finalX >= SWIPE_TRIGGER_PX) requestDeleteExpense(expense.id)
    else if (finalX <= -SWIPE_TRIGGER_PX) startEditExpense(expense)
  }, [dragX, expense, startEditExpense, requestDeleteExpense])

  const getCategoryColor = useCallback((cat: string) => {
    const colors: Record<string, string> = {
      'مواصلات':     'bg-sky-50 text-sky-600 border-sky-100',
      'طعام وشراب':  'bg-amber-50 text-amber-600 border-amber-100',
      'إقامة':       'bg-indigo-50 text-indigo-600 border-indigo-100',
      'أنشطة وترفيه': 'bg-purple-50 text-purple-600 border-purple-100',
      'تسوق':        'bg-rose-50 text-rose-600 border-rose-100',
    }
    return colors[cat] || 'bg-teal-50 text-teal-600 border-teal-100'
  }, [])

  const displayAmount = useMemo(() => {
    const num = typeof expense.amount === 'number' ? expense.amount : parseFloat(expense.amount);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }, [expense.amount]);

  const originalAmountDisplay = useMemo(() => {
    if (!expense.currency || expense.currency === 'SAR') return null;
    const num = typeof expense.originalAmount === 'number' ? expense.originalAmount : parseFloat(expense.originalAmount);
    if (isNaN(num)) return null;
    return `${num.toFixed(2)} ${currencies[expense.currency]?.label || expense.currency}`;
  }, [expense.currency, expense.originalAmount, currencies]);

  const shareData = useMemo(() => {
    const names = toDisplayNames(expense.participants, travelers)
    const shareAmounts = expense.shares 
      ? splitByShares(expense.amount, expense.participants, expense.shares)
      : expense.participants.map(() => expense.amount / (expense.participants.length || 1))
    return { names, shareAmounts }
  }, [expense.participants, expense.shares, expense.amount, travelers]);

  return (
    <div className="relative overflow-hidden group border-b border-slate-100 last:border-0 bg-slate-50/30">

      {/* خلفية الألوان أثناء السحب على الجوال */}
      {canManage && (
        <>
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-rose-500 to-rose-600 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] font-bold">حذف</span>
          </div>
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-teal-500 to-teal-600 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
            <Pencil className="w-4 h-4" />
            <span className="text-[10px] font-bold">تعديل</span>
          </div>
        </>
      )}

      {/* واجهة البطاقة القابلة للسحب */}
      <div
        className="relative p-4 sm:p-5 bg-white hover:bg-slate-50/80 transition-colors"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
          ...(canManage ? { touchAction: 'pan-y' } : {}),
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="flex flex-col gap-3.5">

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border shrink-0 shadow-sm ${getCategoryColor(expense.category || 'أخرى')}`}>
                {(expense.category || 'أخرى').charAt(0)}
              </div>

              <div className="min-w-0">
                <h4 className="font-bold text-slate-800 text-base leading-tight truncate mb-1">
                  {expense.description}
                </h4>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{expense.date}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-slate-500">{expense.category || 'أخرى'}</span>
                </div>
              </div>
            </div>

            <div className="text-left shrink-0 flex flex-col items-end gap-1">
              <div className="flex items-baseline gap-1">
                <span className="font-black text-slate-900 text-xl tracking-tight tabular-nums">
                  {displayAmount}
                </span>
                <span className="text-xs font-bold text-slate-500">﷼</span>
              </div>

              {originalAmountDisplay && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50/60 px-1.5 py-0.5 rounded-md border border-amber-100/70 tracking-tight tabular-nums">
                  {originalAmountDisplay}
                </span>
              )}

              {expense._pending && (
                <span className="flex items-center gap-1 text-[9px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-md font-bold border border-teal-100 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> جاري الحفظ
                </span>
              )}
            </div>
          </div>

          {/* كبسولات الحصص */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-50/60 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 ms-1 shrink-0">توزيع الحصص:</span>
            <div className="flex flex-wrap gap-1">
              {shareData.names.map((name: string, i: number) => {
                const participantId = expense.participants[i];
                return (
                  <span 
                    key={participantId} 
                    className="inline-flex items-center gap-1 bg-white border border-slate-200/80 rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm"
                  >
                    <span className="text-slate-700">{name || 'غير معروف'}</span>
                    <span className="text-[10px] text-teal-600 font-black tracking-tight tabular-nums bg-teal-50/50 px-1 rounded">
                      {(shareData.shareAmounts[i] ?? 0).toFixed(0)}﷼
                    </span>
                  </span>
                )
              })}
            </div>
          </div>

        </div>

        {/* عزل أزرار الكمبيوتر عن الجوال لمنع التداخل وحفظ سلاسة السحب */}
        {canManage && (
          <div className="absolute top-1/2 -translate-y-1/2 end-4 hidden md:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 pointer-events-none">
            <button 
              type="button" 
              onClick={() => startEditExpense(expense)} 
              className="pointer-events-auto p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-teal-600 hover:border-teal-200 transition-all shadow-sm hover:shadow-md"
              aria-label="تعديل المصروف"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button 
              type="button" 
              onClick={() => requestDeleteExpense(expense.id)} 
              className="pointer-events-auto p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-all shadow-sm hover:shadow-md"
              aria-label="حذف المصروف"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})