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
  stats: { totalDeposited: 1000, totalSpent: 400, totalRemaining: 600 },
  displayName: 'أحمد الغامدي',
  email: 'ahmad@example.com',
  onShowProfile: noop,
  onSignOut: noop,
  // 🆕 أفعال ورقة «المزيد» — الأفعال الثلاثة غير الاختيارية وحدها؛ البنود
  // المشروطة بالصلاحية تُمرَّر في اختبارها الخاص أدناه.
  more: {
    onOpenReports: noop,
    onOpenCharts: noop,
    onOpenItinerary: noop,
  },
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

  const cycleStats = { totalDeposited: 300, totalSpent: 50, totalRemaining: 700 }

  it('رحلة قياسية — سطر «المتبقي» وحده', () => {
    render(<Header {...baseProps} />)
    expect(screen.getByText('المتبقي 600.00 ﷼')).toBeInTheDocument()
  })

  // 🆕 الفرق بين الحالتين **كلمتان لا مفهوم**: لا كلمة «دورة» ولا اسم شهر ولا
  // زرّ تبديل. اسم الشهر الصريح مكانه التقارير والطباعة حيث تُقرأ الأرقام بعد
  // شهور وخارج التطبيق، لا الشاشة الرئيسية حيث «هذا الشهر» بديهي.
  it('رحلة طويلة — «المتبقي هذا الشهر» بالرقم الشهري لا التراكمي', () => {
    render(<Header {...baseProps} cycleStats={cycleStats} />)
    expect(screen.getByText('المتبقي هذا الشهر 700.00 ﷼')).toBeInTheDocument()
    // 600.00 (stats.totalRemaining التراكمي) لا يظهر — الشهر فقط، ولا خيار لعرضه.
    expect(screen.queryByText(/600\.00/)).not.toBeInTheDocument()
    // ولا اصطلاح داخلي مسرَّب: لا «دورة» ولا اسم شهر على الشاشة الرئيسية.
    expect(screen.queryByText(/دورة|أغسطس/)).not.toBeInTheDocument()
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

// ─── اسم الرحلة = زرّ فتح «المزيد» ───────────────────────────────────────────
// 🆕 دُمج زرّ ⋯ المنفصل في اسم الرحلة/الشعار: القائمة تحوي الإعدادات وإدارة
// الرحلة، فمكانها الطبيعي خلف هوية الرحلة (نمط واتساب/Slack).
describe('Header — اسم الرحلة يفتح ورقة «المزيد»', () => {
  beforeEach(() => {
    mockIsCollapsed.mockReturnValue(false)
  })

  it('الضغط على اسم الرحلة يفتح الورقة', async () => {
    render(<Header {...baseProps} />)
    expect(screen.queryByRole('dialog', { name: 'المزيد' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'قائمة الرحلة' }))
    expect(screen.getByRole('dialog', { name: 'المزيد' })).toBeInTheDocument()
    expect(screen.getByText('التقارير')).toBeInTheDocument()
  })

  // ⚠️ **جوهر الدمج**: الزرّ كان مشروطاً بـcanEditTrip، أي أن اسم الرحلة كان
  // عنصراً ميّتاً لأغلب الأعضاء. التقارير والإحصائيات والمسار حقٌّ لكل عضو.
  // (القاعدة ١٧: اسأل من يستبعده هذا الشرط قبل شحنه.)
  it('متاح للعضو العادي أيضاً — لا شرط صلاحية على الزرّ نفسه', async () => {
    render(<Header {...baseProps} />)

    await userEvent.click(screen.getByRole('button', { name: 'قائمة الرحلة' }))
    expect(screen.getByText('التقارير')).toBeInTheDocument()
    // ...لكن «إدارة الرحلة» ليست من حقّه: الحارس داخل الورقة لا على الزرّ.
    expect(screen.queryByText('إدارة الرحلة')).not.toBeInTheDocument()
  })

  it('«إدارة الرحلة» تظهر داخل الورقة لمن يملك صلاحيتها', async () => {
    const onOpenTripAdmin = vi.fn()
    render(<Header {...baseProps} more={{ ...baseProps.more, onOpenTripAdmin }} />)

    await userEvent.click(screen.getByRole('button', { name: 'قائمة الرحلة' }))
    await userEvent.click(screen.getByText('إدارة الرحلة'))
    expect(onOpenTripAdmin).toHaveBeenCalledTimes(1)
  })

  // ⚠️ اسم الرحلة يختفي حين يتقلّص الهيدر، فالشعار وحده يبقى — ولو كان الفتح
  // مربوطاً بالاسم وحده لضاعت القائمة كلها أثناء تصفّح سجلّ طويل.
  it('يبقى متاحاً والهيدر متقلّص (الشعار وحده الظاهر)', async () => {
    mockIsCollapsed.mockReturnValue(true)
    render(<Header {...baseProps} />)

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'قائمة الرحلة' }))
    expect(screen.getByRole('dialog', { name: 'المزيد' })).toBeInTheDocument()
  })
})
