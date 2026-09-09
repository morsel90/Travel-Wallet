// 🆕 اختبار ورقة «المزيد» — وريثة الضمانة التي كانت في ExpensesPanel.test.tsx.
//
// ⚠️ ما يُختبر هنا ليس الشكل بل الضمانة التي انتقلت مع البند: كان موضع «سلة
// المهملات» في نهاية سجلّ المصاريف، فكان لا بدّ من إثبات أنها لا تختفي حين
// يحذف المسؤول *آخر* مصروف (فتحلّ شاشة «لا توجد مصاريف بعد» محلّ القائمة).
// موضعها الجديد في الهيدر لا يعتمد على حالة القائمة إطلاقاً — والاختبار هنا
// يثبت أن ظهورها محكوم بالصلاحية وحدها لا بأي حالة عرض. القاعدة ١٧.
//
// ⚠️ الورقة متحكَّم بها من الخارج ولا تملك زرّ فتح: زرّ الفتح هو اسم الرحلة في
// الهيدر، ويُختبر في Header.test.tsx حيث يعيش فعلاً.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MoreMenuSheet from './MoreMenu'

const noop = () => {}
// الأفعال الثلاثة المتاحة لكل عضو — بلا أي بند مشروط بالصلاحية.
const memberActions = {
  onOpenReports: noop,
  onOpenCharts: noop,
  onOpenItinerary: noop,
  onClose: noop,
}

describe('MoreMenuSheet — ورقة «المزيد»', () => {
  it('العضو العادي يرى التقارير والإحصائيات والمسار فقط', () => {
    render(<MoreMenuSheet {...memberActions} />)

    expect(screen.getByRole('dialog', { name: 'المزيد' })).toBeInTheDocument()
    expect(screen.getByText('التقارير')).toBeInTheDocument()
    expect(screen.getByText('الإحصائيات')).toBeInTheDocument()
    expect(screen.getByText('مسار الرحلة')).toBeInTheDocument()
    // لا بند تخصّه صلاحية لم تُمرَّر — الغياب هو التعطيل لا شرطٌ داخل المكوّن.
    expect(screen.queryByText('سلة المهملات')).not.toBeInTheDocument()
    expect(screen.queryByText('إدارة الرحلة')).not.toBeInTheDocument()
    expect(screen.queryByText('نسخة احتياطية')).not.toBeInTheDocument()
    expect(screen.queryByText('الشهر المحاسبي')).not.toBeInTheDocument()
  })

  it('المسؤول يصل إلى سلة المهملات مهما كانت حالة سجلّ المصاريف', async () => {
    const onOpenTrashBin = vi.fn()
    render(<MoreMenuSheet {...memberActions} onOpenTrashBin={onOpenTrashBin} />)

    await userEvent.click(screen.getByText('سلة المهملات'))
    expect(onOpenTrashBin).toHaveBeenCalledTimes(1)
  })

  it('«إدارة الرحلة» بند هنا لا زرّ منفصل في الهيدر — لمن يملك صلاحيتها', async () => {
    const onOpenTripAdmin = vi.fn()
    render(<MoreMenuSheet {...memberActions} onOpenTripAdmin={onOpenTripAdmin} />)

    await userEvent.click(screen.getByText('إدارة الرحلة'))
    expect(onOpenTripAdmin).toHaveBeenCalledTimes(1)
  })

  it('اختيار أي بند يُغلق الورقة — لا نافذتان مفتوحتان معاً', async () => {
    const onOpenReports = vi.fn()
    const onClose = vi.fn()
    render(<MoreMenuSheet {...memberActions} onClose={onClose} onOpenReports={onOpenReports} />)

    await userEvent.click(screen.getByText('التقارير'))
    expect(onOpenReports).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('«هذا الشهر» لا يظهر إلا في رحلة طويلة المدى', () => {
    render(<MoreMenuSheet {...memberActions} onOpenLongTerm={vi.fn()} />)
    expect(screen.getByText('هذا الشهر')).toBeInTheDocument()
  })
})
