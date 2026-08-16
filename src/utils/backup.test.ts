import { describe, it, expect } from 'vitest'
import { buildTripBackup, backupFilename, BACKUP_SCHEMA_VERSION } from './backup'
import type { Traveler, Expense, DepositLogEntry } from '../types'

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
  name: 'رحلة تركيا', bankDetails: { bankName: '', beneficiary: '', iban: '' },
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

describe('backupFilename', () => {
  it('يحوي معرّف الرحلة وتاريخ اليوم بصيغة YYYY-MM-DD وامتداد json', () => {
    const name = backupFilename('trip-1')
    expect(name).toMatch(/^نسخة-احتياطية-trip-1-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
