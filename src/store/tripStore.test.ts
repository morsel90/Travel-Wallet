// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createTripStore } from './tripStore'
import type { TripStoreState } from './tripStore'

const initial: TripStoreState = {
  data: {
    travelers: [], expenses: [], repayments: [], user: null, isAdmin: false, isOrganizer: false,
    currencies: {},
  },
  actions: {
    startEditExpense: () => {}, requestDeleteExpense: () => {},
    requestDeleteTraveler: () => {}, submitDeposit: () => true,
  },
}

describe('createTripStore', () => {
  it('يبدأ بالحالة الأولية المُمرَّرة كما هي', () => {
    const store = createTripStore(initial)
    expect(store.getState()).toBe(initial)
  })

  it('تحديث مفتاح data لا يمسّ هوية مفتاح actions', () => {
    const store = createTripStore(initial)
    const { actions } = store.getState()

    store.setState({ data: { ...initial.data, isAdmin: true } })

    expect(store.getState().actions).toBe(actions)
    expect(store.getState().data.isAdmin).toBe(true)
  })

  it('تحديث مفتاح actions لا يمسّ هوية مفتاح data', () => {
    const store = createTripStore(initial)
    const { data } = store.getState()
    const newStartEdit = () => {}

    store.setState({ actions: { ...initial.actions, startEditExpense: newStartEdit } })

    expect(store.getState().data).toBe(data)
    expect(store.getState().actions.startEditExpense).toBe(newStartEdit)
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
