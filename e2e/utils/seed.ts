// 🔴 يجهّز بيانات رحلة اختبار مباشرة في محاكيات Firestore/Auth عبر Admin SDK —
// يحاكي بدقة ما تفعله scripts/create-trip.mjs (كتابة trips/{tripId} +
// tripSecrets/{tripId}) وscripts/set-admin.mjs (منح admin claim)، لكن ضد
// المحاكي المحلي مباشرة بدل مشروع Firebase حقيقي، ومن دون serviceAccountKey.json
// (Admin SDK لا يحتاج بيانات اعتماد حقيقية عندما يكتشف متغيرات بيئة المحاكي).
//
// ⚠️ hashPin هنا يجب أن يطابق hashPin في functions/index.js حرفياً
// (sha256(salt + pin)) — أي اختلاف يعني أن verifyTripPin (تعمل داخل محاكي
// Functions الحقيقي، لا نسخة مُقلَّدة هنا) سترفض كل رمز نزرعه.
import { randomBytes, createHash } from 'node:crypto'
import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export const E2E_PROJECT_ID = 'demo-travelapp-e2e'

// يجب ضبط هذين قبل أي استدعاء لـ Admin SDK — عادة ما يضبطهما `firebase
// emulators:exec` تلقائياً في بيئة العملية الملفوفة (npm run test:e2e)، لكن
// نضبطهما احتياطاً هنا أيضاً (نفس المنافذ في firebase.json) لو شُغِّل هذا
// الملف مباشرة أثناء تطوير الاختبارات دون المرور بـ emulators:exec.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

let cachedApp: App | null = null

function adminApp(): App {
  if (cachedApp) return cachedApp
  cachedApp = getApps().find(a => a.name === 'e2e-seed')
    ?? initializeApp({ projectId: E2E_PROJECT_ID }, 'e2e-seed')
  return cachedApp
}

/** يطابق hashPin(pin, salt) في functions/index.js تماماً — sha256(salt + pin). */
function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(salt + pin).digest('hex')
}

export interface SeedTripOptions {
  /** معرّف رحلة فريد لهذا الملف الاختباري — تجنّب مشاركته بين ملفات مختلفة (Playwright يشغّل الملفات بالتوازي). */
  tripId: string
  pin: string
  adminEmail: string
  adminPassword: string
}

/**
 * يهيّئ رحلة جاهزة للاختبار: مستند الرحلة، هاش رمزها (بنفس خوارزمية الخادم
 * الحقيقية)، وحساب مسؤول يحمل admin claim مسبقاً — كل ما يلزم لبدء سيناريو
 * E2E كامل دون المرور بأي خطوة يدوية.
 */
export async function seedTrip({ tripId, pin, adminEmail, adminPassword }: SeedTripOptions): Promise<void> {
  const app = adminApp()
  const db = getFirestore(app)
  const auth = getAuth(app)

  const salt = randomBytes(16).toString('hex')
  const pinHash = hashPin(pin, salt)

  await db.collection('trips').doc(tripId).set({
    name: `رحلة اختبار E2E — ${tripId}`,
    bankDetails: { bankName: '', beneficiary: '', iban: '' },
    itinerary: [],
  })
  await db.collection('tripSecrets').doc(tripId).set({ salt, pinHash })

  // إنشاء حساب المسؤول إن لم يكن موجوداً — يسمح بإعادة تشغيل هذا الملف محلياً
  // أثناء تطوير الاختبار عدة مرات على نفس بريد المسؤول دون فشل "user already exists".
  let uid: string
  try {
    uid = (await auth.getUserByEmail(adminEmail)).uid
  } catch {
    uid = (await auth.createUser({ email: adminEmail, password: adminPassword, emailVerified: true })).uid
  }
  await auth.setCustomUserClaims(uid, { admin: true })
}
