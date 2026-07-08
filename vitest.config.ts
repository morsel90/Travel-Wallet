import { defineConfig } from 'vitest/config'

// إعداد Vitest مستقل عن إعداد Vite/PWA — يشغّل اختبارات الوحدة على الدوال
// النقية في src/ دون الحاجة لتحميل إضافة PWA أو بيئة المتصفح.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
