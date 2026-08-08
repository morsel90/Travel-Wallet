import { defineConfig, devices } from '@playwright/test'

// 🔴 اختبارات E2E حقيقية (Playwright) — تشغّل خادم Vite فعلياً وتتصفّح التطبيق
// كمستخدم حقيقي، ضد محاكيات Firebase (Auth + Firestore + Functions) لا ضد أي
// mock. التشغيل: `npm run test:e2e` (يشغّل المحاكيات عبر firebase emulators:exec
// ثم Playwright — انظر السكربت في package.json). لا تشغّل `playwright test`
// مباشرة بلا المحاكيات: كل سيناريو يفشل فوراً عند محاولة تسجيل الدخول.
//
// أول مرة فقط: `npm run e2e:install` لتنزيل متصفح Chromium الذي يستخدمه Playwright.
const PORT = 5173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // يبني خادم Vite تلقائياً بإعداد e2e (متصل بالمحاكيات — انظر vite.config.js
  // وsrc/firebase.ts) قبل أي اختبار، ويوقفه بعد انتهائها.
  webServer: {
    command: 'vite --mode e2e --port 5173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // 🆕 30 ثانية كانت غير كافية في التجربة الفعلية: أول إقلاع لـ Vite بإعداد
    // e2e (بذاكرة تخزين مؤقت جديدة كلياً لهذا الوضع) يزامن تجميع firebase +
    // framer-motion + lucide-react + react-virtuoso لأول مرة، أثناء تنافس مع
    // ثلاث محاكيات تعمل بالتوازي على نفس الجهاز (auth+firestore+functions —
    // الأخيرين يعتمدان على JVM). التشغيلات اللاحقة أسرع بكثير بفضل كاش Vite.
    timeout: 120_000,
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true',
      // قيم وهمية عمداً — SDK فايربيس يتصل بالمحاكي المحلي فقط (connectAuthEmulator/
      // connectFirestoreEmulator في firebase.ts)، فلا حاجة لإعداد مشروع حقيقي.
      // ⚠️ projectId يجب أن يطابق --project في سكربت test:e2e تماماً.
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-travelapp-e2e.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-travelapp-e2e',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-travelapp-e2e.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:e2eplaceholder',
    },
  },
})
