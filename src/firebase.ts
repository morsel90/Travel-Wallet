import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFunctions }  from 'firebase/functions'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore'

// ─── إعداد Firebase ──────────────────────────────────────────────────────────
// 🆕 نُقل من قيم مكتوبة في الكود إلى متغيرات بيئة (import.meta.env) — ليس لأنه
// سرّ (إعداد عميل Firebase عام بطبيعته ويظهر في حزمة JS مهما فعلنا)، بل ليمكن
// توجيه بناء إلى مشروع آخر دون تعديل ملف متتبَّع في git.
//
// ⚠️ الفصل غير مكتمل عمداً — معرّف المشروع ما زال مثبّتاً في موضعين خارج نطاق
// Vite ولا يقرآن import.meta.env إطلاقاً:
//   1. vercel.json — وجهات إعادة التوجيه لدوال السحابة
//      (https://us-central1-<project>.cloudfunctions.net/...). وجهات Vercel
//      لا تقبل متغيرات بيئة، فتغيير المتغيرات أدناه وحدها يُنتج تطبيقاً
//      نصفه على مشروع والنصف الآخر على مشروع ثانٍ: Firestore والمصادقة هنا،
//      بينما /api/verifyTripPin و/api/manageTrip هناك.
//   2. .firebaserc — المشروع الهدف لأوامر Firebase CLI (نشر القواعد والدوال).
// أي أن هذه المتغيرات تُخرج الإعداد من الكود، ولا تمنحك بيئة staging عاملة
// وحدها. انظر قسم Environment Variables في CLAUDE.md قبل إعداد بيئة ثانية.

interface FirebaseEnvConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

// المتغيرات المطلوبة — measurementId اختياري (تحليلات فقط، والتطبيق يعمل بدونه).
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

/**
 * يقرأ الإعداد ويفشل فوراً عند نقص أي متغير.
 *
 * الفشل المبكر مقصود بدل الرجوع لقيم افتراضية: القيمة الافتراضية الوحيدة
 * المتاحة هي إعداد الإنتاج، والرجوع إليها بصمت يعني أن بناء اختبار ناقص
 * الإعداد سيكتب في قاعدة بيانات الإنتاج دون أن يلاحظ أحد. الانهيار برسالة
 * صريحة أرخص بكثير من اكتشاف ذلك لاحقاً.
 *
 * ⚠️ Vite يستبدل import.meta.env.VITE_* وقت البناء لا وقت التشغيل، فالمتغيرات
 * يجب أن تكون موجودة في بيئة البناء: ملف .env.local محلياً، وإعدادات المشروع
 * في لوحة Vercel عند النشر.
 */
function readFirebaseConfig(): FirebaseEnvConfig {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  const missing = REQUIRED_KEYS.filter(key => !env[key])

  if (missing.length > 0) {
    throw new Error(
      `إعداد Firebase ناقص — المتغيرات التالية غير معرّفة وقت البناء:\n` +
      `${missing.join('\n')}\n\n` +
      `محلياً: انسخ .env.example إلى .env.local واملأ القيم من ` +
      `Firebase Console › Project settings › Your apps.\n` +
      `على Vercel: أضفها في Project Settings › Environment Variables ثم أعد النشر.`
    )
  }

  return {
    apiKey:            env.VITE_FIREBASE_API_KEY!,
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN!,
    projectId:         env.VITE_FIREBASE_PROJECT_ID!,
    storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
    appId:             env.VITE_FIREBASE_APP_ID!,
    ...(env.VITE_FIREBASE_MEASUREMENT_ID ? { measurementId: env.VITE_FIREBASE_MEASUREMENT_ID } : {}),
  }
}

const app = initializeApp(readFirebaseConfig())

export const auth = getAuth(app)

// ⚠️ المنطقة هنا يجب أن تطابق تمامًا المنطقة المُعرَّفة في functions/index.js
// (region: 'us-central1' داخل onCall) وإلا فشلت استدعاءات verifyTripPin.
// تبقى مكتوبة في الكود لأنها خاصية معمارية مشتركة مع الخادم، لا إعداد بيئة:
// تغييرها هنا وحده دون تغييرها هناك يكسر الاستدعاءات بصمت.
export const functions = getFunctions(app, 'us-central1')

// التهيئة الحديثة لقاعدة البيانات مع تفعيل التخزين المؤقت (Offline Persistence).
// هذا يستبدل الدالة القديمة enableIndexedDbPersistence التي سيتم إلغاؤها.
// ⚠️ هذا الكاش هو أيضاً آلية التراجع عن الكتابات المتفائلة — انظر قسم
// Design Decisions في CLAUDE.md قبل تغييره أو بناء طابور إعادة محاولة فوقه.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager() // يدعم فتح التطبيق في عدة تبويبات في نفس الوقت
  })
})

// 🔴 اختبارات E2E (Playwright) فقط — يوجّه SDK فايربيس بالكامل لمحاكيات محلية
// (Auth + Firestore، انظر firebase.json) بدل مشروع الإنتاج الحقيقي. المتغيّر
// لا يُعرَّف أبداً في .env المحلي ولا في إعداد Vercel — فقط playwright.config.ts
// يمرّره عبر webServer.env عند تشغيل `vite --mode e2e`، فهذا الفرع ميت تماماً
// في npm run dev العادي وفي كل بناء إنتاجي. يجب أن يقع الاستدعاء هنا مباشرة —
// قبل أي عملية Firestore/Auth فعلية وبعد إنشاء auth/db مباشرة — وإلا فشل
// connectFirestoreEmulator لأن SDK يرفض تغيير الاتصال بعد أول استخدام.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
