// 🆕 اختبار مدخل «ورقة الرحلة» في الهيدر.
//
// ⚠️ سبب وجود هذا الملف تحديداً: الوضع المتقلّص. useHeaderCollapse يعتمد على
// requestAnimationFrame، الذي تُجمّده المتصفحات في تبويب/نافذة غير مرئية —
// فالتحقّق البصري من الوضع المتقلّص غير موثوق أصلاً. الحالة هنا تُزيَّف
// مباشرةً، فيُختبر ما يهمّ فعلاً: **أن مدخل الورقة لا يختفي مع العنوان عند
// التمرير**، وهي القاعدة التي وُضع الزرّ المصغَّر من أجلها.
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
  onOpenTripSheet: noop,
  stats: { totalDeposited: 1000, totalSpent: 400, totalRemaining: 600 },
  displayName: 'أحمد الغامدي',
  email: 'ahmad@example.com',
  onShowProfile: noop,
  onOpenAdminPanel: noop,
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

  it('اسم الرحلة زرّ يفتح ورقة الرحلة', async () => {
    const onOpenTripSheet = vi.fn()
    render(<Header {...baseProps} onOpenTripSheet={onOpenTripSheet} />)

    await userEvent.click(screen.getByRole('button', { name: 'رحلة بولندا 2026' }))
    expect(onOpenTripSheet).toHaveBeenCalledTimes(1)
  })

  it('يبقى مدخل الورقة متاحاً في الهيدر المتقلّص — ولو بلا نصّ', async () => {
    mockIsCollapsed.mockReturnValue(true)
    const onOpenTripSheet = vi.fn()
    render(<Header {...baseProps} onOpenTripSheet={onOpenTripSheet} />)

    // العنوان نفسه يختفي (مكانه للحبّات)، لكن الوصول للورقة لا يختفي معه.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ورقة الرحلة' }))
    expect(onOpenTripSheet).toHaveBeenCalledTimes(1)
  })
})
