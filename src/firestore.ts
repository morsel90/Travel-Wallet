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

// 🆕 سجل تدقيق تعديلات الرصيد — subcollection تحت كل مسافر (مرئي للمسؤول فقط)
export const depositLogsCol = (travelerId: number) =>
  collection(db, 'artifacts', TRIP_ID, 'public', 'data', 'travelers', String(travelerId), 'depositLogs')

// 🆕 مستند تتبّع حد المعدّل (Rate Limiting) لإضافة المصاريف — واحد لكل مستخدم
// (uid)، يُحدَّث بذرّية مع كل مصروف جديد (انظر handleAddExpense في
// hooks/useExpenseActions.ts وfirestore.rules: withinExpenseRateLimit/isValidRateLimitWrite)
export const rateLimitDoc = (uid: string) =>
  doc(db, 'artifacts', TRIP_ID, 'public', 'data', 'rateLimits', uid)

// 🆕 مستند إعدادات الرحلة العامة (الاسم + تفاصيل الحساب البنكي) — مجموعة
// top-level مستقلة تماماً باسم trips/ (خارج مسار artifacts/{TRIP_ID} أعلاه).
// يُقرأ فقط بعد التحقق من عضوية هذه الرحلة تحديداً (انظر isMember في
// firestore.rules)، ولا يُكتب إطلاقاً من العميل — يُدار عبر
// scripts/create-trip.mjs بصلاحيات Admin SDK. انظر hooks/useTripConfig.ts.
export const tripConfigDoc = () => doc(db, 'trips', TRIP_ID)
