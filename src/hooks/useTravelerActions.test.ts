import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FormEvent } from 'react'
import { renderHook, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { useTravelerActions } from './useTravelerActions'
import type { Traveler } from '../types'

const mocks = vi.hoisted(() => ({
  batchSet: vi.fn(),
  batchUpdate: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
  haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn(), flash: vi.fn() },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: unknown) => ({ __newDocIn: col })),
  writeBatch: vi.fn(() => ({
    set: mocks.batchSet, update: mocks.batchUpdate, delete: mocks.batchDelete, commit: mocks.batchCommit,
  })),
}))

vi.mock('../firebase', () => ({ db: {} }))

vi.mock('../firestore', () => ({
  travelerDoc: vi.fn((id: number) => ({ __travelerDoc: id })),
  travelerNameDoc: vi.fn((shortName: string) => ({ __travelerNameDoc: shortName })),
  depositLogsCol: vi.fn((travelerId: number) => ({ __depositLogsCol: travelerId })),
}))

vi.mock('../utils/haptics', () => ({ haptic: mocks.haptic }))

const travelerActive: Traveler = { id: 1, name: 'أحمد الغامدي', shortName: 'أحمد', deposited: 1000, deletedAt: null }
const travelerTrashed: Traveler = { id: 2, name: 'سعد المطيري', shortName: 'سعد', deposited: 500, deletedAt: Date.now() }
const fakeUser = { uid: 'user-1' } as User
const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>

type Params = Parameters<typeof useTravelerActions>[0]

function setup(overrides: Partial<Params> = {}) {
  const setTravelers = vi.fn()
  const showToast = vi.fn()
  const handleFirestoreError = vi.fn()
  const setSyncError = vi.fn()
  const closeModal = vi.fn()
  const params: Params = {
    travelers: [travelerActive, travelerTrashed],
    activeTravelers: [travelerActive],
    user: null,
    setTravelers,
    showToast,
    handleFirestoreError,
    setSyncError,
    closeModal,
    ...overrides,
  }
  const view = renderHook((p: Params) => useTravelerActions(p), { initialProps: params })
  return { ...view, setTravelers, showToast, handleFirestoreError, setSyncError, closeModal }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.batchCommit.mockResolvedValue(undefined)
})

