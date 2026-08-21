import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useSyncTravelerNameFromProfile } from './useSyncTravelerNameFromProfile'
import type { Traveler } from '../types'

// 🆕 نفس نمط useInviteJoin.test.ts: نحاكي httpsCallable لنتحكم بالاستدعاء بلا
// اتصال شبكة فعلي، ونتحقّق من *متى* يُستدعى — هذا جوهر ما يختبره هذا الملف.
const mocks = vi.hoisted(() => ({ updateNameFn: vi.fn() }))

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mocks.updateNameFn,
}))
vi.mock('../firebase', () => ({ functions: {} }))

function mkUser(uid = 'uid-1'): User {
  return { uid } as User
}

function mkTraveler(overrides: Partial<Traveler> = {}): Traveler {
  return { id: 1, name: 'مسافر جديد', shortName: 'مسافر', deposited: 0, ...overrides }
}

describe('useSyncTravelerNameFromProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateNameFn.mockResolvedValue({ data: { success: true } })
  })

  it('يستدعي updateMyTravelerName حين يختلف اسم مسافري عن اسم بروفايلي', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'مسافر جديد' })
    renderHook(() => useSyncTravelerNameFromProfile('trip-1', mkUser(), [traveler], 'أحمد'))

    expect(mocks.updateNameFn).toHaveBeenCalledWith({ tripId: 'trip-1', name: 'أحمد' })
  })

  it('لا يستدعي شيئاً حين يتطابق الاسمان أصلاً', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'أحمد' })
    renderHook(() => useSyncTravelerNameFromProfile('trip-1', mkUser(), [traveler], 'أحمد'))

    expect(mocks.updateNameFn).not.toHaveBeenCalled()
  })

  it('لا يستدعي شيئاً حين لا يملك البروفايل اسماً بعد (فارغ أو غير معرَّف)', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'مسافر جديد' })
    const initialProps: { name: string | undefined } = { name: undefined }
    const { rerender } = renderHook(
      ({ name }) => useSyncTravelerNameFromProfile('trip-1', mkUser(), [traveler], name),
      { initialProps },
    )
    expect(mocks.updateNameFn).not.toHaveBeenCalled()

    rerender({ name: '   ' })
    expect(mocks.updateNameFn).not.toHaveBeenCalled()
  })

  it('لا يستدعي شيئاً حين لا يوجد مسافر مربوط بهذا الحساب في هذه الرحلة', () => {
    const traveler = mkTraveler({ uid: 'someone-else', name: 'شخص آخر' })
    renderHook(() => useSyncTravelerNameFromProfile('trip-1', mkUser(), [traveler], 'أحمد'))

    expect(mocks.updateNameFn).not.toHaveBeenCalled()
  })

  it('لا يستدعي شيئاً بلا مستخدم مسجّل دخوله', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'مسافر جديد' })
    renderHook(() => useSyncTravelerNameFromProfile('trip-1', null, [traveler], 'أحمد'))

    expect(mocks.updateNameFn).not.toHaveBeenCalled()
  })

  it('لا يعيد إرسال نفس القيمة مرتين حتى لو أعاد traveler.name القديم الرسم', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'مسافر جديد' })
    const { rerender } = renderHook(
      ({ travelers }: { travelers: Traveler[] }) =>
        useSyncTravelerNameFromProfile('trip-1', mkUser(), travelers, 'أحمد'),
      { initialProps: { travelers: [traveler] } },
    )
    expect(mocks.updateNameFn).toHaveBeenCalledTimes(1)

    // نسخة جديدة من نفس المصفوفة (كما يحدث مع كل عرض حيّ من Firestore) قبل
    // وصول التحديث الفعلي — traveler.name لا يزال قديماً في هذه اللقطة.
    rerender({ travelers: [{ ...traveler }] })
    expect(mocks.updateNameFn).toHaveBeenCalledTimes(1)
  })

  it('يعيد المحاولة لقيمة جديدة إن غيّر بروفايله اسمه مجدداً', () => {
    const traveler = mkTraveler({ uid: 'uid-1', name: 'مسافر جديد' })
    const { rerender } = renderHook(
      ({ name }: { name: string }) =>
        useSyncTravelerNameFromProfile('trip-1', mkUser(), [traveler], name),
      { initialProps: { name: 'أحمد' } },
    )
    expect(mocks.updateNameFn).toHaveBeenCalledTimes(1)

    rerender({ name: 'محمد' })
    expect(mocks.updateNameFn).toHaveBeenCalledTimes(2)
    expect(mocks.updateNameFn).toHaveBeenLastCalledWith({ tripId: 'trip-1', name: 'محمد' })
  })
})
