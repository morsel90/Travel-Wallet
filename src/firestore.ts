// ─── مراجع Firestore المشتركة — المصدر الوحيد لبناء المسارات ─────────────────
import { collection, doc } from 'firebase/firestore'
import { db }               from './firebase'
import { TRIP_ID }          from './utils/tripId'

export const expensesCol  = () => collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'expenses')
export const travelersCol = () => collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers')
export const expenseDoc   = (id: string) => doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'expenses',  id)
export const travelerDoc  = (id: number) => doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers', String(id))

// حجز الاسم المختصر: معرّف المستند هو الاسم، والقواعد تمنع update عليه، فالكتابة
// الثانية على اسم قائم تُرفض. ⚠️ يُكتب مع مستند المسافر في writeBatch واحدة.
export const travelerNameDoc = (shortName: string) =>
  doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelerNames', shortName)

// سجل تدقيق تعديلات الرصيد تحت كل مسافر.
export const depositLogsCol = (travelerId: number) =>
  collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers', String(travelerId), 'depositLogs')

// السداد — القيد الثالث في الدفتر. يكتبه recordSettlement وحده؛ العميل يمسّ deletedAt فقط.
export const repaymentsCol = () => collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'repayments')
export const repaymentDoc  = (id: string) => doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'repayments', id)

// حدّ معدّل إضافة المصاريف لكل مستخدم — يُحدَّث ذرّياً مع كل مصروف (القواعد: withinExpenseRateLimit).
export const rateLimitDoc = (uid: string) =>
  doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'rateLimits', uid)

// إعدادات الرحلة (الاسم، البنك، المسار) — في trips/ خارج artifacts/{TRIP_ID}.
export const tripConfigDoc = () => doc(db, 'trips', TRIP_ID)

// أي رحلة بمعرّفها — للوحة الإدارة التي تعدّل غير الرحلة المفتوحة.
export const tripDocById = (tripId: string) => doc(db, 'trips', tripId)

// ⚠️ استعلام القائمة للمسؤول وحده عملياً — isMember لا يُرضي استعلاماً عامّاً.
export const tripsCol = () => collection(db, 'trips')

// سجلّ العضوية تكتبه الدوال وحدها. ⚠️ فهرس إداري لا مصدر صلاحية: isMember()
// تقرأ من التوكن، ولا يُشتق أي وصول من هنا.
export const tripMembersCol = (tripId: string) => collection(db, 'trips', tripId, 'members')

// «هل أنا منظّم؟» (useMyTripRole) — القراءة تنجح للمنظّم فقط، فالرفض هو الجواب «لا».
export const tripMemberDocById = (tripId: string, uid: string) =>
  doc(db, 'trips', tripId, 'members', uid)

// نسخ بـ tripId صريح — للنسخ الاحتياطي من لوحة الإدارة لرحلة غير المفتوحة.
export const expensesColByTrip = (tripId: string) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'expenses')
export const travelersColByTrip = (tripId: string) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'travelers')
export const travelerNamesColByTrip = (tripId: string) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'travelerNames')
export const repaymentsColByTrip = (tripId: string) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'repayments')
export const depositLogsColByTrip = (tripId: string, travelerId: number) =>
  collection(db, 'artifacts', tripId, 'public', 'data', 'travelers', String(travelerId), 'depositLogs')

// بروفايل المستخدم — مستقل عن أي رحلة، يملكه صاحبه حصراً.
export const userProfileDoc = (uid: string) => doc(db, 'users', uid)
