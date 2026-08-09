import { defineConfig, loadEnv } from 'vite'
import react            from '@vitejs/plugin-react'
import { VitePWA }      from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // تحميل كافة المتغيرات المضافة في Vercel أو .env
  const env = loadEnv(mode, process.cwd(), '');
  const pick = (key) => env[key] || process.env[key];
  // 🔴 وضع اختبارات E2E (Playwright) فقط — انظر playwright.config.ts الذي يشغّل
  // `vite --mode e2e`. لا يُفعَّل أبداً بأي أمر آخر (dev/build العاديين).
  const isE2E = mode === 'e2e';

  return {
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    },

    // حقن المتغيرات صراحة وقت البناء لضمان وصولها للمتصفح عند البناء على Vercel
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(pick('VITE_FIREBASE_API_KEY')),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(pick('VITE_FIREBASE_AUTH_DOMAIN')),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(pick('VITE_FIREBASE_PROJECT_ID')),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(pick('VITE_FIREBASE_STORAGE_BUCKET')),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(pick('VITE_FIREBASE_MESSAGING_SENDER_ID')),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(pick('VITE_FIREBASE_APP_ID')),
      // 🔴 E2E فقط — انظر src/firebase.ts (connectAuthEmulator/connectFirestoreEmulator)
      'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify(pick('VITE_USE_FIREBASE_EMULATORS')),
    },

    // 🆕 إعادة توجيه /api/* في خادم التطوير — تُحاكي ما يفعله vercel.json في الإنتاج.
    //
    // ⚠️ لماذا هذا ضروري: العميل يستدعي fetch('/api/verifyTripPin') دائماً (انظر
    // hooks/useAuth.ts وhooks/useTripAdminActions.ts)، وهذا المسار مجرد إعادة
    // توجيه معرَّفة في vercel.json — لا وجود له خارج Vercel. فبدون ما يلي، خادم
    // Vite يُرجع صفحة HTML بدل استجابة الدالة، فيفشل تحليل JSON ويُترجَم الخطأ
    // في الواجهة إلى «رمز الرحلة غير صحيح» رغم أن الرمز صحيح تماماً.
    //
    // والأثر أسوأ من مجرد رسالة مضلِّلة: بوابة الرمز تحجب التطبيق كاملاً بما فيه
    // زر دخول المسؤول، فيستحيل استخدام `npm run dev` على الإطلاق دون هذا التوجيه.
    //
    // الوجهة تختلف بحسب الوضع: محاكي Functions محلياً في اختبارات E2E، ودوال
    // السحابة الحقيقية في التطوير العادي (نفس وجهة vercel.json تماماً، لكنها
    // مشتقّة من معرّف المشروع هنا بدل أن تكون مكتوبة حرفياً).
    server: {
      proxy: (() => {
        const projectId = pick('VITE_FIREBASE_PROJECT_ID')
        const target = isE2E
          ? 'http://127.0.0.1:5001'
          : `https://us-central1-${projectId}.cloudfunctions.net`
        // محاكي Functions يتطلب بادئة المشروع والمنطقة في المسار، بينما دوال
        // الإنتاج تحمل ذلك في اسم النطاق نفسه.
        const pathFor = (fn) => (isE2E ? `/${projectId}/us-central1/${fn}` : `/${fn}`)

        return {
          '/api/verifyTripPin': { target, changeOrigin: true, rewrite: () => pathFor('verifyTripPin') },
          '/api/manageTrip':    { target, changeOrigin: true, rewrite: () => pathFor('manageTrip') },
        }
      })(),
    },


    // إعدادات البناء وتقسيم الحزم (Code Splitting)
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase') || id.includes('@firebase')) {
                return 'firebase-sdk';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('react-virtuoso')) {
                return 'ui-vendor';
              }
            }
          }
        }
      }
    },

    plugins: [
      react(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        manifest: {
          name:             'لوحة مصاريف السفر',
          short_name:       'مصاريف',
          description:      'تتبع مصاريف الرحلة بين أعضاء المجموعة',
          theme_color:      '#0f766e',
          background_color: '#f8fafc',
          display:          'standalone',
          lang:             'ar',
          dir:              'rtl',
          start_url:        '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/__/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/open\.er-api\.com\//,
              handler:    'NetworkFirst',
              options: {
                cacheName:         'exchange-rates-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxAgeSeconds: 60 * 60 * 6 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/.*\.googleapis\.com\//,
              handler:    'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/.*\.firebase(io|app|storage)\.com\//,
              handler:    'NetworkOnly',
            },
          ],
        },
      }),
    ],
  };
})