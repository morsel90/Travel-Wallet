// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildTripBackup, backupFilename, findNonPortableValue, BackupNotPortableError, BACKUP_SCHEMA_VERSION } from './backup'
import { calculateBalances, calculateSettlements } from './calculations'
import type { Traveler, Expense, DepositLogEntry, Repayment } from '../types'

const traveler: Traveler = { id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 500 }
const expense: Expense = {
  id: 'e1', date: '2026-08-16', description: 'عشاء', amount: 100, originalAmount: 100,
  currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: Date.now(), createdByUid: 'u1',
}
const depositLog: DepositLogEntry = {
  id: 'd1', travelerId: 1, previousDeposited: 0, newDeposited: 500, delta: 500,
  mode: 'set', reason: null, changedByEmail: 'admin@example.com', changedByUid: 'admin1', createdAt: Date.now(),
}
const trip = {
  name: 'رحلة تركيا',
  itinerary: [], status: 'active' as const,
}

describe('buildTripBackup', () => {
  it('يحتفظ بكل الحقول الداخلية حرفياً — لا اشتقاق ولا إسقاط', () => {
    const backup = buildTripBackup({
      tripId: 'trip-1', trip, travelers: [traveler], expenses: [expense],
      depositLogs: [depositLog], travelerNames: [{ shortName: 'أحمد', travelerId: 1 }],
    })

    expect(backup.travelers[0]).toEqual(traveler)
    expect(backup.expenses[0]).toEqual(expense)
    expect(backup.depositLogs[0]).toEqual(depositLog)
    // ⚠️ هذا ما يميّزها عن تصدير Excel — deletedAt وcreatedByUid حاضران كما هما.
    expect(backup.expenses[0].createdByUid).toBe('u1')
  })

  it('يضبط schemaVersion وtripId ووقت التصدير', () => {
    const backup = buildTripBackup({
      tripId: 'trip-1', trip, travelers: [], expenses: [], depositLogs: [], travelerNames: [],
    })
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.tripId).toBe('trip-1')
    expect(() => new Date(backup.exportedAt).toISOString()).not.toThrow()
  })

  it('لا يشمل tripSecrets أو rateLimits أو members — ليست جزءاً من الشكل أصلاً', () => {
    const backup = buildTripBackup({
      tripId: 'trip-1', trip, travelers: [], expenses: [], depositLogs: [], travelerNames: [],
    })
    expect(backup).not.toHaveProperty('tripSecrets')
    expect(backup).not.toHaveProperty('rateLimits')
    expect(backup).not.toHaveProperty('members')
  })
})

// 🆕 الملف تأمين الخروج من Firebase — فيجب أن يكفي وحده، بلا أي SDK.
describe('النسخة مستقلة عن Firestore', () => {
  const second: Traveler = { id: 2, name: 'سارة', shortName: 'سارة', deposited: 300, uid: null }
  const trashed: Traveler = { id: 3, name: 'خالد', shortName: 'خالد', deposited: 0, deletedAt: 1_755_000_000_000 }
  const shared: Expense = {
    id: 'e2', date: '2026-08-17', description: 'تاكسي', amount: 90, originalAmount: 24,
    currency: 'USD', exchangeRate: 3.75, participants: [1, 2], shares: { '1': 2, '2': 1 },
    createdAt: 1_755_100_000_000, createdByUid: 'u2',
  }
  const params = {
    tripId: 'trip-1', trip: { ...trip, itinerary: [] },
    travelers: [traveler, second, trashed], expenses: [expense, shared],
    depositLogs: [depositLog], travelerNames: [{ shortName: 'أحمد', travelerId: 1 }, { shortName: 'سارة', travelerId: 2 }],
  }

  it('ينجو من JSON حرفياً — ما يُقرأ من الملف يساوي ما كُتب فيه', () => {
    const backup = buildTripBackup(params)
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup)
  })

  it('الملف وحده يعيد إنتاج الأرصدة والتسويات — لا حاجة لقاعدة البيانات', () => {
    const parsed = JSON.parse(JSON.stringify(buildTripBackup(params)))
    const fromFile = calculateBalances(parsed.travelers, parsed.expenses)
    expect(fromFile).toEqual(calculateBalances(params.travelers, params.expenses))
    expect(calculateSettlements(fromFile)).toEqual(calculateSettlements(calculateBalances(params.travelers, params.expenses)))
  })

  // ⚠️ الحالة السالبة — شكل Timestamp الفعلي: نسخة من صنف، لا كائن عادي. بلا
  // الفحص، JSON.stringify يكتبها `{"seconds":…,"nanoseconds":0}` بلا أي خطأ.
  class Timestamp { constructor(readonly seconds: number, readonly nanoseconds: number) {} }

  it('يرفض Timestamp في مستند ويسمّي موضعه بدقة', () => {
    const bad = { ...trashed, deletedAt: new Timestamp(1_755_000_000, 0) as unknown as number }
    const call = () => buildTripBackup({ ...params, travelers: [traveler, second, bad] })
    expect(call).toThrow(BackupNotPortableError)
    expect(call).toThrow('$.travelers[2].deletedAt')
    expect(call).toThrow('Timestamp')
  })

  it.each([
    ['NaN',            { ...expense, amount: NaN },                 '$.expenses[0].amount'],
    ['Infinity',       { ...expense, exchangeRate: Infinity },      '$.expenses[0].exchangeRate'],
    ['Date',           { ...expense, createdAt: new Date() },       '$.expenses[0].createdAt'],
    ['undefined في مصفوفة', { ...expense, participants: [1, undefined] }, '$.expenses[0].participants[1]'],
  ])('يرفض %s', (_label, badExpense, path) => {
    expect(() => buildTripBackup({ ...params, expenses: [badExpense as unknown as Expense] })).toThrow(path)
  })

  it('يقبل undefined كقيمة خاصية — يسقط المفتاح، وهو معنى الحقل الاختياري الغائب', () => {
    expect(findNonPortableValue({ a: 1, b: undefined })).toBeNull()
  })

  it('يقبل كائناً بلا نموذج أصل (Object.create(null))', () => {
    const o = Object.assign(Object.create(null), { a: [1, 'x', true, null] })
    expect(findNonPortableValue(o)).toBeNull()
  })
})

describe('backupFilename', () => {
  it('يحوي معرّف الرحلة وتاريخ اليوم بصيغة YYYY-MM-DD وامتداد json', () => {
    const name = backupFilename('trip-1')
    expect(name).toMatch(/^نسخة-احتياطية-trip-1-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

// 🆕 السداد في النسخة الاحتياطية — نسخةٌ بلا سدادها تُستعاد برحلة تُظهر ديوناً
// سُدّدت فعلاً.
describe('buildTripBackup — السداد', () => {
  const base = { tripId: 'trip-1', trip, travelers: [traveler], expenses: [], depositLogs: [], travelerNames: [] }

  it('يحمل قيود السداد بالمفاتيح التي تقبلها الاستعادة وحدها — بلا _pending', () => {
    const r: Repayment = {
      id: 'r1', fromId: 1, toId: 2, amount: 50, date: '2026-09-19', createdAt: 5, createdByUid: 'u1', _pending: true,
    }
    const backup = buildTripBackup({ ...base, repayments: [r] })
    expect(backup.repayments).toEqual([{
      id: 'r1', fromId: 1, toId: 2, amount: 50, date: '2026-09-19', createdAt: 5, createdByUid: 'u1', deletedAt: null,
    }])
  })

  it('غياب السداد يُنتج قائمة فارغة لا حقلاً غائباً', () => {
    expect(buildTripBackup(base).repayments).toEqual([])
  })
})

