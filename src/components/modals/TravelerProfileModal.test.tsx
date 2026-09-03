import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
