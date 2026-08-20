import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useInviteJoin } from './useInviteJoin'

// 🆕 نفس نمط useAuth.test.ts بالضبط: نحاكي httpsCallable ليُرجع دالتنا،
// فنتحكم بالاستجابة والخطأ معاً بلا أي اتصال شبكة فعلي.
//
// 🆕 دالتان لا واحدة الآن (joinFn وupdateNameFn) — الخطاف يستدعي دالتين
// سحابيتين مختلفتين (joinViaInvite وupdateMyTravelerName)، فالمحاكاة تُوجّه
// حسب الاسم الممرَّر لـ httpsCallable لا تتجاهله.
const mocks = vi.hoisted(() => ({
  joinFn: vi.fn(),
  updateNameFn: vi.fn(),
  // 🆕 INVITE_TOKEN قابل للتحوير من كل اختبار — على عكس TRIP_ID في
  // useAuth.test.ts (ثابت لأن اختباراته لا تحتاج تبديله)، هنا الفرع الأول في
  // الخطاف (وجود توكن أصلاً) هو بالضبط ما نختبره.
  inviteToken: null as string | null,
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) =>
    name === 'updateMyTravelerName' ? mocks.updateNameFn : mocks.joinFn,
}))
vi.mock('../firebase', () => ({ functions: {} }))
vi.mock('../utils/tripId', () => ({
  get INVITE_TOKEN() { return mocks.inviteToken },
  tripUrl: (tripId: string) => `https://example.test/?trip=${tripId}`,
}))

function mkUser() {
  return { uid: 'uid-1', getIdToken: vi.fn().mockResolvedValue('id-token') } as unknown as User
}

/** يحاكي خطأ دالة سحابية كما يصل للعميل — نفس صيغة useAuth.test.ts. */
function functionsError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

// ⚠️ window.location.replace غير قابل لإعادة تعريفه عبر vi.spyOn مباشرة في
// jsdom (خاصية غير قابلة لإعادة التشكيل على Location الحقيقي) — نستبدل الكائن
// كاملاً بمحاكاة بسيطة بدل ذلك، ونعيده كما كان بعد كل اختبار.
const originalLocation = window.location

