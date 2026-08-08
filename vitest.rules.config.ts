import { defineConfig } from 'vitest/config'

// 🔴 إعداد Vitest منفصل خصيصاً لاختبارات firestore.rules (tests/firestore-rules/).
//
// لماذا منفصل عن vitest.config.ts الرئيسي:
//   1. بيئة 'node' لا 'jsdom' — هذه الاختبارات تتحدّث مع محاكي Firestore عبر
//      الشبكة المحلية، ولا تلمس DOM إطلاقاً.
//   2. لا حاجة لحقن متغيرات VITE_FIREBASE_* (define في الإعداد الرئيسي) —
//      @firebase/rules-unit-testing يتصل بالمحاكي مباشرة بلا أي إعداد مشروع حقيقي.
//   3. الأهم: تشغيلها يتطلب محاكي Firestore قائماً فعلياً (عبر
//      `firebase emulators:exec` — انظر سكربت test:rules في package.json). لو
//      شملها vitest.config.ts الرئيسي (include الافتراضي src/**)، لصار `npm test`
//      العادي يفشل بلا محاكي، أو يحتاج المحاكي في كل تشغيل حتى لاختبارات لا علاقة
//      لها بـ Firestore إطلاقاً. الفصل يبقي `npm test` سريعاً ومستقلاً.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // عمليات المحاكي (اتصال شبكي محلي حقيقي، ولو على 127.0.0.1) أبطأ ملحوظاً
    // من اختبارات الوحدة النقية — المهلة الافتراضية (5 ثوانٍ) قد لا تكفي خصوصاً
    // في beforeAll (تحميل قواعد Firestore والاتصال الأول بالمحاكي).
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
