import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": "@storybook/react-vite",

  // ⚠️ Storybook يرث vite.config.js كاملاً، وفيه VitePWA — وهي بلا أي معنى هنا:
  // مخرج Storybook ليس التطبيق، فعامل الخدمة المولَّد له لا يخدم أحداً. وحزمة
  // المدير sb-manager/globals-runtime.js وحدها 3.3 MB، أي فوق حدّ workbox
  // الافتراضي (2 MiB).
  //
  // 🆕 هذا كان يحدث منذ البداية لكن بصمت: vite-plugin-pwa 0.19 كان يكتفي بـ
  // console.warn، فيمرّ البناء ويُولَّد عامل خدمة ناقص لا يستعمله أحد. ومنذ
  // 1.x صارت الحالة نفسها ترمي استثناءً فيسقط البناء — فانكشف الخلل الكامن.
  //
  // نُسقط الإضافة بدل رفع maximumFileSizeToCacheInBytes: رفع الحدّ يُسكت
  // العَرَض ويُبقي توليد عامل خدمة لا لزوم له أصلاً.
  // ⚠️ التسطيح ضروري: VitePWA() تُعيد مصفوفة إضافات لا إضافة واحدة، وVite يقبل
  // التداخل — فالترشيح على المستوى الأول وحده لا يراها.
  viteFinal: async (config) => {
    const isPwa = (p: unknown): boolean =>
      !!p && typeof p === 'object' && 'name' in p && String((p as { name: unknown }).name).startsWith('vite-plugin-pwa');
    const strip = (plugins: unknown[]): unknown[] =>
      plugins.flatMap(p => (Array.isArray(p) ? strip(p) : isPwa(p) ? [] : [p]));
    config.plugins = strip(config.plugins ?? []) as typeof config.plugins;
    return config;
  },
};
export default config;
