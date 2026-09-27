import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore'

// ─── إعداد Firebase ──────────────────────────────────────────────────────────
// من متغيرات البيئة لا لأنه سرّ (عام بطبيعته)، بل ليُوجَّه البناء لمشروع آخر
// (staging) — Firestore والمصادقة والدوال كلها تتبع VITE_FIREBASE_PROJECT_ID.
// انظر «Environment Variables» في CLAUDE.md.

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
 * ⚠️ لا قيم افتراضية: الوحيدة المتاحة هي الإنتاج، فيكتب بناءٌ ناقص فيه بصمت.
 * ⚠️ تُستبدل وقت البناء لا التشغيل — يجب وجودها في بيئة البناء (.env.local / Vercel).
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

// ⚠️ المنطقة تطابق region في كل onCall بـ functions/index.js — ثابتة في الكود لا
// متغير بيئة، وتغييرها هنا وحده يكسر الاستدعاءات بصمت.
// المسار الوحيد لاستدعاء الدوال (httpsCallable) — يشتق الرابط من projectId.
export const functions = getFunctions(app, 'us-central1')

// ⚠️ هذا الكاش هو أيضاً آلية التراجع عن الكتابات المتفائلة — اقرأ DECISIONS.md
// قبل تغييره أو بناء طابور إعادة محاولة فوقه.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager() // يدعم فتح التطبيق في عدة تبويبات في نفس الوقت
  })
})

// 🔴 E2E فقط — يمرّره playwright.config.ts وحده، فالفرع ميت في dev والإنتاج.
// ⚠️ يجب أن يقع فور إنشاء auth/db وقبل أي استخدام — الـ SDK يرفض التبديل بعده.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
