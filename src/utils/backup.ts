// 🆕 نسخة احتياطية JSON لرحلة واحدة — docs/PLAN-backup-recovery.md المرحلة ١.
//
// ⚠️ هذا ليس تصدير Excel بديلاً — هو الشيء الوحيد الذي ينجو من فقدان حساب
// Google/Firebase نفسه (نسخ Firestore التلقائي في المرحلة ٠ يعيش داخل نفس
// مشروع GCP، فيضيع معه). يحتفظ بكل حقل داخلي قابل لإعادة الاستيراد لاحقاً —
// بعكس Excel الذي يُسقط deletedAt وcreatedByUid والمعرّفات الداخلية عمداً
// لأنه مبنيّ للقراءة البشرية لا لإعادة البناء.
//
// ما يُستبعَد عمداً (انظر الخطة لتفصيل كل استبعاد):
//   - rateLimits — حالة تشغيلية عابرة، لا بيانات
//   - trips/{tripId}/members — فهرس إداري لا مصدر صلاحية؛ استعادته لا تُعيد
//     لأحد وصوله (العضوية الفعلية في custom claims حساب كل عضو لا Firestore)
import type { DepositLogEntry, Expense, ItinerarySegment, Traveler, TripStatus } from '../types'

export const BACKUP_SCHEMA_VERSION = 1 as const

// 🆕 لا bankDetails في trip هنا بعد اليوم — بيانات البنك مصدرها الوحيد بروفايل
// المنظّم (users/{organizerUid})، لا مستند الرحلة، فلا معنى لنسخها احتياطياً
// ضمنه. استعادة رحلة قديمة (schemaVersion=1 من قبل هذا التغيير) تتجاهل حقل
// bankDetails في الملف إن وُجد — انظر functions/index.js: restoreTrip.
export interface TripBackup {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  exportedAt: string
  tripId: string
  trip: {
    name: string
    itinerary: ItinerarySegment[]
    status: TripStatus
  }
  travelers: Traveler[]
  expenses: Expense[]
  depositLogs: DepositLogEntry[]
  /** حجوزات الأسماء المختصرة — travelerNames/{shortName} → { travelerId } في Firestore. */
  travelerNames: Array<{ shortName: string; travelerId: number }>
}

export interface BuildTripBackupParams {
  tripId: string
  trip: { name: string; itinerary: ItinerarySegment[]; status: TripStatus }
  travelers: Traveler[]
  expenses: Expense[]
  depositLogs: DepositLogEntry[]
  travelerNames: Array<{ shortName: string; travelerId: number }>
}

/** دالة نقية — لا قراءة Firestore هنا، فقط تجميع الشكل النهائي. */
export function buildTripBackup(params: BuildTripBackupParams): TripBackup {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tripId: params.tripId,
    trip: params.trip,
    travelers: params.travelers,
    expenses: params.expenses,
    depositLogs: params.depositLogs,
    travelerNames: params.travelerNames,
  }
}

export function backupFilename(tripId: string): string {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `نسخة-احتياطية-${tripId}-${today}.json`
}

/** يبني الملف وينزّله في المتصفح مباشرةً عبر رابط Blob مؤقت — نفس نمط downloadXlsx. */
export function downloadTripBackup(backup: TripBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFilename(backup.tripId)
  a.click()
  URL.revokeObjectURL(url)
}
