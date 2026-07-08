/* eslint config — Vite + React + TypeScript
 *
 * مبدأ: نلتقط الأخطاء المنطقية فقط (TS + قواعد React Hooks) دون فرض أسلوب
 * تنسيق يصطدم بمحاذاة الأعمدة اليدوية المتّبعة في هذا المشروع. لا قواعد
 * أقواس/فواصل منقوطة/علامات اقتباس — تُترك للمطوّر (ولـ Prettier إن أُضيف لاحقاً).
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier', // يُعطّل قواعد ESLint التي تتعارض مع Prettier — يجب أن يبقى الأخير
  ],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // محاذاة المسافات داخل الاستيراد/الكائنات أسلوب مقصود — لا نمنعها
    'no-multi-spaces': 'off',
  },
}
