import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModals } from './useModals'
import type { Traveler } from '../types'

const traveler: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null }

describe('useModals', () => {
  it('يبدأ مغلقاً (type: none)', () => {
    const { result } = renderHook(() => useModals())
    expect(result.current.modal).toEqual({ type: 'none' })
  })

  it('يفتح مودال التقارير', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openReports())
    expect(result.current.modal).toEqual({ type: 'reports' })
  })

  it('يفتح مودال سلة المهملات', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openTrashBin())
    expect(result.current.modal).toEqual({ type: 'trashBin' })
  })

  it('يفتح مودال إدارة الرحلة', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openTripAdmin())
    expect(result.current.modal).toEqual({ type: 'tripAdmin' })
  })

  it('يفتح مودال حذف مسافر مع بيانات المسافر', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openDeleteTraveler(traveler))
    expect(result.current.modal).toEqual({ type: 'deleteTraveler', traveler })
  })

  it('يفتح مودال الإيداع مع بيانات المسافر', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openDeposit(traveler))
    expect(result.current.modal).toEqual({ type: 'deposit', traveler })
  })

  it('يفتح مودال سجل الإيداعات مع بيانات المسافر', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openDepositHistory(traveler))
    expect(result.current.modal).toEqual({ type: 'depositHistory', traveler })
  })

  it('يغلق أي مودال مفتوح عند closeModal', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openReports())
    expect(result.current.modal.type).toBe('reports')

    act(() => result.current.closeModal())
    expect(result.current.modal).toEqual({ type: 'none' })
  })

  it('فتح مودال جديد يستبدل أي مودال مفتوح مسبقاً — مودال واحد فقط في كل مرة', () => {
    const { result } = renderHook(() => useModals())
    act(() => result.current.openReports())
    expect(result.current.modal.type).toBe('reports')

    act(() => result.current.openTrashBin())
    expect(result.current.modal).toEqual({ type: 'trashBin' })
  })
})
