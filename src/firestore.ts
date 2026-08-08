// ─── مراجع Firestore المشتركة ────────────────────────────────────────────────
// مصدر واحد لمسارات المجموعات والمستندات — يستخدمه كل من الـ hooks وApp.tsx
// حتى لا يتكرر بناء المسار في أكثر من مكان.
import { collection, doc } from 'firebase/firestore'
import { db }               from './firebase'
// 🆕 دعم رحلات متعددة: TRIP_ID محسوب ديناميكياً من ?trip=xyz في الرابط (بدل
// APP_ID الثابت سابقاً) — انظر utils/tripId.ts لشرح الآلية والتحقق من الصيغة.
import { TRIP_ID }          from './utils/tripId'

export const expensesCol  = () => collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'expenses')
export const travelersCol = () => collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers')
export const expenseDoc   = (id: string) => doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'expenses',  id)
export const travelerDoc  = (id: number) => doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers', String(id))

// 🆕 حجز الاسم المختصر — معرّف المستند *هو* الاسم نفسه، وهذا ما يفرض التفرّد:
// firestore.rules تمنع update على هذه المجموعة منعاً باتاً، فأي كتابة ثانية
// على اسم قائم تُصنَّف update وتُرفض. يُكتب دائماً مع مستند المسافر في
// writeBatch واحدة — انظر hooks/useTravelerActions.ts.
export const travelerNameDoc = (shortName: string) =>
  doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelerNames', shortName)

// 🆕 سجل تدقيق تعديلات الرصيد — subcollection تحت كل مسافر (مرئي للمسؤول فقط)
export const depositLogsCol = (travelerId: number) =>
  collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers', String(travelerId), 'depositLogs')

// 🆕 مستند تتبّع حد المعدّل (Rate Limiting) لإضافة المصاريف — واحد لكل مستخدم
// (uid)، يُحدَّث بذرّية مع كل مصروف جديد (انظر handleAddExpense في
// hooks/useExpenseActions.ts وfirestore.rules: withinExpenseRateLimit/isValidRateLimitWrite)
export const rateLimitDoc = (uid: string) =>
  doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'rateLimits', uid)

// 🆕 مستند إعدادات الرحلة العامة (الاسم + تفاصيل الحساب البنكي + المسار) —
// مجموعة top-level مستقلة تماماً باسم trips/ (خارج مسار artifacts/{TRIP_ID}
// أعلاه). يُقرأ بعد التحقق من عضوية هذه الرحلة تحديداً، ويُكتب من المسؤول فقط
// (انظر isMember/isAdmin في firestore.rules وhooks/useTripAdminActions.ts).
export const tripConfigDoc = () => doc(db, 'trips', TRIP_ID)

// 🆕 مستند *أي* رحلة بمعرّفها — لواجهة إدارة الرحلات، التي تعدّل رحلات غير
// الرحلة المفتوحة حالياً. القواعد تسمح بذلك أصلاً: شرط الكتابة isAdmin() لا
// يشير إلى الرحلة النشطة إطلاقاً، فالمسؤول يعدّل أي رحلة دون مغادرة الحالية.
export const tripDocById = (tripId: string) => doc(db, 'trips', tripId)

// 🆕 مجموعة الرحلات كاملة — استعلام قائمة يقتصر على المسؤول عملياً، لأن
// isAdmin() هو الشرط الوحيد الذي يتحقق دون النظر لمحتوى المستند (isMember
// يعتمد على معرّف كل رحلة على حدة، فلا يُرضي استعلام قائمة عامًّا).
export const tripsCol = () => collection(db, 'trips')
