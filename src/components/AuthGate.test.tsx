import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AuthGate from './AuthGate'
import type { UsePasswordResetResult } from '../hooks/usePasswordReset'

vi.mock('../utils/tripId', () => ({ INVITE_TOKEN: null }))

function renderGate(reset: Partial<UsePasswordResetResult> = {}) {
  const requestReset = vi.fn(async () => 'sent' as const)
  const passwordReset: UsePasswordResetResult = {
    requestReset, isSendingReset: false, resetCooldownSeconds: 0, ...reset,
  }
  render(
    <AuthGate
      loading={false}
      isSigningIn={false}
      signInError={null}
      onSignInGoogle={() => {}}
      onSignInEmail={() => {}}
      passwordReset={passwordReset}
    />,
  )
  return { requestReset }
}

const openEmailForm = () => fireEvent.click(screen.getByText('أو عبر البريد الإلكتروني'))
const forgotButton = () => screen.getByRole('button', { name: 'نسيت كلمة المرور؟' })

// 🆕 **الاختبار الذي لم يكن موجوداً هو بيت الداء**: الميزة كانت سليمة تماماً
// وناجحة في اختباراتها، ومحجوبة عن الشخص الوحيد الذي يحتاجها — لأن كل
// اختباراتها كانت تفترض جلسة مسجَّلة الدخول. هذه الاختبارات تسأل السؤال الآخر:
// هل يبلغها من هو *خارج* التطبيق؟
describe('AuthGate — استرداد كلمة المرور قبل تسجيل الدخول', () => {
  it('الرابط موجود داخل نموذج البريد — لا خلف تسجيل دخول ناجح', () => {
    renderGate()
    openEmailForm()
    expect(forgotButton()).toBeInTheDocument()
  })

  it('يمرّر البريد المكتوب في الحقل كما هو', () => {
    const { requestReset } = renderGate()
    openEmailForm()
    fireEvent.change(screen.getByPlaceholderText('البريد الإلكتروني'), { target: { value: 'a@b.com' } })
    fireEvent.click(forgotButton())
    expect(requestReset).toHaveBeenCalledWith('a@b.com')
  })

  it('بريد فارغ: رسالة تقول ما يفعله المستخدم، لا صمت', async () => {
    renderGate({ requestReset: vi.fn(async () => 'missing-email' as const) })
    openEmailForm()
    fireEvent.click(forgotButton())
    expect(await screen.findByText(/أدخل بريدك الإلكتروني/)).toBeInTheDocument()
  })

  it('أثناء المهلة: الزرّ معطّل ويعرض الثواني المتبقية', () => {
    renderGate({ resetCooldownSeconds: 42 })
    openEmailForm()
    const btn = screen.getByRole('button', { name: /أعد المحاولة خلال 42 ثانية/ })
    expect(btn).toBeDisabled()
  })

  // ⚠️ حارس نفي: «نسيت كلمة المرور؟» بلا معنى وأنت تُنشئ حساباً — لا كلمة
  // مرور بعد تُنسى. بلا هذا التأكيد يعود الزرّ لكل الأوضاع بلا أن يسقط شيء.
  it('وضع إنشاء حساب: الرابط غائب تماماً', () => {
    renderGate()
    openEmailForm()
    fireEvent.click(screen.getByRole('button', { name: 'حساب جديد؟ أنشئ حساباً' }))
    expect(screen.queryByRole('button', { name: 'نسيت كلمة المرور؟' })).not.toBeInTheDocument()
  })
})
