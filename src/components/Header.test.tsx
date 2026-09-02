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

describe('Header — السطر الموجز (رقم واحد بدل حبّات وشارة/تبديل)', () => {
  // ⚠️ استُبدلت ثلاث حبّات ملوّنة + شارة/زرّ تبديل الدورة بسطر نصّي هادئ واحد
  // ("المتبقي فقط") — طلب صاحب الحساب صراحةً إزالة الشارة والتبديل لأنهما
  // زادا الزحمة. لا حالة داخلية بعد الآن، فلا اختبار تبديل يلزم.
  beforeEach(() => {
    mockIsCollapsed.mockReturnValue(false)
  })

  const cycleStats = { periodLabel: 'أغسطس 2026', totalDeposited: 300, totalSpent: 50, totalRemaining: 700 }

  it('رحلة قياسية — سطر «المتبقي» وحده، بلا اسم دورة', () => {
    render(<Header {...baseProps} />)
    expect(screen.getByText('المتبقي 600.00 ﷼')).toBeInTheDocument()
    expect(screen.queryByText(/دورة/)).not.toBeInTheDocument()
  })

  it('رحلة طويلة — اسم الدورة + متبقي الدورة (لا الإجمالي التراكمي)، بلا زرّ تبديل', () => {
    render(<Header {...baseProps} cycleStats={cycleStats} />)
    expect(screen.getByText('دورة أغسطس 2026 · المتبقي 700.00 ﷼')).toBeInTheDocument()
    // 600.00 (stats.totalRemaining التراكمي) لا يظهر — الدورة فقط، ولا خيار لعرضه.
    expect(screen.queryByText(/600\.00/)).not.toBeInTheDocument()
  })

  it('الضغط على السطر يستدعي onStatClick بمفتاح remaining', async () => {
    const user = userEvent.setup()
    const onStatClick = vi.fn()
    render(<Header {...baseProps} onStatClick={onStatClick} />)

    await user.click(screen.getByText('المتبقي 600.00 ﷼'))
    expect(onStatClick).toHaveBeenCalledWith('remaining')
  })

  it('بلا onStatClick — السطر نصّ بحت لا زرّاً', () => {
    render(<Header {...baseProps} />)
    expect(screen.getByText('المتبقي 600.00 ﷼').closest('button')).toBeNull()
  })
})
