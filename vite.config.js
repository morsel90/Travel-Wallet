import { defineConfig, loadEnv } from 'vite'
import react            from '@vitejs/plugin-react'
import { VitePWA }      from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss     from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // متغيرات VITE_* يقرؤها Vite بنفسه (من .env* ومن بيئة البناء على Vercel) —
  // لا حاجة لحقنها. هذا للمتغيرات بلا البادئة وحدها: SENTRY_* وVERCEL_*.
  const env = loadEnv(mode, process.cwd(), '');
  const pick = (key) => env[key] || process.env[key];
  // 🆕 بلا هذا التوكن، @sentry/vite-plugin لن يرفع خرائط المصدر ولن يحذفها —
  // فتوليدها أصلاً معطَّل في هذه الحالة (CI، أو قبل ضبط Sentry) بدل أن تبقى
  // خرائط .map غير مُنظَّفة في dist/ ومتاحة للجمهور بلا داعٍ.
  const hasSentryToken = Boolean(pick('SENTRY_AUTH_TOKEN'));

  return {
    define: {
      // 🆕 العنوان الأساسي للتطبيق — انظر src/utils/canonicalUrl.ts. تجاوز يدوي
      // أولاً (لبيئة staging مثلاً)، ثم متغيّر النظام الذي يوفّره Vercel لكل
      // بناء. غيابهما محلياً يعني سلسلة فارغة: لا تنبيه عنوان ولا رابط.
      'import.meta.env.VITE_APP_PRODUCTION_HOST': JSON.stringify(pick('VITE_APP_PRODUCTION_HOST') || pick('VERCEL_PROJECT_PRODUCTION_URL') || ''),
    },

    build: {
      // 🆕 مطلوب حتى يجد @sentry/vite-plugin خرائط لرفعها — تُحذَف بعد الرفع
      // (filesToDeleteAfterUpload أدناه)، فلا تصل النسخة المنشورة أبداً. مُقيَّد
      // بنفس شرط تفعيل الإضافة (hasSentryToken): توليد خرائط لا تُرفَع ولا
      // تُحذَف يعني شحنها للجمهور في dist/ بلا فائدة — أسوأ من عدم توليدها.
      sourcemap: hasSentryToken,
      rolldownOptions: {
        output: {
          // حزم البائعين منفصلة لتبقى مخزّنة بين النشرات. التعبير يطابق اسم
          // الحزمة نفسه بعد node_modules/ — لا نصّاً في أي موضع من المسار،
          // فـ`react-virtuoso` و`motion/dist/es/react.mjs` لا يقعان في react.
          //
          // ⚠️ react-vendor قبل ui-vendor: المجموعة تسحب معها اعتماديات ما
          // تلتقطه، وmotion يعتمد على react — فلو سبقت ui-vendor لابتلعت react.
          codeSplitting: {
            groups: [
              { name: 'firebase-sdk', test: /[\\/]node_modules[\\/]@?firebase[\\/]/ },
              { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'ui-vendor',    test: /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils|lucide-react|react-virtuoso)[\\/]/ },
            ],
          },
        },
      },
    },

    plugins: [
      react(),
      // 🆕 Tailwind v4 عبر إضافة Vite الرسمية بدل مسار PostCSS.
      //
      // زال معها ملفان كاملان: postcss.config.js وtailwind.config.js.
      //   • الأول لم يكن يفعل شيئاً سوى تحميل tailwind وautoprefixer، وv4
      //     تتولّى البادئات داخلياً عبر Lightning CSS — فلم يبقَ فيه محتوى.
      //   • الثاني كان `content` + `theme: { extend: {} }` + `plugins: []`،
      //     أي بلا أي تخصيص فعلي. v4 تكتشف الملفات تلقائياً، والثيم الافتراضي
      //     يُستورد مع `@import 'tailwindcss'` في src/index.css — فلا شيء
      //     يُترجَم. لو احتيج تخصيص لاحقاً فمكانه `@theme` في CSS، لا ملف JS.
      tailwindcss(),
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
      // 🆕 رفع خرائط المصدر لـ Sentry — يعمل فقط حين يوجد SENTRY_AUTH_TOKEN
      // (بناء Vercel الحقيقي بعد ضبط إعدادات المشروع). في CI (GitHub Actions)
      // لا يوجد التوكن إطلاقاً، فـ disable يجعل الإضافة تتجاوز نفسها بصمت —
      // بلا أي تعديل على .github/workflows/ci.yml.
      sentryVitePlugin({
        org: pick('SENTRY_ORG'),
        project: pick('SENTRY_PROJECT'),
        authToken: pick('SENTRY_AUTH_TOKEN'),
        disable: !hasSentryToken,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
    ],
  };
})