// 🆕 قراءة رحلة كاملة وتجميعها في نسخة احتياطية — قراءة فقط، بلا React ولا
// رسائل. استُخرجت من exportBackup في useTripAdminActions كي يبقى هناك ما يخصّ
// الواجهة وحده (الصلاحية، علم الحفظ، التوست)، وهنا ما يخصّ البيانات وحده.
//
// isAdmin() في القواعد يمنح قراءة expenses/travelers/depositLogs لأي رحلة، لا
// الرحلة النشطة وحدها (نفس أساس فحص الخلوّ قبل الحذف). depositLogs تُجلب لكل
// مسافر على حدة (subcollection تحت كل مستند مسافر) بالتوازي — كلفة عدد القراءات
// مقبولة لأنه إجراء يدوي نادر، لا مسار ساخن.
//
// ⚠️ ترمي BackupNotPortableError (من buildTripBackup) إن حوت الرحلة قيمة لن
// تنجو من JSON — المستدعي يعرض مسارها. انظر utils/backup.ts.
import { getDoc, getDocs } from 'firebase/firestore'
import {
  expensesColByTrip, travelersColByTrip, travelerNamesColByTrip, depositLogsColByTrip, repaymentsColByTrip,
  tripDocById,
} from '../firestore'
import { buildTripBackup, pickLongTermConfig, type TripBackup } from '../utils/backup'
import type { DepositLogEntry, Expense, Repayment, Traveler } from '../types'
import type { TripSummary } from './useAllTrips'

export async function readTripBackup(trip: TripSummary): Promise<TripBackup> {
  // 🆕 مستند الرحلة نفسه لا TripSummary: حقول الأشهر (آخر إغلاق تحديداً) تُقرأ
  // لحظة النسخ، لا من قائمة قد تكون قديمة. انظر pickLongTermConfig.
  const [tripSnap, travelersSnap, expensesSnap, travelerNamesSnap, repaymentsSnap] = await Promise.all([
    getDoc(tripDocById(trip.id)),
    getDocs(travelersColByTrip(trip.id)),
    getDocs(expensesColByTrip(trip.id)),
    getDocs(travelerNamesColByTrip(trip.id)),
    getDocs(repaymentsColByTrip(trip.id)),
  ])
  const repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Repayment, 'id'>) }))

  const travelers = travelersSnap.docs.map(d => d.data() as Traveler)
  const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }))
  const travelerNames = travelerNamesSnap.docs.map(d => ({
    shortName: d.id,
    travelerId: (d.data() as { travelerId: number }).travelerId,
  }))

  const depositLogsByTraveler = await Promise.all(
    travelers.map(t => getDocs(depositLogsColByTrip(trip.id, t.id))),
  )
  const depositLogs = depositLogsByTraveler.flatMap(snap =>
    snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DepositLogEntry, 'id'>) })),
  )

  return buildTripBackup({
    tripId: trip.id,
    trip: { name: trip.name, itinerary: trip.itinerary, status: trip.status, ...pickLongTermConfig(tripSnap.data()) },
    travelers, expenses, depositLogs, travelerNames, repayments,
  })
}
