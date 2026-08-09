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

    // 🗑️ لا حاجة لأي وسيط `/api/*` بعد الآن: العميل يستدعي الدوال عبر
    // httpsCallable من SDK فايربيس، والرابط يُشتق من معرّف المشروع تلقائياً
    // (انظر src/firebase.ts وhooks/useAuth.ts). زال معه أيضاً سببُ إعادة التوجيه
    // في vercel.json — وهو ما كان يربط كل بناء بمشروع Firebase واحد ويمنع
    // قيام بيئة staging.


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