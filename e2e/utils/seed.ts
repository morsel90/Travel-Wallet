// 🔴 يجهّز بيانات رحلة اختبار مباشرة في محاكيَي Firestore/Auth عبر Admin SDK،
// ضد المحاكي المحلي مباشرة بدل مشروع Firebase حقيقي، ومن دون serviceAccountKey.json
// (Admin SDK لا يحتاج بيانات اعتماد حقيقية عندما يكتشف متغيرات بيئة المحاكي).
//
// 🆕 لا رمز رحلة (PIN) بعد الآن — العضوية تُمنح مباشرة كـ custom claim على حساب
// بريد/كلمة مرور حقيقي (نفس ما تكتبه joinViaInvite فعلياً عند استهلاك رابط
// دعوة حقيقي)، بلا حاجة لاستهلاك رابط دعوة في كل اختبار. الحساب نفسه — بريده
// وكلمة مروره — حقيقي في محاكي Auth، فيسجّل كل اختبار الدخول عبر AuthGate
// الحقيقية (e2e/utils/flows.ts) لا عبر اختصار في localStorage أو Firestore مباشرة.
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

/**
 * ينشئ حساباً ببريد/كلمة مرور في محاكي Auth إن لم يكن موجوداً بعد، ويمنحه
 * الـ claims المطلوبة (تستبدل أي claims سابقة — كافٍ هنا لأن كل اختبار يمنح
 * حسابه دوراً واحداً ثابتاً). يعيد الـ uid.
 */
async function ensureUser(email: string, password: string, claims: Record<string, unknown>): Promise<string> {
  const auth = getAuth(adminApp())

  let uid: string
  try {
    uid = (await auth.getUserByEmail(email)).uid
  } catch (error) {
    // إخبار TypeScript أن الخطأ قد يحتوي على خاصية code
    const err = error as { code?: string }

    if (err.code !== 'auth/user-not-found') throw error

    try {
      uid = (await auth.createUser({ email, password, emailVerified: true })).uid
    } catch (createError) {
      const cErr = createError as { code?: string }
      // إذا قام Worker آخر بإنشاء المستخدم في هذه اللحظة، استرجع الـ UID ببساطة
      if (cErr.code === 'auth/email-already-exists') {
        uid = (await auth.getUserByEmail(email)).uid
      } else {
        throw createError
      }
    }
  }

  await auth.setCustomUserClaims(uid, claims)
  return uid
}

/**
 * 🆕 حساب بريد/كلمة مرور حقيقي بلا أي claim — لا trips ولا admin. يمثّل عضواً
 * مسجَّل دخوله لم ينضمّ لأي رحلة بعد، لاختبار الإنشاء الذاتي للرحلات (نموذج
 * واتساب: من ينشئ رحلة يصبح منظّمها) من نقطة البداية الحقيقية — بلا أي عضوية
 * ممنوحة مسبقاً كاختصار كما تفعل seedTrip لبقية السيناريوهات.
 */
export async function seedBareUser(email: string, password: string): Promise<string> {
  return ensureUser(email, password, {})
}

export interface SeedTripOptions {
  /** معرّف رحلة فريد لهذا الملف الاختباري — تجنّب مشاركته بين ملفات مختلفة (Playwright يشغّل الملفات بالتوازي). */
  tripId: string
  memberEmail: string
  memberPassword: string
  adminEmail: string
  adminPassword: string
}

/**
 * يهيّئ رحلة جاهزة للاختبار: مستند الرحلة، حساب عضو يحمل claim عضوية هذه
 * الرحلة تحديداً مسبقاً (نفس أثر استهلاك رابط دعوة حقيقي عبر joinViaInvite)،
 * وحساب مسؤول عالمي يحمل admin claim — كل ما يلزم لبدء سيناريو E2E كامل دون
 * المرور بأي خطوة يدوية.
 *
 * ⚠️ حساب المسؤول لا يحتاج claim العضوية: firestore.rules تمنحه isAdmin() في
 * كل قاعدة تقريباً (`isMember(appId) || isAdmin()`)، ومروره عبر AuthGate وحده
 * كافٍ للوصول المباشر — لا حاجة لخطوة "وضع المسؤول" داخل التطبيق إن سجّل
 * دخوله بحسابه الحقيقي من البداية (انظر openTripAsAdmin في flows.ts).
 */
export async function seedTrip({ tripId, memberEmail, memberPassword, adminEmail, adminPassword }: SeedTripOptions): Promise<void> {
  const db = getFirestore(adminApp())

  await db.collection('trips').doc(tripId).set({
    name: `رحلة اختبار E2E — ${tripId}`,
    bankDetails: { bankName: '', beneficiary: '', iban: '' },
    itinerary: [],
  })

  const memberUid = await ensureUser(memberEmail, memberPassword, { trips: { [tripId]: true } })
  await ensureUser(adminEmail, adminPassword, { admin: true })

  // ⚠️ الـ claim وحده كافٍ للوصول (isMember تقرؤه من التوكن)، لكن هذا الاختصار
  // يمنح العضوية دون المرور بـ joinViaInvite فعلياً — فلا يكتب هذا السطر في
  // trips/{tripId}/members تلقائياً كما تفعل recordMembership في
  // functions/index.js. أي اختبار يفتح تبويب "الأعضاء" (organizer-role.spec.ts)
  // يحتاج هذا السطر موجوداً فعلاً، فنكتبه هنا يدوياً بنفس الشكل بالضبط.
  await db.collection('trips').doc(tripId).collection('members').doc(memberUid).set({
    joinedAt: Date.now(),
    lastVerifiedAt: Date.now(),
    email: memberEmail,
  })
}
