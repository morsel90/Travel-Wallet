import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import TravelerProfileModal from './TravelerProfileModal'
import type { DepositLogEntry, Expense, Traveler, TravelerBalance } from '../../types'
import { useDepositLogs } from '../../hooks/useDepositLogs'

// 🆕 useDepositLogs يقرأ Firestore حقيقياً (getDocs) — يُستبدل هنا بمُتحكَّم به
// يدوياً، فهذا اختبار تكامل مكوّن/دمج (canViewDepositLogs → الخط الزمني)، لا
// اختبار صلاحيات Firestore نفسها (ذاك في tests/firestore-rules).
vi.mock('../../hooks/useDepositLogs')
const mockedUseDepositLogs = vi.mocked(useDepositLogs)

const traveler: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null, uid: 'uid-ahmed' }
const balance: TravelerBalance = { ...traveler, totalExpenses: 200, remaining: 800 }
const expenses: Expense[] = [
  { id: 'e1', date: '2026-07-10', description: 'عشاء', amount: 200, originalAmount: 200, currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 1000, category: 'طعام وشراب' },
]
const depositLog: DepositLogEntry = {
  id: 'log-1', travelerId: 1, previousDeposited: 800, newDeposited: 1000, delta: 200,
  mode: 'add', reason: 'تعويض دفعة مشتركة', changedByEmail: 'admin@example.com', changedByUid: 'admin-1',
  createdAt: 500, // بين الصفر وe1 (createdAt: 1000) زمنياً
}

function renderModal(overrides: Partial<Parameters<typeof TravelerProfileModal>[0]> = {}) {
  return render(
    <TravelerProfileModal
      traveler={traveler}
      balance={balance}
      expenses={expenses}
      settlements={[]}
      allTravelers={[traveler]}
      isAdmin={false}
      isOrganizer={false}
      isSelf={false}
      initialTab="statement"
      onClose={() => {}}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseDepositLogs.mockReturnValue({ logs: [depositLog], error: false })
})

describe('TravelerProfileModal — دمج سجل تعديلات الرصيد في الخط الزمني', () => {
  it('بلا صلاحية (لا أدمن، لا منظّم، ليس صاحب الملف): الخط لا يعرض تعديل الرصيد، والقسم المنفصل غائب تماماً', () => {
    renderModal()
    expect(screen.queryByText('تعديل رصيد')).not.toBeInTheDocument()
    expect(screen.queryByText('سجل تعديلات الرصيد')).not.toBeInTheDocument()
    // الخطاف يُستدعى، لكن enabled=false — فلا قراءة Firestore فعلية تُحاوَل.
    expect(mockedUseDepositLogs).toHaveBeenCalledWith(1, false)
  })

  it('المسؤول: تعديل الرصيد يظهر مدموجاً داخل نفس الخط، لا في قسم منفصل', () => {
    renderModal({ isAdmin: true })
    expect(screen.getByText('تعديل رصيد')).toBeInTheDocument()
    expect(screen.getByText('تعويض دفعة مشتركة')).toBeInTheDocument()
    expect(screen.queryByText('سجل تعديلات الرصيد')).not.toBeInTheDocument()
    expect(mockedUseDepositLogs).toHaveBeenCalledWith(1, true)
  })

  it('منظّم الرحلة (بلا isAdmin): نفس نتيجة المسؤول — يرى الدمج أيضاً', () => {
    renderModal({ isOrganizer: true })
    expect(screen.getByText('تعديل رصيد')).toBeInTheDocument()
  })

  it('صاحب الملف نفسه (isSelf، بلا isAdmin ولا isOrganizer): يرى دمج سجلّه هو', () => {
    renderModal({ isSelf: true })
    expect(screen.getByText('تعديل رصيد')).toBeInTheDocument()
  })

  it('ترتيب الدمج الزمني: تعديل الرصيد (createdAt:500) يظهر قبل سطر المصروف (createdAt:1000)', () => {
    renderModal({ isAdmin: true })
    const list = screen.getByRole('list')
    const items = list.querySelectorAll('li')
    // العنصر [0] هو رصيد الافتتاح دائماً؛ التالي مباشرة يجب أن يكون تعديل الرصيد لا المصروف.
    expect(items[1].textContent).toContain('تعديل رصيد')
    expect(items[2].textContent).toContain('عشاء')
  })
})

// 🆕 لا مُصفّي دورة يدوي بعد الآن: "الخلاصة والتسويات" (والمؤشرات العلوية)
// تعرض الدورة الحالية دوماً، و"كشف الحساب التفصيلي" يعرض كل الدورات دوماً —
// بلا أي تبديل يدوي بينهما.
describe('TravelerProfileModal — الدورة الحالية للخلاصة، كل الدورات لكشف الحساب التفصيلي', () => {
  const julyExpense: Expense = {
    id: 'e-july', date: '2026-07-15', description: 'غداء يوليو', amount: 100, originalAmount: 100,
    currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 100, category: 'طعام وشراب',
  }
  const augustExpense: Expense = {
    id: 'e-august', date: '2026-08-05', description: 'عشاء أغسطس', amount: 50, originalAmount: 50,
    currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 200, category: 'طعام وشراب',
  }
  const twoPeriodExpenses = [julyExpense, augustExpense]
  // periods مرتّبة تصاعدياً وتنتهي دوماً بالدورة الحالية (نفس عقد listPeriods
  // في utils/period.ts) — أغسطس هنا هي "الحالية".
  const periods = ['2026-07' as const, '2026-08' as const]

  it('عنصر تحكّم تصفية الدورة غائب تماماً — تسمية نصية فقط تُبيّن الدورة المقصودة', () => {
    renderModal({ expenses: twoPeriodExpenses, periods })
    expect(screen.queryByLabelText('تصفية الدورة')).not.toBeInTheDocument()
    expect(screen.getByText('أرقام دورة أغسطس 2026')).toBeInTheDocument()
  })

  // 🆕 استعلامات مقصورة على <main> عمداً: المودال يُخرج دائماً مستند طباعة
  // مخفي (#print-root) موازياً لمحتوى الشاشة — تراكمي دوماً بغضّ النظر عن
  // التبويب المفتوح — فيتكرر أي نص فيه أيضاً، ويُبطل استعلاماً غير مُقيَّد.
  it('الخلاصة والتسويات: الدورة الحالية (أغسطس) فقط — مصروف يوليو غائب', () => {
    renderModal({ expenses: twoPeriodExpenses, periods, initialTab: 'summary' })
    const main = within(screen.getByRole('main'))
    expect(main.getByText('عشاء أغسطس')).toBeInTheDocument()
    expect(main.queryByText('غداء يوليو')).not.toBeInTheDocument()
  })

  it('كشف الحساب التفصيلي: تراكمي على كل الدورات — يوليو وأغسطس معاً', () => {
    renderModal({ expenses: twoPeriodExpenses, periods, initialTab: 'statement' })
    const main = within(screen.getByRole('main'))
    expect(main.getByText('غداء يوليو')).toBeInTheDocument()
    expect(main.getByText('عشاء أغسطس')).toBeInTheDocument()
  })
})
