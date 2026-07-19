# CLAUDE.md — Project History & Living Documentation

<div dir="rtl" style="text-align: right">

## آخر تحديث: 2026-07-19 01:59 UTC

---

## لمحة عامة عن المشروع (Project Overview)

تطبيق ويب (PWA) بتقنية SPA لتتبّع مصاريف الرحلات الجماعية وتقسيمها بين المسافرين.
يدعم رحلات متعددة (كل رحلة مستقلة ببياناتها ورمز PIN خاص بها)، ومزامنة فورية
عبر Firebase، وتخزين محلي يعمل دون اتصال، وواجهة عربية كاملة (RTL)، وعملات
متعددة بأسعار صرف حيّة. مكتوب بـ React 18 + TypeScript 5.3 + Vite 5.1.

---

## سجل القرارات النشطة (Active Decisions & Rationale)

1. **مصادقة المسؤول عبر Custom Claims** (v26): استُبدل فحص `ADMIN_EMAILS` الثابت
   في الكود بقاعدة Firestore بـ `request.auth.token.admin == true`. المسؤول يُمنح
   صلاحية `admin: true` عبر Admin SDK (`scripts/set-admin.mjs`) بدل حرق البريد
   الإلكتروني في `constants.ts` — أكثر أماناً وأسهل إدارة لصلاحيات متعددة.

2. **إحصائيات HTML/CSS خالص** (v25+): استُبدلت Recharts بالكامل بـ HTML/CSS يدوي
   لثلاثة أسباب: (1) تقليل حجم الحزمة (~50KB)، (2) عمل دون اتصال بدون انتظار تحميل
   مكتبة خارجية، (3) تحكم كامل بالتنسيق العربي والـ RTL.

3. **شريط إدخال ذكي ثابت بدل FAB** (v26): استُبدل زر FAB العائم (`QuickAddFab`)
   بشريط إدخال سفلي ثابت (`SmartInputBar`) يتضمّن حقل مبلغ + وصف + زر توسيع للنموذج
   الكامل — تجربة مستخدم أسرع للطريقة الأكثر شيوعاً (إضافة مصروف سريع).

4. **تصدير Excel بدل CSV** (v26): استُبدل تصدير CSV بتصدير Excel حقيقي (XLSX)
   عبر مكتبة مضمّنة بالكامل (pure JS OOXML) بلا تبعيات خارجية — يدعم العربية،
   التنسيق، أوراق متعددة، والطباعة.

5. **Rate Limiting للبوابة** (v26): أضيفت حماية من تخمين رمز الرحلة عبر
   `rateLimits/verify_*` في Cloud Function (5 محاولات/15 دقيقة للمجهول، 20 للمسجّل)،
   مع عدّ تنازلي يُعرض في الواجهة.

6. **ردود فعل لمسية (Haptic Feedback)** (v26): أضيفت ردود فعل لمسية (اهتزاز) عبر
   Web Vibration API مع ومضات بصرية بديلة لأجهزة iOS — تُستخدم في كل التفاعلات
   الهامة (إضافة/حذف/نسخ/أخطاء).

7. **كشف حساب فردي + طباعة PDF** (v26): أضيفت نافذة ملف مسافر متكاملة تعرض كشف
   حساب تفصيلي مع إمكانية التصدير إلى Excel والطباعة عبر Portal منفصل.

8. **العملات الذكية** (v26): قائمة العملات في نموذج المصروف تُرتّب بذكاء —
   المثبّتة (SAR/USD/EUR…) أولاً، ثم الأكثر استخداماً في الرحلة، ثم البقية أبجدياً.

---

## سجل التغييرات الأخيرة (Recent Changes Log)

### 2026-07-19 01:59 — تحديث شامل v26 (إعادة هيكلة + ميزات جديدة)

- **الملفات المعدَّلة**: 28 ملفاً (15 تعديلاً + 13 إضافة + 4 حذف)
- **النوع**: Feature + Refactor + Security
- **الوصف**: تحديث شامل يتضمن إعادة هيكلة كبيرة — إزالة Recharts، إضافة نظام
  شريط الإدخال الذكي، نظام التقارير والطباعة، ردود الفعل اللمسية، حماية البوابة
  من التخمين، تصدير Excel، ملف المسافر الفردي، وتوسعة العملات.

#### ⚙️ تعديلات البنية التحتية (Infrastructure)

