import { useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, Check } from '../icons'
import { Modal } from './Modal'

interface QuickAddFabProps {
  // 🆕 يُخفى أثناء Skeleton Loading الأول (لا فائدة قبل توفّر قائمة المسافرين
  // الفعلية) وأثناء فتح نموذج الإضافة/التعديل الكامل (ExpenseForm) — تفادياً
  // لوجود إضافتين متزامنتين على الشاشة قد تُربكان المستخدم.
  visible: boolean
  onQuickAdd: (description: string, amount: number) => string | null
}

// ─── Quick Add (FAB) ─────────────────────────────────────────────────────────
// 🆕 زر عائم واحد فقط — بلا أي قائمة إجراءات متفرّعة أو أزرار إضافية بجانبه —
// في الزاوية السفلية اليمنى، يفتح نموذجاً مختصراً جداً (وصف + مبلغ فقط) عبر
// نفس مكوّن Bottom Sheet المشترك (Modal.tsx). كل شيء آخر (التاريخ، العملة،
// المشاركون، الفئة) افتراضي بالكامل — انظر handleQuickAddExpense في
// useExpenseActions.ts لتفاصيل القيم الافتراضية بالضبط.
//
// مستقل تماماً عن ExpenseForm ولا يشارك حالته (newExpense) — مسار إدخال منفصل
// ومقصود أن يبقى بسيطاً جداً لتسجيل مصروف أثناء التنقّل دون فتح القسم الكامل.
// isOpen حالة داخلية خاصة بهذا المكوّن (لا تحتاج رفعها لـ App.tsx)، لذا
// <AnimatePresence> هنا محلي أيضاً — يكفي لتشغيل حركة إغلاق Bottom Sheet
// (انظر شرح AnimatePresence الكامل في components/Modal.tsx).
const QuickAddFab = ({ visible, onQuickAdd }: QuickAddFabProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setIsOpen(false)
    setDescription('')
    setAmount('')
    setError(null)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const result = onQuickAdd(description, parseFloat(amount))
    if (result) { setError(result); return } // فشل (تحقّق/حد معدّل) — نبقي النموذج مفتوحاً برسالة واضحة
    close() // نجاح — التوست وإغلاق Firestore الفعلي يحدثان داخل handleQuickAddExpense نفسها
  }

  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="إضافة مصروف سريعة"
        title="إضافة سريعة"
        className="fixed bottom-6 right-6 z-[90] w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-xl flex items-center justify-center transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <Modal key="quick-add" maxWidth="max-w-xs" onClose={close}>
            <h3 className="font-bold mb-4">إضافة سريعة</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text" required autoFocus value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="الوصف — مثال: عشاء"
                className="w-full border rounded-xl p-3 focus:ring-2 outline-none"
              />
              <input
                type="number" required min="0.01" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="المبلغ (ريال)"
                className="w-full border rounded-xl p-3 focus:ring-2 outline-none font-bold"
              />
              <p className="text-[11px] text-slate-400">
                يُقسَّم بالتساوي على كل المسافرين النشطين، بتاريخ اليوم وفئة "أخرى" — يمكن تعديل التفاصيل لاحقاً من سجل المصاريف.
              </p>
              {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="submit" className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 text-white py-2.5 rounded-xl font-bold">
                  <Check className="w-4 h-4" /> إضافة
                </button>
                <button type="button" onClick={close} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold">
                  إلغاء
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}

export default QuickAddFab
