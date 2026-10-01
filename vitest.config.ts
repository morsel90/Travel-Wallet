import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  return {
    plugins: [react()],

    test: {
      // إعداد Firebase وهمي صريح — نفس قيم وظيفة build في CI. بعض الاختبارات
      // تستورد src/firebase.ts الحقيقي، وحارسه يرمي إن غاب متغير. كان define
      // يحقنها من البيئة، وفي CI (بلا بيئة) كانت تصل النصّ "undefined"
      // فيمرّ الحارس مصادفةً.
      // ⚠️ VITE_SENTRY_DSN غائبة عمداً: initSentry() تتجاوز نفسها بلاها.
      env: {
        VITE_FIREBASE_API_KEY: 'test-placeholder',
        VITE_FIREBASE_AUTH_DOMAIN: 'test-placeholder.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'test-placeholder',
        VITE_FIREBASE_STORAGE_BUCKET: 'test-placeholder.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
        VITE_FIREBASE_APP_ID: '1:000000000000:web:testplaceholder',
      },

      // jsdom هي البيئة الافتراضية عمداً — الافتراض الآمن أن الملف قد يلمس
      // DOM. الملفات المنطقية البحتة تعلن `@vitest-environment node` في أعلاها
      // فتتخطّى إنشاء jsdom (18 ملفاً، ~21% من زمن التشغيل).
      //
      // ⚠️ ولا تُطفَأ العزلة ولا يُبدَّل المجمَّع استجابةً لتحذير Vitest عن
      // «jsdom يُنشأ 56 مرة». جُرِّب الاقتراحان فعلاً وكلاهما يكسر المجموعة:
      // `isolate: false` أسقط 26 اختباراً في 9 ملفات (حالة عامة تتسرّب بين
      // الملفات)، و`pool: 'vmThreads'` أسقط 12 في `useInviteJoin.test.ts`
      // بـ«Cannot redefine property: location» لأن `window.location` غير قابل
      // لإعادة التعريف داخل عوالم الـVM. انظر docs/DECISIONS.md.
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
      // 🆕 tests/build: اختبارات على إعداد البناء نفسه (لا على كود التطبيق)،
      // فلا مكان لها في src/ التي تُشحن. النمط ضيّق عمداً — `tests/**` كان
      // سيلتقط اختبارات قواعد Firestore التي لها مُشغِّل ومحاكٍ منفصلان.
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/build/*.test.ts'],
    },
  }
})