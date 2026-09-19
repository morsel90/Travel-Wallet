// ─── تأكيدا الرحلة الطويلة: إغلاق الشهر، وخروج المنتدَب ──────────────────────
//
// كُتب قبل نقل التأكيدين من نافذتين مستقلّتين إلى خطوتين داخل نافذتيهما
// (القاعدة ٢١)، وأُثبت أخضر على MonthlyRolloverModal/ExitTravelerModal القديمين.
// ما يُثبَّت هنا هو **محتوى القرار**: ما يُعرض قبله، وما يُرسَل عند التأكيد.
// النقل يغيّر مكان التأكيد لا مضمونه، فهذه التوقّعات يجب أن تبقى حرفياً —
// ما يتغيّر بعده دالتا التجهيز renderRollover/renderExit وحدهما.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RolloverConfirm } from './RolloverConfirm'
import { ExitTravelerConfirm } from './ExitTravelerConfirm'
import type { RolloverMovement, TravelerBalance } from '../../types'

const movements: RolloverMovement[] = [
  { travelerId: 1, travelerName: 'سعد', remaining: 800, direction: 'credit' },
  { travelerId: 2, travelerName: 'خالد', remaining: -200, direction: 'debt' },
  { travelerId: 3, travelerName: 'منى', remaining: 0, direction: 'settled' },
]

function renderRollover(over: Partial<{ movements: RolloverMovement[]; isSubmitting: boolean }> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <RolloverConfirm
      period="2026-08" movements={over.movements ?? movements} isSubmitting={over.isSubmitting ?? false}
      onConfirm={onConfirm} onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

const traveler = (remaining: number, extra: Partial<TravelerBalance> = {}): TravelerBalance => ({
  id: 5, name: 'خالد', shortName: 'خالد', deposited: 0, totalExpenses: 0, remaining, ...extra,
})

function renderExit(t: TravelerBalance, over: Partial<{ isSubmitting: boolean; organizerUid: string | null }> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ExitTravelerConfirm
      traveler={t} isSubmitting={over.isSubmitting ?? false} organizerUid={over.organizerUid ?? null}
      onConfirm={onConfirm} onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('تأكيد إغلاق الشهر', () => {
  it('يعرض رصيد كل مسافر بإشارته، ومن رصيده صفر «يبدأ من الصفر»', () => {
    renderRollover()
    expect(screen.getByText('إغلاق أغسطس 2026')).toBeInTheDocument()
    expect(screen.getByText('+800.00')).toBeInTheDocument()
    expect(screen.getByText('−200.00')).toBeInTheDocument()
    expect(screen.getByText('يبدأ من الصفر')).toBeInTheDocument()
  })

  it('كل الأرصدة صفر: تنبيه بأن لا ترحيل سيُكتب، بدل قائمة فارغة', () => {
    renderRollover({ movements: [movements[2]] })
    expect(screen.getByText(/كل الأرصدة صفر/)).toBeInTheDocument()
  })

  it('التأكيد يستدعي onConfirm، والإلغاء لا يستدعيه', () => {
    const { onConfirm, onCancel } = renderRollover()
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإغلاق' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('أثناء الإغلاق: الزرّان معطّلان — لا ضغطة ثانية ولا تراجع في منتصف العملية', () => {
    renderRollover({ isSubmitting: true })
    expect(screen.getByRole('button', { name: /جارٍ الإغلاق/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
  })
})

describe('تأكيد خروج المنتدَب', () => {
  it('حساب مسوّى: «إخراج» يرسل settle=false', () => {
    const { onConfirm } = renderExit(traveler(0))
    fireEvent.click(screen.getByRole('button', { name: 'إخراج' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('عليه مبلغ: يسمّي المبلغ والاتجاه، و«تسوية وخروج» يرسل settle=true', () => {
    const { onConfirm } = renderExit(traveler(-200))
    expect(screen.getByText(/حسابه غير مسوّى/)).toBeInTheDocument()
    expect(screen.getByText(/عليه 200\.00 ريال/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تسوية وخروج' }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('له مبلغ: يسمّيه «له»', () => {
    renderExit(traveler(150))
    expect(screen.getByText(/له 150\.00 ريال/)).toBeInTheDocument()
  })

  it('المنظّم نفسه: لا زرّ تأكيد إطلاقاً، و«حسناً» تُلغي فقط', () => {
    const { onConfirm, onCancel } = renderExit(traveler(0, { uid: 'org' }), { organizerUid: 'org' })
    expect(screen.queryByRole('button', { name: /إخراج|تسوية وخروج/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'حسناً' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('أثناء التنفيذ: الزرّان معطّلان', () => {
    renderExit(traveler(-200), { isSubmitting: true })
    expect(screen.getByRole('button', { name: /جارٍ التنفيذ/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
  })
})