| الملف | التغيير |
|---|---|
| `package.json` | إزالة `recharts`، بقاء `react-virtuoso` |
| `.gitignore` | إزالة `*.env*` — السماح بتتبع `.env.local` |
| `firestore.rules` | استبدال `ADMIN_EMAILS` بـ Custom Claim `admin: true`؛ إضافة قاعدة حظر `rateLimits/*` |
| `functions/index.js` | إضافة Rate Limiting (5/20 محاولة لكل 15 دقيقة)، تحسين نوع المصادقة، استخدام `FieldValue.increment` |

#### 🔐 المصادقة والأمان (Auth & Security)

| الملف | التغيير |
|---|---|
| `src/hooks/useAuth.ts` | استبدال `ADMIN_EMAILS` بـ `getIdTokenResult().claims.admin`؛ إضافة `rateLimitSeconds` مع عدّ تنازلي؛ تعديل `callVerify` لترجع `{ success, retryAfter, message }` |
| `src/components/TripGate.tsx` | إضافة خاصية `rateLimitSeconds` مع عرض عدّ تنازلي |
| `src/components/modals/AdminSignInModal.tsx` | تغيير زر "تفعيل" → "دخول" |

#### 🆕 ملفات جديدة (New Files)

| المسار | الوصف |
|---|---|
| `src/components/SmartInputBar.tsx` | شريط إدخال ثابت سفلي (مبلغ + وصف + توسيع) بدل FAB |
| `src/components/EmptyState.tsx` | مكوّن حالة فارغة عامة قابلة لإعادة الاستخدام |
| `src/components/modals/TravelerProfileModal.tsx` | نافذة ملف مسافر (كشف حساب، طباعة، تصدير) |
| `src/components/reports/ReportsView.tsx` | صفحة تقارير شاملة (ملخص الرحلة + يومي) |
| `src/components/reports/PrintDocs.tsx` | مكوّنات طباعة PDF (تقرير رحلة + كشف حساب) |
| `src/utils/cn.ts` | دمج أسماء فئات Tailwind (بديل clsx) |
| `src/utils/haptics.ts` | ردود فعل لمسية (vibrate) + ومضات بصرية |
| `src/utils/reportData.ts` + `.test.ts` | دوال بناء بيانات التقارير (كشف حساب، ملخص يومي) |
| `src/utils/reports.ts` + `.test.ts` | بناة صفوف Excel (تصدير رحلة / مسافر) |
| `src/utils/xlsx.ts` | مولّد Excel (.xlsx) مضمّن بالكامل (OOXML) |
| `src/hooks/useDepositLogs.ts` | جلب سجل تدقيق رصيد مسافر |
| `scripts/set-admin.mjs` | سكربت منح/سحب صلاحية المسؤول عبر Admin SDK |

#### ❌ ملفات محذوفة (Deleted Files)

| المسار | السبب |
|---|---|
| `src/components/QuickAddFab.tsx` | استُبدل بـ SmartInputBar |
| `src/components/charts/CategoryPieChart.tsx` | استُبدل بـ HTML/CSS خالص داخل ChartsSection |
| `src/components/charts/SettlementFlowChart.tsx` | استُبدل بـ HTML/CSS خالص داخل ChartsSection |
| `src/components/charts/SpendingTrendChart.tsx` | استُبدل بـ HTML/CSS خالص داخل ChartsSection |

#### 🎨 تحسينات الواجهة (UI/UX)

| الملف | التغيير |
|---|---|
| `src/App.tsx` | استيراد `SmartInputBar`, `EmptyState`, `ReportsView`; إضافة `showReports`; تمرير `isFirstExpense`; استخدام `exportTripToExcel`; إضافة `rateLimitSeconds` لـ `TripGate`; إضافة خاصية `onStatClick` في Header; استبدال CSV بـ Excel; إضافة أقسام `scroll-mt-24`; دمج زر إضافة مسافر منقط |
| `src/components/Header.tsx` | إضافة `isOnline` + `onStatClick` (تمرير لإحصائيات الهيدر) |
| `src/components/ExpenseSection.tsx` | إضافة `convertArabicNumerals`; قائمة عملات ذكية (مثبّتة + مستخدمة + بقية); تحسين الواجهة |
| `src/components/TravelerSection.tsx` | إضافة `convertArabicNumerals`; بطاقات قابلة للضغط → `TravelerProfileModal`; تحسين `AddTravelerForm` (تصميم جديد، أيقونة ريال، text-base لمنع زوم iOS) |
| `src/components/charts/ChartsSection.tsx` | إعادة كاملة (HTML/CSS): تنسيقات مع زر "تم التحويل"، أشرطة فئة، خط زمني عمودي |
| `src/components/Modal.tsx` (ضمن DepositModal) | تحسين حقل المبلغ (text + inputMode + منع زوم iOS) |
| `src/components/Skeleton.tsx` | تحديث التعليقات (إزالة ذكر Recharts/StatBox) |
| `src/components/Toast.tsx` | إضافة نوع `error` (لون وردي، أيقونة AlertTriangle، بلا bounce); إضافة زر `onRetry` |
| `src/components/Misc.tsx` | إعادة كاملة لـ `BankDetailsCard` — إدارة نسخ ذاتية، Web Share API، ومضات لمسية |
| `src/modals/DepositModal.tsx` | تحويل `type="number"` ← `inputMode="decimal"` مع تحويل الأرقام العربية |
| `src/index.css` | إضافة `animate-fadeIn`; إصلاحات Safari (date/select); دعم الطباعة عبر `#print-root` |
| `src/icons.ts` | إضافة `Share2`, `Printer` |

