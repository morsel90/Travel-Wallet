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
import type { DepositLogEntry, Expense, ItinerarySegment, Repayment, Traveler, TripStatus } from '../types'

// 🆕 الملف مستقل عن Firestore — وهذا شرط يُفحَص عند التصدير، لا افتراض.
//
// النسخة هي تأمين الخروج الوحيد من Firebase (انظر docs/DECISIONS.md: «حدّ
// Firebase يُفرَض بقاعدة lint»)، فيجب أن تُقرأ وتُعاد بناؤها بلا أي SDK. الأنواع
// أعلاه تَعِد بذلك، لكن `d.data() as Traveler` في useTripAdminActions تحويلٌ لا
// تحقّق: مستند عُدِّل يدوياً من الكونسول أو بسكربت قد يحمل Timestamp أو
// DocumentReference، وJSON.stringify يحوّلها بصمت إلى `{seconds, nanoseconds}`
// أو `{}`، وNaN إلى null. لا شيء يظهر عند التصدير. الفشل يظهر عند الاستعادة
// (restoreTrip يرفض deletedAt غير الرقمي) — أي في أسوأ لحظة ممكنة، بعد ضياع
// الأصل. لذا التصدير يرفض الملف فوراً ويسمّي موضع القيمة.
//
// المقبول: null، نص، منطقي، رقم منتهٍ، مصفوفة، وكائن عادي. أي نسخة كائن من
// صنف (Timestamp، Date، GeoPoint، Bytes…) مرفوضة. لا حاجة لاستيراد Firebase
// لتمييزها: كائنات SDK كلها أصناف، ونموذج البيانات هنا لا يحوي صنفاً واحداً.
// `undefined` مقبول كقيمة خاصية فقط — يسقط المفتاح، وهو نفس معنى الحقل
// الاختياري الغائب — ومرفوض داخل مصفوفة لأنه يصير null هناك.

export class BackupNotPortableError extends Error {
  readonly path: string
  constructor(path: string, found: string) {
    super(`قيمة لا تنجو من JSON كما هي عند ${path} (${found})`)
    this.name = 'BackupNotPortableError'
    this.path = path
  }
}

function describeValue(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && v !== null) return v.constructor?.name ?? 'object'
  return typeof v
}

/** مسار أول قيمة لا تُحفظ في JSON كما هي، أو null إن كان كل شيء قابلاً للنقل. */
export function findNonPortableValue(value: unknown, path = '$'): { path: string; found: string } | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path, found: describeValue(value) }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNonPortableValue(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return { path, found: describeValue(value) }
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      const hit = findNonPortableValue(v, `${path}.${k}`)
      if (hit) return hit
    }
    return null
  }
  return { path, found: describeValue(value) }
}

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
  /**
   * 🆕 قيود السداد — اختياري في الملف لا في التصدير: النسخ السابقة لهذه الميزة
   * لا تحمله، وschemaVersion يبقى 1 لأن الإضافة لا تكسر قراءة أيّ ملف قديم.
   * restoreTrip يعامل الغياب كقائمة فارغة.
   */
  repayments?: Repayment[]
}

export interface BuildTripBackupParams {
  tripId: string
  trip: { name: string; itinerary: ItinerarySegment[]; status: TripStatus }
  travelers: Traveler[]
  expenses: Expense[]
  depositLogs: DepositLogEntry[]
  travelerNames: Array<{ shortName: string; travelerId: number }>
  repayments?: Repayment[]
}

/** دالة نقية — لا قراءة Firestore هنا، فقط تجميع الشكل النهائي. ترمي
 *  BackupNotPortableError إن حوى المُدخل قيمة لا تنجو من JSON (انظر أعلاه). */
export function buildTripBackup(params: BuildTripBackupParams): TripBackup {
  const backup: TripBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tripId: params.tripId,
    trip: params.trip,
    travelers: params.travelers,
    expenses: params.expenses,
    depositLogs: params.depositLogs,
    travelerNames: params.travelerNames,
    // المفاتيح بأسمائها لا نسخاً للكائن: هذه بالضبط ما يقبله isValidRepaymentJs
    // عند الاستعادة (hasOnlyKeys)، و`_pending` حقل عرض لا بيانات — لو تسرّب إلى
    // الملف لرفضت الاستعادةُ النسخةَ كلها.
    repayments: (params.repayments ?? []).map(r => ({
      id: r.id, fromId: r.fromId, toId: r.toId, amount: r.amount, date: r.date,
      createdAt: r.createdAt, createdByUid: r.createdByUid, deletedAt: r.deletedAt ?? null,
    })),
  }
  const hit = findNonPortableValue(backup)
  if (hit) throw new BackupNotPortableError(hit.path, hit.found)
  return backup
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
