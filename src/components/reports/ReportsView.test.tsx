// اختبار الانفصال بين ما يُعرض على الشاشة وما يُطبع.
//
// ⚠️ الضمانة هنا **ثنائية بالضرورة**، ولهذا لا يكفي اختبار غياب: قائمة المسار
// أُزيلت من شاشة التقارير (صارت تكراراً بصرياً بعد أن استقلّ المسار بصفحته
// خلف «المزيد»)، لكن جدول المسار في تقرير الطباعة **يجب أن يبقى** — التقرير
// المصدَّر يُقرأ خارج التطبيق حيث لا وجود لتلك الصفحة، وهو مرجع المسافر فيه.
// اختبارٌ يؤكّد الغياب وحده كان سيبقى أخضر لو حُذف المسار من الطباعة أيضاً،
// وهو بالضبط الخطأ الذي طُلب تجنّبه.
//
// `#print-root` موجود في DOM دائماً ويُخفى بـ@media screen لا بشرط في React،
// فيمكن التمييز بينهما بالنطاق: `within(printRoot)` مقابل `<main>` الشاشة.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ReportsView from './ReportsView'
import * as fx from '../../fixtures'

const props = {
  travelers: fx.travelers,
  expenses: fx.expenses,
  balances: fx.balances,
  settlements: fx.settlements,
  categoryTotals: fx.categoryTotals,
  itinerary: fx.itinerary,
  onClose: () => {},
}

// معرّف مقطع لا يظهر إلا في قائمة/جدول المسار — لا في أي قسم آخر من التقرير.
const SEGMENT = fx.itinerary[0].identifier!

describe('ReportsView — المسار على الشاشة مقابل الطباعة', () => {
  it('لا يعرض قائمة المسار على الشاشة (مكانها الوحيد نافذة «مسار الرحلة»)', () => {
    const { container } = render(<ReportsView {...props} />)

    const onScreen = container.querySelector('main')
    expect(onScreen).not.toBeNull()
    expect(within(onScreen as HTMLElement).queryByText(SEGMENT)).not.toBeInTheDocument()
    // ولا عنوان القسم الذي كان يعلوها.
    expect(within(onScreen as HTMLElement).queryByRole('heading', { name: 'مسار الرحلة' }))
      .not.toBeInTheDocument()
  })

  it('يُبقي جدول المسار في تقرير الطباعة — مرجع المسافر خارج التطبيق', () => {
    render(<ReportsView {...props} />)

    const printRoot = document.getElementById('print-root')
    expect(printRoot).not.toBeNull()
    const print = within(printRoot as HTMLElement)

    expect(print.getByText('مسار الرحلة')).toBeInTheDocument()
    expect(print.getByText(SEGMENT)).toBeInTheDocument()
    // وكل مقطع له صفّه: الجدول تراكمي لكامل الرحلة لا لدورة واحدة.
    fx.itinerary.forEach(seg => {
      expect(print.getByText(seg.identifier!)).toBeInTheDocument()
    })
  })

  it('رحلة بلا مسار: لا جدول مسار في الطباعة ولا عنوان له', () => {
    render(<ReportsView {...props} itinerary={fx.noItinerary} />)

    const print = within(document.getElementById('print-root') as HTMLElement)
    expect(print.queryByText('مسار الرحلة')).not.toBeInTheDocument()
  })
})

describe('ReportsView — التقارير نفسها لم تتأثر', () => {
  it('يعرض ملخص الرحلة وأسماء المسافرين على الشاشة', async () => {
    render(<ReportsView {...props} />)

    expect(screen.getAllByText(fx.travelers[0].name).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument()
  })
})
