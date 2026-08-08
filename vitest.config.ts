import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// إعداد Vitest تم تحديثه ليدعم اختبارات الدوال النقية بالإضافة إلى 
// اختبارات مكونات واجهة المستخدم (React Components) عبر محاكاة المتصفح (jsdom).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', // تغيير أساسي لدعم React Testing Library
    setupFiles: ['./src/setupTests.ts'], // استدعاء ملف الإعدادات
    globals: true,
    // تحديث المسار ليشمل ملفات .tsx الخاصة بواجهات ريأكت
    include: ['src/**/*.{test,spec}.{ts,tsx}'], 
  },
})