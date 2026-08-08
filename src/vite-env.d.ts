/// <reference types="vite/client" />

// 🆕 يعرّف import.meta.env لـ TypeScript. لولاه يفشل tsc على قراءة الإعداد في
// firebase.ts بخطأ "Property 'env' does not exist on type 'ImportMeta'".

// أنواع متغيرات البيئة المستخدمة فعلياً — تجعل الخطأ المطبعي في اسم متغير
// خطأ ترجمة بدل قيمة undefined تظهر وقت التشغيل.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
