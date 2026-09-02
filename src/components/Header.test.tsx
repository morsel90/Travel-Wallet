// 🆕 اختبار عنوان الهيدر بعد أن صار يعرض اسم الرحلة المفتوحة.
//
// ⚠️ الحالة المتقلّصة مُزيَّفة هنا لا مُنتَظَرة: useHeaderCollapse يعتمد على
// requestAnimationFrame، الذي تُجمّده المتصفحات في أي صفحة غير مرئية — فأي
// تحقّق بصري منها غير موثوق أصلاً.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from './Header'

const mockIsCollapsed = vi.fn(() => false)
vi.mock('../hooks/useHeaderCollapse', () => ({
  useHeaderCollapse: () => mockIsCollapsed(),
}))

const noop = () => {}
const baseProps = {
  isSyncing: false,
  isAdmin: false,
  isOrganizer: false,
  tripName: 'رحلة بولندا 2026',
  canEditTrip: false,
  onEditTrip: noop,
  stats: { totalDeposited: 1000, totalSpent: 400, totalRemaining: 600 },
  displayName: 'أحمد الغامدي',
  email: 'ahmad@example.com',
  onShowProfile: noop,
  onAdminSignIn: noop,
  onSignOut: noop,
}

describe('Header — عنوان الرحلة', () => {
  beforeEach(() => {
    mockIsCollapsed.mockReturnValue(false)
  })

  it('يعرض اسم الرحلة لا اسم التطبيق', () => {
    render(<Header {...baseProps} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('رحلة بولندا 2026')
    expect(screen.queryByText('مصاريف السفر')).not.toBeInTheDocument()
  })

  it('يسقط العنوان إلى معرّف الرحلة حين لا اسم محفوظاً — لا اسم مخترع', () => {
    render(<Header {...baseProps} tripName="travelapp-87206" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('travelapp-87206')
  })

  it('العنوان يُخلي مكانه للإحصاءات عند التقلّص — سلوك قائم لم يتغيّر', () => {
    mockIsCollapsed.mockReturnValue(true)
    render(<Header {...baseProps} />)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})

describe('Header — شارة الدورة الحالية (رحلة طويلة)', () => {
  beforeEach(() => {
    mockIsCollapsed.mockReturnValue(false)
  })

  const cycleStats = { periodLabel: 'أغسطس 2026', totalDeposited: 300, totalSpent: 50, totalRemaining: 600 }

  it('لا شارة ولا زرّ تبديل حين تغيب cycleStats — الرحلة القياسية بلا أثر', () => {
    render(<Header {...baseProps} />)
    expect(screen.queryByText(/دورة/)).not.toBeInTheDocument()
    expect(screen.queryByText(/الإجمالي التراكمي للرحلة/)).not.toBeInTheDocument()
  })

  it('تعرض أرقام الدورة افتراضياً — لا الإجمالي التراكمي', () => {
    render(<Header {...baseProps} cycleStats={cycleStats} />)
    expect(screen.getByText('دورة أغسطس 2026')).toBeInTheDocument()
    expect(screen.getByText('300.00')).toBeInTheDocument() // محفظة الدورة
    expect(screen.getByText('50.00')).toBeInTheDocument()  // مصاريف الدورة
    expect(screen.queryByText('1000.00')).not.toBeInTheDocument() // الإجمالي التراكمي لم يظهر
  })

  it('الضغط على الشارة يبدّل إلى الإجمالي التراكمي للرحلة', async () => {
    const user = userEvent.setup()
    render(<Header {...baseProps} cycleStats={cycleStats} />)

    await user.click(screen.getByText('دورة أغسطس 2026'))

    expect(screen.getByText('الإجمالي التراكمي للرحلة')).toBeInTheDocument()
    expect(screen.getByText('1000.00')).toBeInTheDocument() // stats.totalDeposited
    expect(screen.getByText('400.00')).toBeInTheDocument()  // stats.totalSpent
    expect(screen.queryByText('300.00')).not.toBeInTheDocument()
  })

  it('«المتبقي» نفس الرقم في الحالتين — الدورة والإجمالي التراكمي متّسقان به', async () => {
    const user = userEvent.setup()
    render(<Header {...baseProps} cycleStats={cycleStats} />)

    expect(screen.getAllByText('600.00')).toHaveLength(1)
    await user.click(screen.getByText('دورة أغسطس 2026'))
    expect(screen.getAllByText('600.00')).toHaveLength(1)
  })
})
