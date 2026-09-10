import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModals } from './useModals'

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

  // ⚠️ **حارس نفي**: ثلاث حالات غادرت الاتحاد (تأكيد حذف المسافر، الإيداع،
  // سجل الإيداعات) — انظر أسبابها في رأس useModals.ts. هذا التأكيد هو ما
  // يمنع عودة أيّها بصمت كنافذة مستقلّة في أول تحرير لاحق: بلا اختبار على
  // *غياب* شيء، لا يسقط شيء حين يعود.
  it('لا يعرف فتّاحات للنوافذ الثلاث المحذوفة', () => {
    const { result } = renderHook(() => useModals())
    const openers = Object.keys(result.current)
    expect(openers).not.toContain('openDeleteTraveler')
    expect(openers).not.toContain('openDeposit')
    expect(openers).not.toContain('openDepositHistory')
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
