// ─── إعداد ESLint (flat config) ──────────────────────────────────────────────
//
// مبدأ لم يتغيّر عن الإعداد السابق: نلتقط الأخطاء المنطقية فقط (TS + قواعد
// React Hooks) دون فرض أسلوب تنسيق يصطدم بمحاذاة الأعمدة اليدوية المتّبعة في
// هذا المشروع. لا قواعد أقواس/فواصل منقوطة/علامات اقتباس — تُترك للمطوّر
// (ولـ Prettier عبر eslint-config-prettier الذي يُطفئ ما قد يتعارض).
//
// 🆕 انتقل من .eslintrc.cjs إلى هذا الملف لأن ESLint 10 أسقط دعم eslintrc
// كلياً. الفروق البنيوية التي يجب الانتباه لها عند التعديل:
//
//   • `--ext ts,tsx` لم يعد موجوداً في سطر الأوامر؛ نطاق الملفات يُحدَّد هنا
//     عبر `files`. الافتراضي في flat config هو js/mjs/cjs فقط — فبلا `files`
//     أدناه لن يُفحص أي ملف TypeScript إطلاقاً، ويمرّ `npm run lint` أخضر
//     وهو لا يفحص شيئاً.
//   • `ignorePatterns` صار `ignores` في كتلة مستقلة تُطبَّق عالمياً.
//   • `env: { browser: true }` صار `languageOptions.globals`.
//   • ترتيب الكتل يحسم التعارض: الأخيرة تغلب. لذا `prettier` بعد الإعدادات
//     الموصى بها، والاستثناءات بعد كل شيء.
import js            from '@eslint/js'
import tseslint      from 'typescript-eslint'
import reactHooks    from 'eslint-plugin-react-hooks'
import reactRefresh  from 'eslint-plugin-react-refresh'
import storybook     from 'eslint-plugin-storybook'
import prettier      from 'eslint-config-prettier/flat'
import globals       from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'storybook-static', 'node_modules'] },

  // ⚠️ يجب أن يبقى في المستوى الأعلى، لا داخل `extends` لكتلة لها `files`:
  // إعداد Storybook مصفوفةُ كتل كلٌّ منها محصورة بأنماط القصص (*.stories.*)،
  // ووضعه داخل كتلة أخرى يدهس ذلك الحصر بنطاق الكتلة الحاوية — فتُطبَّق قواعد
  // القصص على كل ملف TypeScript في المشروع. قيس ذلك فعلاً: 1702 مخالفة عبر
  // 167 ملفاً، أغلبها use-storybook-expect في ملفات اختبار ليست قصصاً أصلاً.
  ...storybook.configs['flat/recommended'],

  {
    // 🆕 نفس نطاق `--ext ts,tsx` السابق بالضبط: ملفات الإعداد في الجذر
    // (vite.config.js، tailwind.config.js، postcss.config.js) وسكربتات
    // scripts/*.mjs لم تكن تُفحص من قبل، ولا تُفحص الآن. توسيع النطاق قرار
    // مستقل عن ترقية ESLint ولا يُخلط بها.
    //
    // دقّة: flat config *تكتشف* تلك الملفات (تظهر في --format json) لأن
    // اكتشافها الافتراضي يشمل js/mjs/cjs — لكن لا كتلة هنا تُفعّل عليها أي
    // قاعدة، فمخرجها صفر. الأثر مطابق لـ --ext ts,tsx، لا الآلية.
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks':  reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ⚠️ القاعدتان مُعلَنتان يدوياً بدل استعمال إعداد الإضافة الجاهز —
      // وهذا فرق جوهري لا تفصيل أسلوبي.
      //
      // في eslint-plugin-react-hooks v4 كان `plugin:react-hooks/recommended`
      // يساوي هاتين القاعدتين بالضبط. في v7 صار كلا إعداديه (recommended
      // وrecommended-latest) يفعّل 17 قاعدة: طقم React Compiler كاملاً.
      //
      // قيس أثره على هذا المستودع قبل استبعاده. كان 26 مخالفة في 21 ملفاً،
      // وهو اليوم **18 في 17** بعد معالجة ما كان يُعالَج بلا مخاطرة — وليست
      // في الباقي مخالفة واحدة تمثّل خطأً فعلياً:
      //   • 16 × set-state-in-effect — أكثرها خطّافات تشترك في onSnapshot
      //     (useExpenses، useTravelers، useTripMembers…). القاعدة تريد
      //     useSyncExternalStore بدلاً منه؛ أي إعادة كتابة 12 خطّاف بيانات.
      //   • 2 × immutability — إسناد window.location.href (تنقّل مقصود وموثَّق
      //     داخل معالج حدث لا أثناء الرسم)، ومرجع ذاتي داخل مغلّف لا يُنفَّذ
      //     إلا بعد التصريح. كلتاهما إيجابية كاذبة.
      //
      // 🆕 وزالت فئتان كاملتان (2026-09-11): 7 × refs بتحويل تهيئة المخزن في
      // TripStoreProvider من `useRef.current ??=` إلى مُهيّئ useState الكسول،
      // و1 × purity بنقل Date.now() في useSyncRecovery من قيمة ابتدائية لـ
      // useRef إلى داخل التأثير. لا شيء من ذلك غيّر سلوكاً.
      //
      // تبنّي هذه القواعد قرار معماري مستقل بكلفته ومخاطره (إعادة هيكلة طبقة
      // البيانات كاملة في تطبيق يعمل)، لا أثر جانبي لترقية ESLint. تُترك
      // معطّلة عمداً حتى يُتَّخذ ذلك القرار على حدة.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // محاذاة المسافات داخل الاستيراد/الكائنات أسلوب مقصود — لا نمنعها
      'no-multi-spaces': 'off',
    },
  },

  {
    // 🆕 ملفات Storybook — قاعدتان من الإعداد العام لا تنطبقان هنا:
    files: ['src/stories/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    rules: {
      // أسماء القصص بالعربية عمداً (التطبيق عربي بالكامل وهي ما يظهر في
      // الشريط الجانبي). العربية بلا حالة أحرف أصلاً، فقاعدة PascalCase
      // تُنتج تحذيراً لكل قصة بلا أي إجراء ممكن.
      'storybook/prefer-pascal-case': 'off',
      // هذه الملفات ليست جزءاً من شجرة HMR للتطبيق، فتصدير أدوات بجانب
      // مكوّن فيها لا يكسر Fast Refresh.
      'react-refresh/only-export-components': 'off',
    },
  },
)
