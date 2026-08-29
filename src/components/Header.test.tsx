// 🆕 اختبار عنوان الهيدر بعد أن صار يعرض اسم الرحلة المفتوحة.
//
// ⚠️ الحالة المتقلّصة مُزيَّفة هنا لا مُنتَظَرة: useHeaderCollapse يعتمد على
// requestAnimationFrame، الذي تُجمّده المتصفحات في أي صفحة غير مرئية — فأي
// تحقّق بصري منها غير موثوق أصلاً.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
