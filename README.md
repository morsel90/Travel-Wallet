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
- تصدير سجل المصاريف إلى CSV.
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
| `npm test` | تشغيل اختبارات الوحدة (`vitest run`) |
| `npm run test:watch` | الاختبارات بوضع المراقبة |

> ملاحظة: الـ Service Worker (PWA) لا يُولَّد إلا بعد `npm run build`؛ لاختباره
> محلياً استخدم `npm run build && npm run preview`.

## إعداد Firebase

التطبيق متصل بمشروع Firebase معرّفه `travelapp-87206` (الإعداد في `src/firebase.ts`).

- **المصادقة:** المستخدمون يُسجَّلون تلقائياً كـ Anonymous؛ المسؤول حساب
  Email/Password يُنشأ يدوياً في Firebase Console › Authentication.
- **تحديد المسؤول:** `ADMIN_EMAILS` في `src/constants.ts` — يجب أن يطابق بريد
  Firebase Auth ودالة `isAdmin()` في `firestore.rules`.
- **قواعد الأمان:** المصدر الرسمي ملف `firestore.rules` في جذر المشروع. انشره عبر:

  ```bash
  npx -y firebase-tools deploy --only firestore:rules
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

## دليل المساهمة

راجع `CLAUDE.md` لتفاصيل المعمارية والأنماط الواجب اتّباعها عند التعديل
(فصل المنطق في hooks، الدوال النقية في `utils/`، استهلاك `AppContext`… إلخ).