describe('useInviteJoin', () => {
  let replaceSpy: ReturnType<typeof vi.fn>
  let showToast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inviteToken = null
    mocks.updateNameFn.mockResolvedValue({ data: { success: true } })
    showToast = vi.fn()
    replaceSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/', pathname: '/', origin: 'http://localhost:3000', search: '', replace: replaceSpy },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true })
  })

  it('لا رابط دعوة في الرابط ⇒ "done" فوراً بلا أي استدعاء للخادم', () => {
    const { result } = renderHook(() => useInviteJoin(null, showToast))
    expect(result.current.status).toBe('done')
    expect(mocks.joinFn).not.toHaveBeenCalled()
  })

  it('رابط دعوة موجود لكن المستخدم لم يستقر بعد ⇒ يبقى "joining"', () => {
    mocks.inviteToken = 'tok-123456789012345678'
    const { result } = renderHook(() => useInviteJoin(null, showToast))
    expect(result.current.status).toBe('joining')
    expect(mocks.joinFn).not.toHaveBeenCalled()
  })

  it('عند استقرار المستخدم يستدعي joinViaInvite بالتوكن، ويعيد التوجيه عند النجاح بلا حاجة لاسم', async () => {
    mocks.inviteToken = 'tok-123456789012345678'
    mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: false } })
    const user = mkUser()

    renderHook(() => useInviteJoin(user, showToast))

    await waitFor(() => expect(mocks.joinFn).toHaveBeenCalledWith({ inviteToken: 'tok-123456789012345678' }))
    // التوكن الجديد يُطلَب قبل إعادة التوجيه — نفس ما تفعله verifyTripPin تماماً.
    await waitFor(() => expect(vi.mocked(user.getIdToken)).toHaveBeenCalledWith(true))
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('https://example.test/?trip=trip-x'))
    expect(showToast).not.toHaveBeenCalled()
  })

  it('استجابة بلا needsName (نشر خادمي أقدم) ⇒ تُعامَل كـ false وتُوجَّه مباشرة', async () => {
    mocks.inviteToken = 'tok-123456789012345678'
    mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x' } })
    const user = mkUser()

    renderHook(() => useInviteJoin(user, showToast))

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('https://example.test/?trip=trip-x'))
  })

  it('لا يستدعي الخادم مرتين حتى لو أُعيد الرسم عدة مرات بنفس المستخدم', async () => {
    mocks.inviteToken = 'tok-123456789012345678'
    mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x' } })
    const user = mkUser()

    const { rerender } = renderHook(({ u }) => useInviteJoin(u, showToast), { initialProps: { u: user } })
    rerender({ u: user })
    rerender({ u: user })

    await waitFor(() => expect(mocks.joinFn).toHaveBeenCalledTimes(1))
  })

  // ⚠️ القاعدة ١٨: التحقق الفعلي من حالة الفشل، لا افتراض أنها تعمل لمجرد أن
  // حالة النجاح تعمل.
  it('توكن غير صالح ⇒ ينظّف الحالة، ويعرض رسالة الدعوة الخاصة لا رسالة رمز الرحلة', async () => {
    mocks.inviteToken = 'tok-123456789012345678'
    mocks.joinFn.mockRejectedValue(functionsError('functions/permission-denied', 'x'))
    const user = mkUser()

    const { result } = renderHook(() => useInviteJoin(user, showToast))

    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(showToast).toHaveBeenCalledTimes(1)
    const [msg] = showToast.mock.calls[0]
    expect(msg.type).toBe('error')
    expect(msg.text).toContain('رابط الدعوة')
    expect(msg.text).not.toContain('رمز الرحلة')
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('فشل بيئي (unauthenticated) ⇒ نفس رسالة verifyTripPin عن مانع الإعلانات', async () => {
    mocks.inviteToken = 'tok-123456789012345678'
    mocks.joinFn.mockRejectedValue(functionsError('functions/unauthenticated', 'x'))
    const user = mkUser()

    renderHook(() => useInviteJoin(user, showToast))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0].text).toContain('مانع إعلانات')
  })

  describe('needsName — تسمية ملف بلا اسم عرض حقيقي', () => {
    it('needsName صحيحة ⇒ "needsName" بدل التوجيه الفوري', async () => {
      mocks.inviteToken = 'tok-123456789012345678'
      mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: true } })
      const user = mkUser()

      const { result } = renderHook(() => useInviteJoin(user, showToast))

      await waitFor(() => expect(result.current.status).toBe('needsName'))
      expect(replaceSpy).not.toHaveBeenCalled()
    })

    it('submitName ⇒ يستدعي updateMyTravelerName بالاسم المُقلَّم ثم يوجّه للرحلة', async () => {
      mocks.inviteToken = 'tok-123456789012345678'
      mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: true } })
      const user = mkUser()

      const { result } = renderHook(() => useInviteJoin(user, showToast))
      await waitFor(() => expect(result.current.status).toBe('needsName'))

      act(() => { result.current.submitName('  سعد الغامدي  ') })

      await waitFor(() => expect(mocks.updateNameFn).toHaveBeenCalledWith({ tripId: 'trip-x', name: 'سعد الغامدي' }))
      await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('https://example.test/?trip=trip-x'))
    })

    // ⚠️ القاعدة ١٨: فشل الكتابة يجب ألا يحبس المستخدم خارج رحلته — يُتحقَّق
    // فعلياً هنا من أن التوجيه يقع رغم رفض updateMyTravelerName، لا افتراضاً.
    it('فشل updateMyTravelerName ⇒ يوجّه للرحلة رغم ذلك، بلا حبس المستخدم خارجها', async () => {
      mocks.inviteToken = 'tok-123456789012345678'
      mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: true } })
      mocks.updateNameFn.mockRejectedValue(functionsError('functions/internal', 'x'))
      const user = mkUser()

      const { result } = renderHook(() => useInviteJoin(user, showToast))
      await waitFor(() => expect(result.current.status).toBe('needsName'))

      act(() => { result.current.submitName('سعد') })

      await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('https://example.test/?trip=trip-x'))
    })

    it('اسم فارغ (بعد التقليم) ⇒ لا يستدعي الخادم ولا يوجّه', async () => {
      mocks.inviteToken = 'tok-123456789012345678'
      mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: true } })
      const user = mkUser()

      const { result } = renderHook(() => useInviteJoin(user, showToast))
      await waitFor(() => expect(result.current.status).toBe('needsName'))

      act(() => { result.current.submitName('   ') })

      expect(mocks.updateNameFn).not.toHaveBeenCalled()
      expect(replaceSpy).not.toHaveBeenCalled()
    })

    it('skipName ⇒ يوجّه للرحلة مباشرة بلا استدعاء updateMyTravelerName', async () => {
      mocks.inviteToken = 'tok-123456789012345678'
      mocks.joinFn.mockResolvedValue({ data: { success: true, tripId: 'trip-x', needsName: true } })
      const user = mkUser()

      const { result } = renderHook(() => useInviteJoin(user, showToast))
      await waitFor(() => expect(result.current.status).toBe('needsName'))

      act(() => { result.current.skipName() })

      expect(mocks.updateNameFn).not.toHaveBeenCalled()
      expect(replaceSpy).toHaveBeenCalledWith('https://example.test/?trip=trip-x')
    })
  })
})