describe('useTravelerActions — إضافة مسافر', () => {
  it('لا يفعل شيئاً عند اسم فارغ', () => {
    const { result, setTravelers } = setup()
    act(() => result.current.handleAddTraveler(fakeEvent()))
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('يرفض اسماً غير صالح كمعرّف مستند (يحوي "/") بلا لمس Firestore', () => {
    const { result, setTravelers, setSyncError } = setup()
    act(() => result.current.setNewTravelerName('خالد/سالم'))
    act(() => result.current.handleAddTraveler(fakeEvent()))
    expect(setSyncError).toHaveBeenCalledWith(expect.stringContaining('غير صالح'))
    expect(setTravelers).not.toHaveBeenCalled()
    expect(mocks.haptic.error).toHaveBeenCalled()
  })

  it('يرفض اسماً مختصراً مكرراً بين المسافرين النشطين', () => {
    const { result, setTravelers, setSyncError } = setup()
    act(() => result.current.setNewTravelerName('أحمد آخر'))
    act(() => result.current.handleAddTraveler(fakeEvent()))
    expect(setSyncError).toHaveBeenCalledWith(expect.stringContaining('أحمد'))
    expect(setTravelers).not.toHaveBeenCalled()
  })

  it('لا يرفض اسماً يطابق مسافراً في السلة فقط (الفحص على النشطين فقط)', () => {
    // travelerTrashed.shortName === 'سعد' لكنه محذوف — الاسم متاح لإعادة الاستخدام
    const { result, setTravelers } = setup({ user: null })
    act(() => result.current.setNewTravelerName('سعد الجديد'))
    act(() => result.current.handleAddTraveler(fakeEvent()))
    expect(setTravelers).toHaveBeenCalledTimes(1)
  })

  // ⚠️ الرصيد الابتدائي مبلغ مالي يخضع للقاعدة ١٩. والحارس القديم
  // `parseFloat(x) || 0` كان يمرّر Infinity لأنها قيمة صادقة — فتُكتب في
  // Firestore (القواعد تقبل `Infinity >= 0`) ويصير كل ما يُشتق منها غير منتهٍ.
  describe('الرصيد الابتدائي — حارس القاعدة ١٩', () => {
    it.each(['Infinity', '-Infinity', 'abc', '.', '-5'])(
      'يرفض «%s» ولا يلمس Firestore ولا الحالة المحلية',
      raw => {
        const { result, setTravelers, setSyncError } = setup()
        act(() => {
          result.current.setNewTravelerName('فهد القحطاني')
          result.current.setNewTravelerDeposit(raw)
        })
        act(() => result.current.handleAddTraveler(fakeEvent()))

        expect(setSyncError).toHaveBeenCalledWith(expect.stringContaining('الرصيد الابتدائي'))
        expect(setTravelers).not.toHaveBeenCalled()
        expect(mocks.batchCommit).not.toHaveBeenCalled()
        expect(mocks.haptic.error).toHaveBeenCalled()
      },
    )

    it('يُبقي النموذج مفتوحاً بقيمه بعد الرفض فيمكن التصحيح', () => {
      const { result } = setup()
      act(() => {
        result.current.setNewTravelerName('فهد القحطاني')
        result.current.setNewTravelerDeposit('Infinity')
      })
      act(() => result.current.handleAddTraveler(fakeEvent()))

      expect(result.current.newTravelerName).toBe('فهد القحطاني')
      expect(result.current.newTravelerDeposit).toBe('Infinity')
    })

    it('الحقل الفارغ يعني صفراً لا خطأً — الرصيد الابتدائي اختياري', () => {
      const { result, setTravelers, setSyncError } = setup()
      act(() => result.current.setNewTravelerName('فهد القحطاني'))
      act(() => result.current.handleAddTraveler(fakeEvent()))

      expect(setSyncError).not.toHaveBeenCalled()
      expect(setTravelers.mock.calls[0][0]([])[0]).toMatchObject({ deposited: 0 })
    })

    it('صفر صريح مقبول', () => {
      const { result, setTravelers } = setup()
      act(() => {
        result.current.setNewTravelerName('فهد القحطاني')
        result.current.setNewTravelerDeposit('0')
      })
      act(() => result.current.handleAddTraveler(fakeEvent()))
      expect(setTravelers.mock.calls[0][0]([])[0]).toMatchObject({ deposited: 0 })
    })
  })

  // ⚠️ هذه هي C1: كان أي عضو يستطيع إنشاء مسافر برصيد ابتدائي عشوائي **بلا أي
  // سطر تدقيق** — بينما تعديل نفس الحقل لاحقاً محكوم بـ isAdmin() ويكتب سطراً
  // غير قابل للتعديل. فمن أراد إضافة مال بلا أثر لا يفتح نافذة الإيداع.
  describe('الرصيد الابتدائي يمرّ من المسار الموثَّق', () => {
    it('ينشئ المسافر بصفر ويكتب حركة إيداع وتحديث الرصيد في نفس الدفعة', () => {
      const { result } = setup({ user: fakeUser })
      act(() => {
        result.current.setNewTravelerName('فهد القحطاني')
        result.current.setNewTravelerDeposit('3000')
      })
      act(() => result.current.handleAddTraveler(fakeEvent()))

      // المستند يُنشأ بصفر — القاعدة تفرضه، والرصيد يصل عبر الحركة لا عبر الإنشاء
      const travelerWrite = mocks.batchSet.mock.calls.find(
        c => (c[0] as { __travelerDoc?: number }).__travelerDoc !== undefined,
      )
      expect(travelerWrite?.[1]).toMatchObject({ name: 'فهد القحطاني', deposited: 0 })

      // سطر التدقيق: من، وكم، ولماذا
      const logWrite = mocks.batchSet.mock.calls.find(
        c => (c[1] as { travelerId?: number })?.travelerId !== undefined,
      )
      expect(logWrite?.[1]).toMatchObject({
        previousDeposited: 0,
        newDeposited: 3000,
        delta: 3000,
        mode: 'set',
        changedByUid: 'user-1',
      })
      expect((logWrite?.[1] as { reason: string }).reason).toContain('رصيد ابتدائي')

      // ثم يصل الرصيد فعلاً
      expect(mocks.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ __travelerDoc: expect.any(Number) }),
        { deposited: 3000 },
      )
      expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
    })

    it('بلا رصيد ابتدائي: لا سطر تدقيق ولا تحديث — دفعة الإنشاء وحدها', () => {
      const { result } = setup({ user: fakeUser })
      act(() => result.current.setNewTravelerName('فهد القحطاني'))
      act(() => result.current.handleAddTraveler(fakeEvent()))

      // المسافر + حجز الاسم فقط
      expect(mocks.batchSet).toHaveBeenCalledTimes(2)
      expect(mocks.batchUpdate).not.toHaveBeenCalled()
    })

    // ⚠️ الذرّية هي الضمان كله: مسافرٌ برصيد بلا سطر تدقيق هو الحالة التي وُجد
    // هذا التغيير لإغلاقها. دفعة واحدة تعني وجودهما معاً أو عدمهما معاً.
    it('كل الكتابات في دفعة واحدة — لا commit ثانٍ', () => {
      const { result } = setup({ user: fakeUser })
      act(() => {
        result.current.setNewTravelerName('فهد القحطاني')
        result.current.setNewTravelerDeposit('3000')
      })
      act(() => result.current.handleAddTraveler(fakeEvent()))
      expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
    })
  })

  it('محلياً (بلا مستخدم): يضيف مسافراً بالاسم المختصر والإيداع المحوَّل رقمياً', () => {
    const { result, setTravelers } = setup()
    act(() => {
      result.current.setNewTravelerName('  فهد القحطاني  ')
      result.current.setNewTravelerDeposit('750.5')
    })
    act(() => result.current.handleAddTraveler(fakeEvent()))

    expect(setTravelers).toHaveBeenCalledTimes(1)
    const next = setTravelers.mock.calls[0][0]([])
    expect(next[0]).toMatchObject({ name: 'فهد القحطاني', shortName: 'فهد', deposited: 750.5, deletedAt: null })
    expect(result.current.isAddingTraveler).toBe(false)
    expect(result.current.newTravelerName).toBe('')
  })

  it('إيداع غير رقمي يُعامَل كصفر بدل NaN', () => {
    const { result, setTravelers } = setup()
    act(() => {
      result.current.setNewTravelerName('نورة')
      result.current.setNewTravelerDeposit('غير رقم')
    })
    act(() => result.current.handleAddTraveler(fakeEvent()))
    const next = setTravelers.mock.calls[0][0]([])
    expect(next[0].deposited).toBe(0)
  })

  it('عبر Firestore: يكتب مستند المسافر وحجز الاسم بنفس المعرّف في دفعة واحدة', async () => {
    const { result } = setup({ user: fakeUser })
    act(() => result.current.setNewTravelerName('فهد القحطاني'))
    act(() => result.current.handleAddTraveler(fakeEvent()))
    await Promise.resolve()

    expect(mocks.batchSet).toHaveBeenCalledTimes(2)
    const [travelerDocArg, travelerPayload] = mocks.batchSet.mock.calls[0]
    const [nameDocArg, namePayload] = mocks.batchSet.mock.calls[1]
    expect(nameDocArg).toEqual({ __travelerNameDoc: 'فهد' })
    expect(namePayload).toEqual({ travelerId: travelerPayload.id })
    expect(travelerDocArg).toEqual({ __travelerDoc: travelerPayload.id })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('فشل الحجز (تعارض اسم) يستدعي handleFirestoreError برسالة تعارض واضحة', async () => {
    mocks.batchCommit.mockRejectedValueOnce(new Error('conflict'))
    const { result, handleFirestoreError } = setup({ user: fakeUser })
    act(() => result.current.setNewTravelerName('فهد القحطاني'))
    act(() => result.current.handleAddTraveler(fakeEvent()))
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining('أصبح مستخدماً للتو من جهاز آخر')
    )
  })
})

describe('useTravelerActions — حذف واستعادة', () => {
  it('محلياً: confirmDeleteTraveler يزيل المسافر من القائمة ويغلق المودال', () => {
    const { result, setTravelers, closeModal, showToast } = setup()
    act(() => result.current.confirmDeleteTraveler(1))
    expect(closeModal).toHaveBeenCalled()
    const next = setTravelers.mock.calls[0][0]([travelerActive, travelerTrashed])
    expect(next).toEqual([travelerTrashed])
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'تم نقل المسافر إلى سلة المهملات', onUndo: expect.any(Function) }),
      5000
    )
  })

  it('عبر Firestore: confirmDeleteTraveler يحدّث deletedAt ويحذف حجز الاسم في نفس الدفعة', () => {
    const { result } = setup({ user: fakeUser })
    act(() => result.current.confirmDeleteTraveler(1))
    expect(mocks.batchUpdate).toHaveBeenCalledWith({ __travelerDoc: 1 }, { deletedAt: expect.any(Number) })
    expect(mocks.batchDelete).toHaveBeenCalledWith({ __travelerNameDoc: 'أحمد' })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('handleRestoreTraveler بلا مستخدم لا يفعل شيئاً (لا Firestore حقيقياً في هذا المسار)', () => {
    const { result } = setup({ user: null })
    act(() => result.current.handleRestoreTraveler(2))
    expect(mocks.batchCommit).not.toHaveBeenCalled()
  })

  it('handleRestoreTraveler على معرّف غير موجود لا يفعل شيئاً', () => {
    const { result } = setup({ user: fakeUser })
    act(() => result.current.handleRestoreTraveler(999))
    expect(mocks.batchCommit).not.toHaveBeenCalled()
  })

  it('عبر Firestore: handleRestoreTraveler يعيد deletedAt لـ null ويعيد حجز الاسم', () => {
    const { result } = setup({ user: fakeUser })
    act(() => result.current.handleRestoreTraveler(2))
    expect(mocks.batchUpdate).toHaveBeenCalledWith({ __travelerDoc: 2 }, { deletedAt: null })
    expect(mocks.batchSet).toHaveBeenCalledWith({ __travelerNameDoc: 'سعد' }, { travelerId: 2 })
  })
})
