# لوحة مصاريف السفر 🧳

تطبيق ويب (PWA) لتتبّع مصاريف رحلة جماعية وتقسيمها بين المسافرين، مع مزامنة فورية
عبر Firebase ودعم العمل دون اتصال. يدعم عملات متعددة بأسعار صرف حيّة، وواجهة
عربية بالكامل (RTL).

## المزايا

- تسجيل المصاريف وتوزيعها بالتساوي على المشاركين المحدّدين.
- متابعة رصيد كل مسافر (المُودَع مقابل حصّته من المصاريف).
- دعم عملات متعددة مع جلب أسعار الصرف حيّة مقابل الريال السعودي.
- مزامنة فورية بين كل الأجهزة عبر Firestore، مع تخزين مؤقت يعمل دون اتصال.
- صلاحيات مسؤول (تعديل/حذف) منفصلة عن المستخدم العادي (إضافة فقط).
- تصدير سجل المصاريف إلى Excel (مصنّف من أربع أوراق، وكشف حساب لكل مسافر).
- قابل للتثبيت على الجوال (Add to Home Screen) كتطبيق PWA.

## التقنيات

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Firebase 10 (Auth + Firestore) ·
vite-plugin-pwa (Workbox) · Vitest.

## المتطلبات

Node.js 18 أو أحدث، و npm.

## التشغيل المحلي

```bash
npm install      # تثبيت التبعيات (مرة واحدة بعد الاستنساخ)
npm run dev      # خادم تطوير على http://localhost:5173
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | فحص الأنواع ثم بناء الإنتاج (`tsc && vite build`) |
| `npm run preview` | معاينة بناء الإنتاج محلياً |
| `npm run typecheck` | فحص الأنواع فقط (`tsc --noEmit`) |
| `npm test` | اختبارات الوحدة (`vitest run`) — ٣١٨ اختباراً، ~٣ ثوانٍ |
| `npm run test:watch` | الاختبارات بوضع المراقبة |
| `npm run test:rules` | اختبارات `firestore.rules` على محاكي حقيقي — يتطلب Java |
| `npm run test:e2e` | اختبارات المتصفح (Playwright) — يتطلب Java + `npm run e2e:install` مرة |
| `npm run lint` | ESLint |
| `npm run storybook` | معمل المكوّنات على المنفذ 6006 |

> ملاحظة: الـ Service Worker (PWA) لا يُولَّد إلا بعد `npm run build`؛ لاختباره
> محلياً استخدم `npm run build && npm run preview`.

## إعداد Firebase

إعداد Firebase يأتي من متغيّرات بيئة وقت البناء، لا من قيم مكتوبة في الكود.
انسخ `.env.example` إلى `.env.local` واملأه من Firebase Console › Project
settings › Your apps. **التطبيق يرفض الإقلاع إن نقص أي متغيّر** — عمداً، حتى لا
يكتب بناءٌ مُخطئ الإعداد إلى قاعدة بيانات الإنتاج بصمت.

- **المصادقة:** المستخدمون يُسجَّلون تلقائياً كـ Anonymous؛ المسؤول حساب
  Email/Password يُنشأ يدوياً في Firebase Console › Authentication.
- **تحديد المسؤول:** عبر custom claim لا عبر ثابت في الكود. بعد أن يسجّل
  المستخدم دخوله مرة واحدة:

  ```bash
  node scripts/set-admin.mjs grant <email>    # يتطلب serviceAccountKey.json
  ```

  ودالة `isAdmin()` في `firestore.rules` تقرأ هذا الـ claim.
- **قواعد الأمان:** المصدر الرسمي ملف `firestore.rules` في جذر المشروع. انشره عبر:

  ```bash
  npx firebase deploy --only firestore:rules
  ```

  أو الصق محتواه في Firebase Console › Firestore › Rules.

## النشر

```bash
vercel --prod    # بعد ربط المشروع عبر vercel link
```

## أيقونات PWA

الأيقونات موجودة في `public/icons/` (`icon-192.png` و`icon-512.png`). لتوليد
بدائل من أي صورة مربّعة يمكن استخدام <https://realfavicongenerator.net> أو
<https://maskable.app> (للأيقونة الـ maskable).

## من أين تبدأ

`CLAUDE.md` يتجاوز الألف سطر لأنه يوثّق **سبب** كل قرار — وكثير منها كُتب بعد
عطل حقيقي علّمه. لا تقرأه من أوّله؛ ادخل من الباب الذي يخصّك:

| إن كنت تريد… | اقرأ |
|---|---|
| تشغيل المشروع محلياً | هذا الملف، ثم *Development Setup* |
| فهم البنية العامة | *Project Overview* ثم *Architecture* |
| تعديل الحسابات المالية | ⚠️ *Testing › Financial invariants* **قبل** لمس `utils/calculations.ts` |
| تعديل `App.tsx` أو السياقات | *Design Decisions* — قسما تفكيك `App.tsx` وفصل السياق حسب التقلّب |
| إضافة ميزة | *Contributing Guidelines* (٢٢ قاعدة، كل واحدة تمنع عطلاً وقع فعلاً) |
| النشر | *Deployment* — ثلاثة أنظمة تُنشر منفصلة |
| حلّ مشكلة | *Troubleshooting* — جدول عَرَض ← سبب ← حلّ |
| استعادة الوصول أو المفاتيح | [`RECOVERY.md`](./RECOVERY.md) |

**أهم ما يجب معرفته قبل أي تعديل:**

1. **العمل يمرّ عبر Pull Request.** الدفع المباشر إلى `main` مرفوض من الخادم،
   ووظيفة `build` شرط للدمج. خطاف `pre-push` يشغّل lint/typecheck/test محلياً
   ويُضبط تلقائياً عند `npm install`.
2. **الحسابات المالية محكومة بقواعد لا باختبارات وحدة.** أي تغيير في
   `utils/calculations.ts` يجب أن يُبقي القواعد الأربع في
   `calculations.invariants.test.ts` خضراء — ولا تُضعَّف قاعدة لتمرّ.
3. **`src/App.test.tsx` اختبار تثبيت سلوك.** فشله أثناء إعادة هيكلة يعني أن
   الهيكلة غيّرت سلوكاً — تعديل التوقّع لتمريره يُلغي الغرض منه بالكامل.