#### 💡 تحسينات الوظائف (Logic)

| الملف | التغيير |
|---|---|
| `src/constants.ts` | إزالة `INITIAL_TRAVELERS` و`ADMIN_EMAILS`; توسعة `CURRENCY_LABELS` من 9 إلى 160 عملة; تحسين `buildCurrencyMap` (تجاهل العملات بلا سعر) |
| `src/hooks/useExpenseActions.ts` | إضافة `isFirstExpense` + `haptic.success()` + `haptic.flash()` (احتفالي); إضافة `lastExpensePayloadRef` لإعادة المحاولة; تحسين معالجة الأخطاء مع `onRetry`; توسيع `openExpenseForm` لاستقبال `initialDesc/initialAmount` |
| `src/hooks/useExchangeRates.ts` | جلب الأسعار لكل العملات (160) بدل الاحتياطية فقط |
| `src/types.ts` | إضافة حقل `onRetry` في `ToastMessage` |
| `src/context/DataContext.tsx` | تصدير `travelers` (لـ `getShortName`) |

- **الأثر**: تحسين تجربة المستخدم (إدخال أسرع، ردود فعل لمسية، تقارير متكاملة، Excel/PDF)،
  تعزيز الأمان (Rate Limiting + Custom Claims)، دعم 160 عملة، توافق أفضل مع iOS Safari.
- **الاختبارات**: 6 ملفات اختبار جديدة (`reportData.test.ts`, `reports.test.ts`,
  إضافة اختبارات للتأكّد من صحة بناء البيانات والتقارير).
- **تغييرات جذرية**:
  - ⚠️ `ADMIN_EMAILS` أُزيل — يجب منح صلاحية المسؤول عبر
    `node scripts/set-admin.mjs grant <email>` (بدل إضافة البريد إلى `constants.ts`)
  - ⚠️ قواعد Firestore تتطلّب `admin: true` في Custom Claims — انشر القواعد:
    `firebase deploy --only firestore:rules`
  - ⚠️ `QuickAddFab.tsx` أُزيل وحل محلّه `SmartInputBar` — أي كود يعتمد على
    الاستيراد القديم يحتاج تحديثاً
  - ⚠️ `recharts` أُزيلت من `package.json` — شغّل `npm install` بعد السحب
  - ⚠️ `exportExpensesToCSV` لم تعد موجودة — استُبدِلت بـ `exportTripToExcel`

---

## الحالة الراهنة (Current State)

- **الفرع (Branch)**: `main`
- **آخر commit**: `b7ffb82` - Initial commit for Travel-Wallet
- **حالة git**: 28 ملفاً معدّلاً + 13 ملفاً جديداً غير متتبّع
- **الملفات الرئيسية**:
  - `src/App.tsx` (693 سطراً) — المنسّق الرئيسي
  - `src/components/ExpenseSection.tsx` — نموذج وقائمة المصاريف
  - `src/components/TravelerSection.tsx` — بطاقات ونموذج المسافرين
  - `src/components/charts/ChartsSection.tsx` — إحصائيات HTML/CSS
  - `src/hooks/useAuth.ts` — مصادقة و TripGate
  - `src/hooks/useExpenseActions.ts` — منطق عمليات المصروف
  - `src/utils/reports.ts` + `xlsx.ts` — تصدير Excel

### المشكلات المعروفة (Known Issues)

1. **`tsconfig.node.json`** يشير إلى `vite.config.ts` لكن الملف الفعلي هو
   `vite.config.js` — لا يُسبّب خطأً حالياً لكنه تناقض.
