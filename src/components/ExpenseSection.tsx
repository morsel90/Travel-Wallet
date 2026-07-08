import { memo, useRef, useState } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { Plus, Pencil, Trash2, X, Loader2 } from '../icons'
import type { Expense } from '../types'
import { useData } from '../context/DataContext'
import { useUI } from '../context/UIContext'
import { toDisplayNames } from '../utils/participants'
import { EXPENSE_CATEGORIES } from '../constants'
import { splitByShares } from '../utils/calculations'

export const ExpenseForm = memo(() => {
  const { travelers, currencies, ratesUpdatedAt } = useData()
  
  // تقسيم السياق: سحب حالة الواجهة والإجراءات
  const {
    isExpenseFormOpen, openExpenseForm,
    expenseForm, setExpenseForm,
    isEditingExpense, submitExpense, cancelExpenseForm,
    toggleParticipant, toggleAllParticipants,
  } = useUI()

  if (!isExpenseFormOpen) {
    return (
      <button onClick={openExpenseForm} className="w-full p-4 flex items-center justify-center gap-2 text-teal-600 font-bold hover:bg-teal-50 transition-colors">
        <Plus className="w-4 h-4" /> إضافة مصروف جديد
      </button>
    )
  }

  const amountSAR = (parseFloat(expenseForm.amount || '0') * parseFloat(expenseForm.exchangeRate || '1')).toFixed(2)

  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">{isEditingExpense ? 'تعديل المصروف' : 'تسجيل مصروف'}</h3>
        <button onClick={cancelExpenseForm} className="flex items-center gap-1 text-slate-400 text-sm hover:text-slate-600 font-bold">
          <X className="w-4 h-4" /> إلغاء
        </button>
      </div>
      <form onSubmit={submitExpense} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">التاريخ</label>
          <input
            type="date" required value={expenseForm.date}
            onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">المبلغ</label>
            <input
              type="number" required min="0.01" step="0.01" value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <div className="w-[110px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">العملة</label>
            <select
              value={expenseForm.currency}
              onChange={(e) => {
                const curr = e.target.value
                setExpenseForm({
                  ...expenseForm,
                  currency: curr,
                  exchangeRate: String(currencies[curr]?.rate ?? 1),
                })
              }}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
            >
              {Object.keys(currencies).map(key => (
                <option key={key} value={key}>{currencies[key].label}</option>
              ))}
            </select>
          </div>
        </div>

        {expenseForm.currency !== 'SAR' && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <label className="block text-xs font-medium text-amber-700 mb-1">سعر الصرف</label>
            <input
              type="number" required min="0.0001" step="0.0001" value={expenseForm.exchangeRate}
              onChange={(e) => setExpenseForm({ ...expenseForm, exchangeRate: e.target.value })}
              className="w-full border border-amber-200 rounded-md p-1.5 text-sm mb-2 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <span className="text-xs text-amber-600">المعادل: {amountSAR} ريال</span>
            <p className="text-[10px] text-amber-500 mt-1">
              {ratesUpdatedAt
                ? `سعر صرف حي، آخر تحديث ${ratesUpdatedAt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`
                : 'تعذر جلب الأسعار الحية، يتم استخدام سعر تقريبي ويمكن تعديله يدويًا'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">الوصف / البيان</label>
          <input
            type="text" required placeholder="مثال: وقود، عشاء..." value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>

        {/* 🆕 فئة المصروف — تُستخدم في الرسم البياني الدائري لتوزيع المصاريف حسب الفئة */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">الفئة</label>
          <select
            value={expenseForm.category}
            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
          >
            {EXPENSE_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">المشاركون:</label>
            <button type="button" onClick={toggleAllParticipants} className="text-[11px] text-teal-600 font-bold hover:underline">
              {expenseForm.participants.length === travelers.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {travelers.map(t => {
              const isSelected = expenseForm.participants.includes(t.id)
              return (
                <button
                  key={t.id} type="button"
                  onClick={() => toggleParticipant(t.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    isSelected
                      ? 'bg-teal-100 text-teal-700 border border-teal-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {isSelected && <Plus className="w-3 h-3 rotate-45" />}
                  {t.shortName}
                </button>
              )
            })}
          </div>
        </div>

        {/* 🆕 تقسيم غير متساوٍ — مخفي افتراضياً (تقسيم بالتساوي كما هو الحال
            دائماً)؛ يظهر فقط عند الضغط على الزر، حفاظاً على بساطة الواجهة
            للاستخدام العادي. انظر splitByShares في utils/calculations.ts. */}
        {expenseForm.participants.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => {
                if (expenseForm.splitMode === 'custom') {
                  setExpenseForm({ ...expenseForm, splitMode: 'equal', shares: {} })
                } else {
                  const shares = { ...expenseForm.shares }
                  expenseForm.participants.forEach(id => { shares[id] = shares[id] ?? 1 })
                  setExpenseForm({ ...expenseForm, splitMode: 'custom', shares })
                }
              }}
              className="text-[11px] text-teal-600 font-bold hover:underline"
            >
              {expenseForm.splitMode === 'custom' ? 'إلغاء تخصيص التقسيم (رجوع للتقسيم بالتساوي)' : 'تخصيص التقسيم (غير متساوٍ)'}
            </button>

            {expenseForm.splitMode === 'custom' && (() => {
              const previewTotal = parseFloat(amountSAR) || 0
              const previewShares = splitByShares(previewTotal, expenseForm.participants, expenseForm.shares)
              return (
                <div className="mt-3 space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] text-slate-400 mb-1">
                    حدّد وزن حصة كل شخص (1 = حصة عادية، 2 = ضعف الحصة، وهكذا)
                  </p>
                  {expenseForm.participants.map((id, i) => {
                    const traveler = travelers.find(t => t.id === id)
                    if (!traveler) return null
                    const weight = expenseForm.shares[id] ?? 1
                    return (
                      <div key={id} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600">{traveler.shortName}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0.1" step="0.5" value={weight}
                            onChange={(e) => {
                              const w = parseFloat(e.target.value)
                              setExpenseForm({
                                ...expenseForm,
                                shares: { ...expenseForm.shares, [id]: isNaN(w) || w <= 0 ? 1 : w },
                              })
                            }}
                            className="w-16 border border-slate-200 rounded-md p-1 text-xs text-center focus:ring-2 focus:ring-teal-500 outline-none"
                          />
                          <span className="text-[10px] text-slate-400 w-16 text-left" dir="ltr">
                            {(previewShares[i] ?? 0).toFixed(2)} ﷼
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        <button
          type="submit"
          disabled={expenseForm.participants.length === 0}
          className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {isEditingExpense ? 'حفظ التعديلات' : 'اعتماد المصروف'}
        </button>
      </form>
    </div>
  )
})

interface ExpenseListItemProps {
  expense: Expense
}

// 🆕 Swipe Actions: أقصى مسافة سحب مسموحة (px) قبل التوقّف عن التتبّع، وحدّ
// التفعيل (px) الذي إن تجاوزه السحب عند رفع الإصبع يُنفَّذ الإجراء تلقائياً.
// أقل من الحدّ = يعود العنصر لمكانه دون أي تنفيذ (سحب "ملغى").
const SWIPE_MAX_PX = 88
const SWIPE_TRIGGER_PX = 60

export const ExpenseListItem = memo(({ expense }: ExpenseListItemProps) => {
  const { isAdmin, currencies, travelers, user } = useData()
  const { startEditExpense, requestDeleteExpense } = useUI()
  // 🆕 صاحب المصروف (نفس الجهاز/الجلسة اللي أضافه) يقدر يعدّله أو يحذفه بنفسه،
  // بالإضافة للمسؤول كالمعتاد. المصاريف القديمة بدون createdByUid تبقى admin-only.
  const canManage = isAdmin || (!!user && !!expense.createdByUid && expense.createdByUid === user.uid)

  // 🆕 Swipe Actions: سحب لليمين = تعديل (يكشف شريط teal على اليسار خلف
  // المحتوى)، سحب لليسار = حذف (يكشف شريط rose على اليمين). التنفيذ الفعلي
  // يحدث فقط عند رفع الإصبع إن تجاوز السحب SWIPE_TRIGGER_PX — وليس أثناء
  // السحب نفسه — لتفادي تنفيذ غير مقصود. الحذف يستدعي requestDeleteExpense
  // نفسها المستخدَمة سابقاً مع الزر (تفتح ConfirmModal كالمعتاد، فالتأكيد
  // مضمون سواء أتى الطلب من السحب أو من زر الفأرة أدناه).
  // touch-action: pan-y على الحاوية يترك التمرير الرأسي للمتصفح تلقائياً
  // (مهم داخل قائمة react-virtuoso) ويمرّر لنا فقط حركة الإصبع الأفقية.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const axisRef = useRef<'x' | 'y' | null>(null)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!canManage) return
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    axisRef.current = null
    setIsDragging(true)
  }

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!canManage || !touchStartRef.current) return
    const t = e.touches[0]
    const deltaX = t.clientX - touchStartRef.current.x
    const deltaY = t.clientY - touchStartRef.current.y

    // لا نحدّد اتجاه السحب (أفقي أم رأسي) إلا بعد حركة كافية لتتضح النية —
    // يمنع اهتزازاً بصرياً بسيطاً من إلغاء التمرير الرأسي الطبيعي بالخطأ.
    if (axisRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
      axisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    }
    if (axisRef.current === 'y') return // تمرير رأسي عادي — لا نتدخّل إطلاقاً

    setDragX(Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, deltaX)))
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current) { setIsDragging(false); return }
    const finalX = dragX
    const wasHorizontal = axisRef.current === 'x'
    touchStartRef.current = null
    axisRef.current = null
    setIsDragging(false)
    setDragX(0) // يعود العنصر لمكانه فوراً (متفائل) بصرف النظر عن النتيجة

    if (!wasHorizontal) return
    if (finalX >= SWIPE_TRIGGER_PX) startEditExpense(expense)
    else if (finalX <= -SWIPE_TRIGGER_PX) requestDeleteExpense(expense.id)
  }

  return (
    <div className="relative overflow-hidden group">
      {/* 🆕 شريطا الإجراءات المخفيّان خلف المحتوى — ينكشفان فقط أثناء السحب الفعلي */}
      {canManage && (
        <>
          <div className="absolute inset-y-0 left-0 w-24 bg-teal-500 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
            <Pencil className="w-4 h-4" />
            <span className="text-[10px] font-bold">تعديل</span>
          </div>
          <div className="absolute inset-y-0 right-0 w-24 bg-rose-500 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] font-bold">حذف</span>
          </div>
        </>
      )}

      <div
        className="relative p-4 bg-white hover:bg-slate-50 transition-colors"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s ease',
          touchAction: canManage ? 'pan-y' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-slate-800">{expense.description}</span>
              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-medium">{expense.date}</span>
              {/* 🆕 شارة الفئة — "أخرى" للمصاريف القديمة بلا فئة محفوظة */}
              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                {expense.category || 'أخرى'}
              </span>
              {/* 🆕 شارة "جارٍ المزامنة" — تظهر ريثما يؤكّد الخادم الكتابة المتفائلة (_pending من useExpenses) */}
              {expense._pending && (
                <span className="flex items-center gap-1 text-[10px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full font-medium">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> جارٍ المزامنة
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              بين: {(() => {
                const names = toDisplayNames(expense.participants, travelers)
                // 🆕 مصروف بتقسيم غير متساوٍ — نعرض حصة كل شخص بجانب اسمه بدل
                // قائمة أسماء مجرّدة، حتى يتضح فوراً أن التقسيم ليس بالتساوي
                if (!expense.shares) return names.join('، ')
                const shareAmounts = splitByShares(expense.amount, expense.participants, expense.shares)
                return names.map((name, i) => `${name} (${(shareAmounts[i] ?? 0).toFixed(2)})`).join('، ')
              })()}
            </p>
            {expense.currency && expense.currency !== 'SAR' && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                المبلغ الأصلي: {expense.originalAmount.toFixed(2)} {currencies[expense.currency]?.label ?? expense.currency}
              </p>
            )}
          </div>
          <span className="font-bold text-rose-600 ms-4 shrink-0">{expense.amount.toFixed(2)} ريال</span>
        </div>

        {/* 🆕 بديل سطح المكتب (فأرة بلا لمس): زرّا تعديل/حذف مضغوطان (أيقونة فقط، بلا
            نص) يظهران فقط عند تمرير المؤشر فوق العنصر (أو التركيز عليه بلوحة
            المفاتيح) — بلا تخصيص أي مساحة أفقية دائمة في التخطيط، وبنفس صلاحية
            canManage المستخدمة أعلاه. */}
        {canManage && (
          <div className="absolute top-3 end-3 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
            <button
              onClick={() => startEditExpense(expense)}
              aria-label="تعديل المصروف"
              className="p-1.5 rounded-md bg-teal-100 text-teal-700 hover:bg-teal-600 hover:text-white transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => requestDeleteExpense(expense.id)}
              aria-label="حذف المصروف"
              className="p-1.5 rounded-md bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})