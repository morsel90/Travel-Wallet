import { describe, it, expect } from 'vitest'
import { createTripStore } from './tripStore'
import type { TripStoreState } from './tripStore'

const initial: TripStoreState = {
  data: {
    travelers: [], expenses: [], user: null, isAdmin: false,
    currencies: {}, ratesUpdatedAt: null,
  },
  actions: {
    cancelExpenseForm: () => {}, startEditExpense: () => {}, requestDeleteExpense: () => {},
    openDeposit: () => {}, requestDeleteTraveler: () => {}, openDepositHistory: () => {},
  },
  form: {
    expenseForm: {
      date: '', description: '', amount: '', currency: 'SAR', exchangeRate: '1',
      participants: [], category: '', splitMode: 'equal', shares: {}, paidBy: 'fund',
    },
    setExpenseForm: () => {}, isExpenseFormOpen: false, isEditingExpense: false,
    submitExpense: () => {}, toggleParticipant: () => {}, toggleAllParticipants: () => {},
  },
}

describe('createTripStore', () => {
  it('يبدأ بالحالة الأولية المُمرَّرة كما هي', () => {
    const store = createTripStore(initial)
    expect(store.getState()).toBe(initial)
  })

  it('تحديث مفتاح data لا يمسّ هوية مفتاحي actions وform', () => {
    const store = createTripStore(initial)
    const { actions, form } = store.getState()

    store.setState({ data: { ...initial.data, isAdmin: true } })

    expect(store.getState().actions).toBe(actions)
    expect(store.getState().form).toBe(form)
    expect(store.getState().data.isAdmin).toBe(true)
  })

  it('تحديث مفتاح actions لا يمسّ هوية مفتاحي data وform', () => {
    const store = createTripStore(initial)
    const { data, form } = store.getState()
    const newCancel = () => {}

    store.setState({ actions: { ...initial.actions, cancelExpenseForm: newCancel } })

    expect(store.getState().data).toBe(data)
    expect(store.getState().form).toBe(form)
    expect(store.getState().actions.cancelExpenseForm).toBe(newCancel)
  })

  it('تحديث مفتاح form لا يمسّ هوية مفتاحي data وactions', () => {
    const store = createTripStore(initial)
    const { data, actions } = store.getState()

    store.setState({ form: { ...initial.form, isExpenseFormOpen: true } })

    expect(store.getState().data).toBe(data)
    expect(store.getState().actions).toBe(actions)
    expect(store.getState().form.isExpenseFormOpen).toBe(true)
  })

  it('نسختان منفصلتان لا تتشاركان الحالة', () => {
    const storeA = createTripStore(initial)
    const storeB = createTripStore({ ...initial, data: { ...initial.data, isAdmin: true } })

    expect(storeA.getState().data.isAdmin).toBe(false)
    expect(storeB.getState().data.isAdmin).toBe(true)

    storeA.setState({ data: { ...storeA.getState().data, isAdmin: true } })
    expect(storeB.getState().data.isAdmin).toBe(true)
  })
})