2. **GitHub Actions**: المجلد موجود لكنه فارغ — لا توجد CI pipeline.
3. **`recharts`**: قد تبقى في `node_modules` (تبعية عابرة) رغم إزالتها من
   `package.json` — لا تؤثّر على البناء.
4. **`ADMIN_EMAILS`**: تأكّد من عدم بقاء أي مرجع له في أي ملف (تمت إزالته من
   `constants.ts` و`useAuth.ts` و`firestore.rules`).

### الخطوات القادمة (Next Steps)

- إضافة CI pipeline (typecheck → test → build)
- توسيع التغطية الاختبارية لتشمل hooks ومكوّنات (React Testing Library)
- إصلاح `tsconfig.node.json` للإشارة إلى `vite.config.js`
- إضافة إشعارات Push (Push Notifications)
- توثيق API عبر JSDoc للدوال العامة

---

## البيئة والتبعيات (Environment & Dependencies)

- **Runtime**: Node.js (v18+)
- **Package Manager**: npm
- **Key Packages** (production):
  - `react@^18.2.0`, `react-dom@^18.2.0`
  - `firebase@^10.8.1` (Auth + Firestore)
  - `framer-motion@^11.2.10` (Bottom Sheet animations)
  - `lucide-react@^0.383.0` (icons)
  - `react-virtuoso@^4.18.10` (virtual list)
- **Key Packages** (dev):
  - `typescript@^5.3.3`, `vite@^5.1.4`
  - `tailwindcss@^3.4.1`
  - `vitest@^1.6.0`
  - `vite-plugin-pwa@^0.19.8`
- **قاعدة البيانات**: Firebase Firestore (مع `persistentLocalCache` للتخزين المحلي)
- **Cloud Functions**: 1 (verifyTripPin — v2 onCall)
- **استضافة**: Vercel (SPA) + Firebase (Rules + Functions)

---

## ملاحظات معمارية (Architecture Notes)

- **فصل الاهتمامات**: `App.tsx` (منسّق) → hooks (منطق) → utils (دوال نقية) → components (عرض)
- **سياقان منفصلان**: `DataContext` (للقراءة فقط) + `UIContext` (نماذج وإجراءات)
- **تحديث متفائل**: تُغلَق النماذج فور الإرسال مع شارة `_pending`
- **الكاش المحلي**: `persistentLocalCache` + `persistentMultipleTabManager` (يعمل دون اتصال)
- **تصدير Excel**: مكتبة OOXML مضمّنة بالكامل في `src/utils/xlsx.ts` (بلا تبعيات)
- **طباعة PDF**: عبر Portal إلى `#print-root` مع `@media print` في `index.css`
- **تجنّب CORS**: Cloud Function تُستدعى عبر `/api/verifyTripPin` (Vercel rewrite)
- **لا توجد تبعية لـ Recharts** — الإحصائيات HTML/CSS خالص

---

## سير العمل في التطوير

```bash
npm install                # تثبيت التبعيات
npm run dev                # تشغيل خادم التطوير
npm run build              # tsc && vite build
npm test                   # vitest run
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint
npm run format             # Prettier
```

### النشر (ثلاثة أنظمة منفصلة ⚠️)

```bash
vercel --prod                                  # الواجهة
firebase deploy --only firestore:rules          # قواعد Firestore
firebase deploy --only functions                # Cloud Functions
node scripts/create-trip.mjs                    # إنشاء رحلة (كتابة مباشرة)
node scripts/set-admin.mjs grant <email>        # منح صلاحية المسؤول
```

---

## القواعد الأساسية للمساهمين

1. **لا تستخدم `enableIndexedDbPersistence`** — استخدم `persistentLocalCache`
2. **لا تستدعِ Cloud Function عبر `cloudfunctions.net`** استخدم `/api/verifyTripPin`
3. **لا تحذف `vercel.json`** — ضروري لـ Vercel rewrite
4. **لست بحاجة لـ `recharts`** — الإحصائيات HTML/CSS خالص
5. **استخدم `scripts/create-trip.mjs`** لإنشاء الرحلات
6. **استخدم `scripts/set-admin.mjs`** لمنح صلاحية المسؤول
7. **الأيقونات** عبر `src/icons.ts` — لا تستورد من `lucide-react` مباشرة
8. **إضافة Modal** → `src/components/modals/` مع `React.lazy()`
9. **إضافة حقل مصروف** → types → useExpenseActions → ExpenseForm → ExpenseListItem → export → firestore.rules

</div>
