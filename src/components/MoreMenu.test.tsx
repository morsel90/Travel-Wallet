// 🆕 اختبار زرّ «المزيد» (⋯) — وريث الضمانة التي كانت في ExpensesPanel.test.tsx.
//
// ⚠️ ما يُختبر هنا ليس الشكل بل الضمانة التي انتقلت معه: كان موضع «سلة
// المهملات» في نهاية سجلّ المصاريف، فكان لا بدّ من إثبات أنها لا تختفي حين
// يحذف المسؤول *آخر* مصروف (فتحلّ شاشة «لا توجد مصاريف بعد» محلّ القائمة).
// موضعها الجديد في الهيدر لا يعتمد على حالة القائمة إطلاقاً — والاختبار هنا
// يثبت أن ظهورها محكوم بالصلاحية وحدها لا بأي حالة عرض. القاعدة ١٧.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MoreMenu from './MoreMenu'

const noop = () => {}
// الأفعال الثلاثة المتاحة لكل عضو — بلا أي بند مشروط بالصلاحية.
const memberActions = {
  onOpenReports: noop,
  onOpenCharts: noop,
  onOpenItinerary: noop,
}

const openSheet = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'المزيد' }))
}

describe('MoreMenu — الورقة السفلية', () => {
  it('الورقة مغلقة حتى تُفتح، وزرّ ⋯ وحده الظاهر في الهيدر', () => {
    render(<MoreMenu {...memberActions} />)
    expect(screen.getByRole('button', { name: 'المزيد' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('التقارير')).not.toBeInTheDocument()
  })

  it('العضو العادي يرى التقارير والإحصائيات والمسار فقط', async () => {
    render(<MoreMenu {...memberActions} />)
    await openSheet()

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
    render(<MoreMenu {...memberActions} onOpenTrashBin={onOpenTrashBin} />)
    await openSheet()

    await userEvent.click(screen.getByText('سلة المهملات'))
    expect(onOpenTrashBin).toHaveBeenCalledTimes(1)
  })

  it('اختيار أي بند يُغلق الورقة — لا نافذتان مفتوحتان معاً', async () => {
    const onOpenReports = vi.fn()
    render(<MoreMenu {...memberActions} onOpenReports={onOpenReports} />)
    await openSheet()

    await userEvent.click(screen.getByText('التقارير'))
    expect(onOpenReports).toHaveBeenCalledTimes(1)
    // ⚠️ waitFor لا waitForElementToBeRemoved: حركة الخروج (AnimatePresence)
    // قد تكون انتهت قبل السطر أصلاً، وحينها ترمي الأخيرة «العنصر مُزال سلفاً».
    // ما يهمّ هنا الحالة النهائية لا مرور اللوحة بها أمام أعيننا.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('«الشهر المحاسبي» لا يظهر إلا في رحلة طويلة المدى', async () => {
    const onOpenLongTerm = vi.fn()
    render(<MoreMenu {...memberActions} onOpenLongTerm={onOpenLongTerm} />)
    await openSheet()
    expect(screen.getByText('الشهر المحاسبي')).toBeInTheDocument()
  })
})
