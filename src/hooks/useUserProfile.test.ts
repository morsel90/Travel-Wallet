import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useUserProfile } from './useUserProfile'

const mocks = vi.hoisted(() => ({ onSnapshot: vi.fn(), setDoc: vi.fn() }))

vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
  setDoc: mocks.setDoc,
}))
vi.mock('../firestore', () => ({
  userProfileDoc: vi.fn((uid: string) => ({ __userDoc: uid })),
}))

const fakeUser = { uid: 'user-1' } as User

/** يشغّل رد onSnapshot الأخير فوراً بلقطة معطاة، ويعيد دالة إلغاء الاشتراك. */
const emitSnapshot = (data: Record<string, unknown> | undefined) => {
  const [, onNext] = mocks.onSnapshot.mock.calls[mocks.onSnapshot.mock.calls.length - 1]
  onNext({ exists: () => data !== undefined, data: () => data })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onSnapshot.mockReturnValue(vi.fn())
  mocks.setDoc.mockResolvedValue(undefined)
})

describe('useUserProfile', () => {
  it('بلا مستخدم: بروفايل افتراضي بلا اشتراك', () => {
    const { result } = renderHook(() => useUserProfile(null))
    expect(mocks.onSnapshot).not.toHaveBeenCalled()
    expect(result.current.profile.bankDetails?.paymentType).toBe('bank')
  })

  it('مستند غير موجود: يسقط للافتراضي (bank بحقول فارغة)', () => {
    const { result } = renderHook(() => useUserProfile(fakeUser))
    act(() => emitSnapshot(undefined))
    expect(result.current.profile.bankDetails).toEqual({
      paymentType: 'bank', bankName: '', beneficiary: '', iban: '', walletName: '', walletPhone: '',
    })
  })

  it('يقرأ بيانات حساب بنكي قديم بلا paymentType كـ bank', () => {
    const { result } = renderHook(() => useUserProfile(fakeUser))
    act(() => emitSnapshot({
      displayName: 'أحمد',
      bankDetails: { bankName: 'بنك الرياض', beneficiary: 'أحمد', iban: 'SA00' },
    }))
    expect(result.current.profile.bankDetails).toEqual({
      paymentType: 'bank', bankName: 'بنك الرياض', beneficiary: 'أحمد', iban: 'SA00', walletName: '', walletPhone: '',
    })
  })

  it('يقرأ بيانات محفظة رقمية', () => {
    const { result } = renderHook(() => useUserProfile(fakeUser))
    act(() => emitSnapshot({
      displayName: 'سارة',
      bankDetails: { paymentType: 'wallet', walletName: 'stc pay', walletPhone: '0512345678' },
    }))
    expect(result.current.profile.bankDetails).toEqual({
      paymentType: 'wallet', bankName: '', beneficiary: '', iban: '', walletName: 'stc pay', walletPhone: '0512345678',
    })
  })

  it('paymentType بقيمة غير wallet يُقرأ كـ bank دفاعياً', () => {
    const { result } = renderHook(() => useUserProfile(fakeUser))
    act(() => emitSnapshot({ bankDetails: { paymentType: 'not-a-real-type' } }))
    expect(result.current.profile.bankDetails?.paymentType).toBe('bank')
  })

  it('saveProfile يكتب bankDetails كاملاً بـ merge:true', async () => {
    const { result } = renderHook(() => useUserProfile(fakeUser))
    await act(async () => {
      await result.current.saveProfile({
        displayName: 'أحمد',
        bankDetails: { paymentType: 'wallet', bankName: '', beneficiary: '', iban: '', walletName: 'برق', walletPhone: '0501234567' },
      })
    })
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { __userDoc: 'user-1' },
      { displayName: 'أحمد', bankDetails: { paymentType: 'wallet', bankName: '', beneficiary: '', iban: '', walletName: 'برق', walletPhone: '0501234567' } },
      { merge: true },
    )
  })

  it('لا يكتب شيئاً بلا مستخدم', async () => {
    const { result } = renderHook(() => useUserProfile(null))
    await act(async () => {
      await result.current.saveProfile({ displayName: 'x', bankDetails: { paymentType: 'bank', bankName: '', beneficiary: '', iban: '' } })
    })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
