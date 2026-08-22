import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // تحميل كافة المتغيرات المضافة في Vercel أو .env
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    
    // حقن المتغيرات صراحة وقت البناء لضمان وصولها للمتصفح في Node 22
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID),
      // 🆕 VITE_SENTRY_DSN عمداً غير موجودة هنا: initSentry() (src/sentry.ts)
      // تتجاوز نفسها بصمت حين تكون undefined، فالاختبارات لا تُهيّئ Sentry
      // إطلاقاً — وهذا هو السلوك المطلوب، لا سهواً.
    },

    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }
})