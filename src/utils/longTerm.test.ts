import { describe, it, expect } from 'vitest'
import {
  ROLLOVER_EPSILON, settlementDirection, planRollover, countRolloverMovements, describeExitBlock,
  describeOrganizerExitBlock,
} from './longTerm'
import type { TravelerBalance } from '../types'

const balance = (over: Partial<TravelerBalance>): TravelerBalance => ({
  id: 1, name: 'سعد', shortName: 'سعد', deposited: 0,
  totalExpenses: 0, remaining: 0, ...over,
})

describe('settlementDirection', () => {
  it('يميّز الدائن من المدين', () => {
    expect(settlementDirection(150)).toBe('credit')
    expect(settlementDirection(-150)).toBe('debt')
  })

  // نفس عتبة calculateSettlements — رصيد شبه صفري ليس ديناً.
  it('يعتبر ما دون الهللة مسوّى', () => {
    expect(settlementDirection(0)).toBe('settled')
    expect(settlementDirection(ROLLOVER_EPSILON)).toBe('settled')
    expect(settlementDirection(-ROLLOVER_EPSILON)).toBe('settled')
    expect(settlementDirection(0.005)).toBe('settled')
  })

  // القاعدة ١٩ — رصيد غير منتهٍ لا تُبنى عليه حركة مالية.
  it('يعتبر الرصيد غير المنتهي مسوّى لا حركة', () => {
    expect(settlementDirection(NaN)).toBe('settled')
    expect(settlementDirection(Infinity)).toBe('settled')
    expect(settlementDirection(-Infinity)).toBe('settled')
  })
})

describe('planRollover', () => {
  it('يبني حركة لكل مسافر باتجاهها ومبلغها', () => {
    const plan = planRollover([
      balance({ id: 1, name: 'سعد',  remaining: 300 }),
      balance({ id: 2, name: 'خالد', remaining: -120.5 }),
      balance({ id: 3, name: 'سارة', remaining: 0 }),
    ])

    expect(plan).toEqual([
      { travelerId: 1, travelerName: 'سعد',  remaining: 300,    direction: 'credit' },
      { travelerId: 2, travelerName: 'خالد', remaining: -120.5, direction: 'debt' },
      { travelerId: 3, travelerName: 'سارة', remaining: 0,      direction: 'settled' },
    ])
  })

  it('يطهّر الرصيد غير المنتهي إلى صفر بدل تسريبه للمعاينة', () => {
    const [movement] = planRollover([balance({ remaining: NaN })])
    expect(movement.remaining).toBe(0)
    expect(movement.direction).toBe('settled')
  })

  it('يعدّ الحركات الفعلية دون المسوّين', () => {
    const plan = planRollover([
      balance({ id: 1, remaining: 300 }),
      balance({ id: 2, remaining: 0 }),
      balance({ id: 3, remaining: -5 }),
    ])
    expect(countRolloverMovements(plan)).toBe(2)
  })
})

describe('describeExitBlock', () => {
  // ⚠️ الحارس الأهم: الرحلة القياسية لا يتغيّر سلوكها بحرف.
  it('لا يمنع شيئاً في الرحلة القياسية مهما كان الرصيد', () => {
    expect(describeExitBlock('standard', 'سعد', 5000)).toBeNull()
    expect(describeExitBlock('standard', 'سعد', -5000)).toBeNull()
  })

  it('يسمح بالخروج عند رصيد مسوّى في الرحلة الطويلة', () => {
    expect(describeExitBlock('long_term', 'سعد', 0)).toBeNull()
    expect(describeExitBlock('long_term', 'سعد', ROLLOVER_EPSILON)).toBeNull()
  })

  it('يمنع الخروج ويسمّي المبلغ والاتجاه', () => {
    expect(describeExitBlock('long_term', 'سعد', 300)).toContain('له رصيد متبقٍّ 300.00 ريال')
    expect(describeExitBlock('long_term', 'خالد', -120.5)).toContain('عليه 120.50 ريال')
  })
})

describe('describeOrganizerExitBlock', () => {
  it('يمنع منظّم الرحلة من إخراج نفسه', () => {
    expect(describeOrganizerExitBlock('uid-1', 'uid-1', 'محمد')).toContain('محمد')
  })

  it('لا يمنع عضواً عادياً مهما كان uid موجوداً', () => {
    expect(describeOrganizerExitBlock('uid-2', 'uid-1', 'سعد')).toBeNull()
  })

  it('لا يمنع شيئاً حين يغيب uid المسافر أو organizerUid', () => {
    expect(describeOrganizerExitBlock(null, 'uid-1', 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock(undefined, 'uid-1', 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock('uid-1', undefined, 'سعد')).toBeNull()
    expect(describeOrganizerExitBlock('uid-1', null, 'سعد')).toBeNull()
  })
})
