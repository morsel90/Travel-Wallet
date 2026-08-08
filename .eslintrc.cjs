/* eslint config — Vite + React + TypeScript
 *
 * مبدأ: نلتقط الأخطاء المنطقية فقط (TS + قواعد React Hooks) دون فرض أسلوب
 * تنسيق يصطدم بمحاذاة الأعمدة اليدوية المتّبعة في هذا المشروع. لا قواعد
 * أقواس/فواصل منقوطة/علامات اقتباس — تُترك للمطوّر (ولـ Prettier إن أُضيف لاحقاً).
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended', 'prettier', 'plugin:storybook/recommended'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // محاذاة المسافات داخل الاستيراد/الكائنات أسلوب مقصود — لا نمنعها
    'no-multi-spaces': 'off',
  },
  overrides: [
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
  ],
}
