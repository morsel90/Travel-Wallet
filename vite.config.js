import { defineConfig } from 'vite'
import react            from '@vitejs/plugin-react'
import { VitePWA }      from 'vite-plugin-pwa'

export default defineConfig({
  // ★ إعطاء الأولوية لملفات TypeScript عند الاستيراد بدون امتداد.
  // نسخ .jsx/.js ما زالت موجودة في src/ لكنها مهملة الآن؛ هذا الترتيب يضمن
  // أن './App' و'./components/Header' …إلخ تُحمَّل من نسخة .tsx لا .jsx.
  // (نقطة الدخول أصبحت /src/main.tsx في index.html).
  // ملاحظة: Vite يحمّل vite.config.js قبل vite.config.ts، لذا التعديل هنا.
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  plugins: [
    react(),
    VitePWA({
      // generateSW: Workbox يولّد ملف service-worker.js تلقائياً عند البناء
      strategies: 'generateSW',
      registerType: 'autoUpdate', // يُحدِّث الـ SW تلقائياً عند رفع نسخة جديدة

      // manifest.webmanifest — يُمكِّن "Add to Home Screen" على الجوال
      manifest: {
        name:             'لوحة مصاريف السفر',
        short_name:       'مصاريف',
        description:      'تتبع مصاريف الرحلة بين أعضاء المجموعة',
        theme_color:      '#0f766e',   // teal-700
        background_color: '#f8fafc',   // slate-50
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
        // ما يُخزَّن أثناء التثبيت (precache): ملفات الـ bundle التي يولّدها Vite
        // Workbox يكتشفها تلقائياً — لا حاجة لتعدادها يدوياً
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // ★ التعديل الأول: إضافة مسارات التجاهل لمنع تعارض Workbox مع مسارات Firebase الداخلية
        navigateFallbackDenylist: [/^\/__/],

        // استراتيجية التخزين للموارد الخارجية (Google Fonts, CDN...)
        // NetworkFirst: يحاول الشبكة أولاً، ويرجع للـ cache عند انقطاع الإنترنت
        runtimeCaching: [
          {
            // أسعار الصرف الحية — NetworkFirst لأن البيانات تتغير
            urlPattern: /^https:\/\/open\.er-api\.com\//,
            handler:    'NetworkFirst',
            options: {
              cacheName:         'exchange-rates-cache',
              networkTimeoutSeconds: 5,          // إن لم يرد الخادم خلال 5 ثوانٍ → cache
              expiration: { maxAgeSeconds: 60 * 60 * 6 }, // صالح 6 ساعات
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ★ التعديل الثاني: توجيه صريح لطلبات Firestore المستمرة (Listen/channel)
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Firebase Auth و Firestore endpoints — NetworkOnly
            // ⚠️ لا نخزّن طلبات Firebase: الـ SDK يتولى الـ offline persistence بنفسه (انظر firebase.js)
            urlPattern: /^https:\/\/.*\.googleapis\.com\//,
            handler:    'NetworkOnly',
          },
          {
            // Firebase Storage و firebaseapp.com
            urlPattern: /^https:\/\/.*\.firebase(io|app|storage)\.com\//,
            handler:    'NetworkOnly',
          },
        ],
      },
    }),
  ],
})