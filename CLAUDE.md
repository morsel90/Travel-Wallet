# CLAUDE.md — لوحة مصاريف السفر

دليل المشروع لـ Claude Code. اقرأ هذا الملف بالكامل قبل أي تعديل.

---

## الأوامر الأساسية

```bash
npm install        # تثبيت التبعيات (مرة واحدة بعد الاستنساخ)
npm run dev        # تشغيل خادم التطوير على http://localhost:5173
npm run build      # فحص TypeScript ثم بناء الإنتاج (tsc && vite build)
npm run preview    # معاينة بناء الإنتاج محلياً
npm run typecheck  # فحص الأنواع فقط بدون بناء (tsc --noEmit)
npm test           # تشغيل اختبارات الوحدة مرة واحدة (vitest run)
npm run test:watch # تشغيل الاختبارات بوضع المراقبة (vitest)
vercel --prod      # نشر الواجهة على Vercel (بعد ربط المشروع بـ vercel link)

# نشر قواعد Firestore (تتطلب Firebase CLI: curl -sL https://firebase.tools | bash)
firebase deploy --only firestore:rules

# نشر دالة verifyTripPin (Cloud Function) — لازم بعد أي تعديل في functions/index.js
firebase deploy --only functions

# 🆕 v13 — إنشاء/تحديث رحلة (دعم رحلات متعددة): يخزّن هاش رمز PIN + بيانات
# الرحلة في Firestore (trips/{tripId} + tripSecrets/{tripId}). يتطلب
# serviceAccountKey.json في جذر المشروع (Firebase Console › Project settings ›
# Service accounts › Generate new private key). تفاعلي بالكامل (يسأل بالترتيب).
node scripts/create-trip.mjs
```

⚠️ 🆕 v13: أمر `firebase functions:secrets:set TRIP_PIN` **لم يعد يُستخدم** — رمز
كل رحلة صار هاشه مخزَّناً في Firestore (`tripSecrets/{tripId}`) عبر
`scripts/create-trip.mjs` بدل سر Secret Manager عالمي واحد. لا تُعِد هذا النمط.

⚠️ **ثلاثة أنظمة منفصلة تُنشَر بأوامر مختلفة ولا تُنشَر تلقائياً مع بعضها:**
Vercel (الواجهة) / Firestore Rules / Cloud Functions. عدّلت أحدها؟ انشره بأمره الخاص.
انسَ نشر واحد منها = سلوك متضارب صامت (مثال: قاعدة تتطلب `member` claim
لكن الواجهة المنشورة لا تعرف عن TripGate بعد — يظهر خطأ صلاحيات لكل الزوّار).

---

## هيكل المشروع

```
travel-app/
├── index.html                        ← نقطة دخول Vite (لا تعدّل إلا إن احتجت meta tags)
├── vite.config.js                    ← ★ إعداد Vite + PWA (Workbox) الوحيد — يحوي resolve.extensions وقواعد Firebase الحرجة (navigateFallbackDenylist + NetworkOnly لـ firestore)
├── vitest.config.ts                  ← إعداد Vitest (بيئة node، يلتقط src/**/*.test.ts)
├── firebase.json + .firebaserc       ← إعداد Firebase CLI لنشر firestore.rules والدوال
├── firestore.rules                   ← ★ المصدر الرسمي لقواعد أمان Firestore (بوابة رمز الرحلة + ملكية المصاريف + سجل التدقيق)
├── vercel.json                       ← ★ يعيد توجيه /api/verifyTripPin إلى Cloud Function (نفس الأصل — انظر قسم Cloud Functions أدناه). لا تحذفه.
├── functions/                        ← ★ Cloud Functions (Firebase Functions v2)
│   ├── index.js                      ← verifyTripPin: 🆕 v13 تتحقق من هاش رمز الرحلة (tripSecrets/{tripId}) وتمنح Custom Claim trips: { [tripId]: true }
│   └── package.json                  ← تبعيات الدوال (firebase-functions/firebase-admin) — منفصلة عن package.json الجذر
├── .eslintrc.cjs                     ← إعداد ESLint (قواعد منطقية فقط)
├── .prettierrc + .prettierignore     ← إعداد Prettier (npm run format)
├── .github/workflows/ci.yml          ← CI: typecheck/test/build عند كل push
├── serviceAccountKey.json            ← 🆕 v13 مفتاح Admin SDK محلي (git-ignored) — يتطلبه scripts/create-trip.mjs وسكربتات الهجرة
├── scripts/
│   ├── migrate-participants.mjs      ← هجرة لمرة واحدة: participants من أسماء → معرّفات
│   ├── migrate-deletedAt.mjs         ← هجرة لمرة واحدة: زرع deletedAt: null في المستندات القديمة
│   └── create-trip.mjs               ← 🆕 v13 ★ إنشاء/تحديث رحلة (trips/{tripId} + tripSecrets/{tripId}) — الطريقة الوحيدة لإضافة رحلة جديدة
├── tailwind.config.js                ← مسارات content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']
├── postcss.config.js                 ← لا تعديل متوقع
├── tsconfig.json                     ← TypeScript strict mode
├── README.md                         ← نظرة عامة وتعليمات التشغيل والنشر
├── public/
│   └── icons/
│       ├── icon-192.png              ← ✅ أيقونة PWA (192×192) — موجودة
│       └── icon-512.png              ← ✅ أيقونة PWA (512×512) — موجودة
└── src/                             ← ★ TypeScript مصدر وحيد (لا توجد نسخ .jsx/.js بعد الآن)
    ├── main.tsx                      ← نقطة الدخول الفعلية (index.html يشير إليها)
    ├── index.css                     ← Tailwind directives + 🆕 v18 overscroll-behavior-y: contain على html/body (يمنع تعارض سحب-التحديث الأصلي للمتصفح مع PullToRefresh)
    ├── App.tsx                       ← ★ منسّق (coordinator): يستدعي الـ hooks، يغلّف بـ DataContext + UIContext، ويحتوي الـ handlers المتبقية وحالة الواجهة (🆕 v12: خفّ حجمه بعد استخراج useExpenseActions/utils/export)
    ├── firebase.ts                   ← ★ تهيئة Firebase — يستخدم initializeFirestore الحديث. 🆕 v13: لم يعد يُصدِّر APP_ID ثابتاً (انظر utils/tripId.ts)
    ├── firestore.ts                  ← ★ مراجع Firestore المشتركة (expensesCol/travelersCol/expenseDoc/travelerDoc/rateLimitDoc/tripConfigDoc) — كلها مبنية على TRIP_ID الديناميكي 🆕 v13
    ├── constants.ts                  ← ★ البيانات الثابتة: مسافرون (INITIAL_TRAVELERS — غير مُستخدَمة فعلياً، انظر ملاحظة أدناه)، بنك (BANK_DETAILS، 🆕 v13 قيمة احتياطية فقط الآن)، عملات، ADMIN_EMAILS، 🆕 EXPENSE_CATEGORIES
    ├── icons.ts                      ← ★ مرجع مركزي لكل الأيقونات (lucide-react) — استورد منه دائماً
    ├── types.ts                      ← ★ كل الأنواع المشتركة (Traveler, Expense, ToastMessage...) — عدّل هنا أولاً
    ├── hooks/                        ← ★ منطق الحالة والتأثيرات مفصول عن App
    │   ├── useAuth.ts                ← ★ مصادقة Anonymous + اشتقاق isAdmin + بوابة رمز الرحلة (needsTripPin/pinCheckLoading/verifyTripPin عبر fetch('/api/verifyTripPin')). 🆕 v13: العضوية عبر trips[TRIP_ID] بدل member العالمي، ومفتاح localStorage خاص بكل رحلة
    │   ├── useExchangeRates.ts       ← جلب أسعار الصرف + بناء CURRENCIES
    │   ├── useExpenses.ts            ← حالة المصاريف + listener فوري (لا يُفعَّل إلا بعد hasAccess — انظر App.tsx). 🆕 v18: يضيف refreshExpenses (عبر getDocsFromServer، لتجاوز الكاش المحلي) لزر Pull-to-Refresh فقط
    │   ├── useTravelers.ts           ← حالة المسافرين + listener (لا يُفعَّل إلا بعد hasAccess). 🆕 v18: يضيف refreshTravelers (getDocsFromServer) لنفس غرض Pull-to-Refresh
    │   ├── useBalances.ts            ← غلاف useMemo حول دوال الحساب النقية
    │   ├── useFilteredExpenses.ts    ← ★ حالة البحث/الفرز + المصاريف المفلترة (مستخرجة من App)
    │   ├── useDebounce.ts            ← 🆕 أداة عامة لتأخير أي قيمة متغيّرة بسرعة (بحث، فلاتر...) — استُخدمت لتأخير searchQuery في useFilteredExpenses
    │   ├── useOnlineStatus.ts        ← 🆕 حالة اتصال الشبكة (online/offline) عبر أحداث window — يغذّي بانر "غير متصل" في App.tsx
    │   ├── useCountdown.ts           ← 🆕 عدّ تنازلي عام بالثواني (self-stopping) — يُستخدم لمهلة إعادة إرسال رابط استرداد كلمة المرور (60 ثانية)
    │   ├── useExpenseActions.ts      ← 🆕 v12 ★ منطق نموذج/عمليات المصروف كاملاً (إضافة/تعديل مع Rate Limiting، حذف ليّن + Undo، استعادة، تبديل المشاركين) — استُخرج من App.tsx. 🆕 v20: يضيف handleQuickAddExpense (وصف+مبلغ فقط، بقية الحقول افتراضية) — مسار منفصل عمداً عن handleAddExpense، لا تدمجهما
    │   ├── useTripConfig.ts          ← 🆕 v13 إعدادات الرحلة النشطة (اسمها/تفاصيل البنك) من مستند trips/{TRIP_ID}؛ يرجع لـ BANK_DETAILS الثابت إن لم يُنشأ المستند بعد
    │   ├── useHeaderCollapse.ts      ← 🆕 v19 يرجع isCollapsed حسب اتجاه التمرير (throttled بـ requestAnimationFrame) — يغذّي طيّ Header
    │   └── index.ts                  ← نقطة استيراد موحّدة للـ hooks (🆕 v19: يُصدِّر useHeaderCollapse أيضاً)
    ├── context/
    │   ├── DataContext.ts            ← ★ DataContext + useData (بيانات للقراءة فقط: travelers/expenses/user/isAdmin/currencies)
    │   └── UIContext.ts              ← ★ UIContext + useUI (حالة النماذج والإجراءات المشتركة، بما فيها openDepositHistory)
    ├── utils/
    │   ├── calculations.ts           ← ★ دوال حساب نقية: calculateBalances/calculateTotalSpent/calculateTotalDeposited/calculateSettlements/calculateCategoryTotals/calculateSpendingTrend + splitEven + 🆕 v14 splitByShares (تقسيم غير متساوٍ)
    │   ├── calculations.test.ts      ← اختبارات Vitest للدوال النقية (بما فيها splitByShares 🆕 v14)
    │   ├── participants.ts           ← ★ مطابقة/عرض المشاركين بالـ id (matchesTraveler/toDisplayNames/toIds)
    │   ├── export.ts                 ← 🆕 v12 exportExpensesToCSV — بُنيت/نزّلت ملف CSV، مستخرجة من App.tsx (كانت exportCSV). 🆕 v14: تعرض حصة كل شخص في عمود المشاركين عند وجود تقسيم مخصّص
    │   └── tripId.ts                 ← 🆕 v13 ★ TRIP_ID — معرّف الرحلة النشطة، من ?trip=xyz في الرابط (افتراضي: travelapp-87206)
    └── components/
        ├── ErrorBoundary.tsx         ← يلتقط أخطاء الرندرة غير المتوقعة ويعرض fallback بدل شاشة بيضاء
        ├── Header.tsx                ← ★ 🆕 v19/v21 قابل للطي (sticky + useHeaderCollapse حسب اتجاه التمرير) — يستقبل stats (HeaderStats | null) ويعرضها كحبّات (pills) ملوّنة بأيقونات دلالية، صفّان عند التوسّع وصفّ واحد يحلّ محل العنوان عند الطيّ. زر وضع المسؤول يحمل title (tooltip) يشرح الغرض منه
        ├── StatBox.tsx               ← ⚠️ 🆕 v21 لم يعد مستورَداً في أي مكان (استُبدل بدمج الإحصائيات داخل Header) — يتيم فعلياً، احذفه يدوياً إن رغبت
        ├── PullToRefresh.tsx         ← 🆕 v18 غلاف إيماءة سحب-للأسفل حول <main> (touch handlers + rubber-band + مؤشر دوّار) — يفرض refreshExpenses/refreshTravelers عبر getDocsFromServer. ⚠️ يطبّق transform:translateY على أبنائه دوماً (حتى عند 0px) — أي position:fixed جديد يجب أن يكون خارج هذا الغلاف
        ├── QuickAddFab.tsx           ← 🆕 v20 زر دائري عائم واحد (bottom-6 end-6) يفتح popover داخلي (Modal + AnimatePresence خاصّان به) لإضافة مصروف سريع (وصف+مبلغ) عبر handleQuickAddExpense — يُركَّب خارج PullToRefresh (نفس سبب position:fixed أعلاه)
        ├── Toast.tsx                 ← 🆕 يعرض زر "تراجع" اختيارياً (ToastMessage.onUndo) بجانب النص — يُستخدم مع الحذف الليّن (Undo)
        ├── Modal.tsx                 ← ★ 🆕 v17 Bottom Sheet (framer-motion): ينزلق من الأسفل على الجوال (drag="y" + dragSnapToOrigin + onDragEnd) ويتحوّل لنافذة مركزية عادية من sm فما فوق. يتطلب الآن onClose إلزامياً، ويجب تغليف أي استخدام مشروط له بـ <AnimatePresence> في نقطة الرندرة (وإلا لا تُشغَّل حركة الخروج). Modal (غلاف) + ConfirmModal (تأكيد الحذف)
        ├── TripGate.tsx              ← ★ شاشة كاملة تمنع الوصول للوحة حتى يُتحقَّق من رمز الرحلة (انظر useAuth.ts)
        ├── OnboardingBanner.tsx      ← ★ شريط ترحيب يظهر مرة واحدة (localStorage) يشرح الأرقام الأساسية ودور وضع المسؤول
        ├── TravelerSection.tsx       ← TravelerCard (زر تعديل الرصيد + زر السجل ★) + AddTravelerForm (يستهلكان useData/useUI)
        ├── ExpenseSection.tsx        ← ★ ExpenseForm + ExpenseListItem — canManage يسمح بالتعديل/الحذف لصاحب المصروف نفسه أو المسؤول. 🆕 v14: زر "تخصيص التقسيم" (غير متساوٍ) بمعاينة حيّة لكل شخص. 🆕 v16: Swipe Actions (سحب يمين=تعديل، يسار=حذف عبر لمس محوري القفل) بديلاً عن أزرار ثابتة؛ على الحاسوب تظهر الأزرار عند hover/focus بدل السحب
        ├── charts/                   ← 🆕 مكوّنات الرسوم البيانية (Recharts)، محمّلة بتكاسل (lazy) كمجموعة واحدة عبر ChartsSection
        │   ├── ChartsSection.tsx     ← 🆕 المُصدَّر الوحيد lazy من App.tsx — يجمّع الرسوم الثلاثة أدناه
        │   ├── SettlementFlowChart.tsx ← 🆕 Sankey: من يدفع لمن لتسوية الحسابات (من calculateSettlements)
        │   ├── CategoryPieChart.tsx  ← 🆕 Pie: توزيع المصاريف حسب الفئة (من calculateCategoryTotals)
        │   └── SpendingTrendChart.tsx ← 🆕 Bar + Line: تطوّر المصاريف عبر الزمن (من calculateSpendingTrend)
        ├── UpdatePrompt.tsx          ← إشعار تحديث الـ PWA
        ├── Misc.tsx                  ← BankDetailsCard (الحساب البنكي فقط)
        └── modals/                   ← نوافذ lazy-loaded منفصلة (★ ضرورية — لا تحذفها)
            ├── AdminSignInModal.tsx  ← ★ تمييز رسائل خطأ تسجيل الدخول حسب كود Firebase + زر "نسيت كلمة المرور؟" (🆕 حالة تحميل + عدّ تنازلي 60 ثانية قبل إعادة الإرسال)
            ├── DepositModal.tsx      ← ★ يتضمن حقل "سبب التعديل" الاختياري (يُحفظ في depositLogs)
            ├── DepositHistoryModal.tsx ← ★ جديد: سجل تدقيق تعديلات رصيد مسافر (مسؤول فقط)، قراءة لمرة واحدة من depositLogs
            ├── TrashBinModal.tsx     ← سلة مهملات: استعادة مصاريف/مسافرين محذوفين حذفاً ليّناً (deletedAt)
            └── ModalFallback.tsx     ← spinner يظهر ريثما يُحمَّل الـ chunk
```

> 🆕 v13 ملاحظة عن `INITIAL_TRAVELERS` في `constants.ts`: هذا الثابت **غير
> مُستخدَم فعلياً في أي مكان بالكود الحالي** (تأكّد بالبحث) — قائمة المسافرين
> تُقرأ بالكامل من Firestore (`travelersCol()`) بلا أي بذر أولي. على الأرجح
> بقايا من مرحلة ما قبل الانتقال الكامل لـ Firestore. لا تعتمد عليه، ولا تحذفه
> دون التأكد أولاً أنه لا يزال غير مستخدم وقت قراءتك لهذا الملف.

---

## سجل التعديلات اليدوية

### v2 — تعديلات المستخدم (آخر تحديث)

**`src/firebase.ts` — ترحيل Offline Persistence للـ API الحديث**
- استُبدلت `enableIndexedDbPersistence` (deprecated) بـ `initializeFirestore` + `persistentLocalCache` + `persistentMultipleTabManager`
- الفائدة: يدعم الآن فتح التطبيق في **عدة تبويبات في نفس الوقت** بدل تبويب واحد فقط
- لا تعُد لـ `enableIndexedDbPersistence` — الـ API القديم سيُحذف في إصدارات Firebase القادمة

```ts
// ✅ الطريقة الصحيحة الحالية
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})
```

**`vite.config.js` — إصلاح تعارض Workbox مع Firebase**
- إضافة `navigateFallbackDenylist: [/^\/__/]` لمنع Workbox من اعتراض مسارات Firebase الداخلية (`/__/auth/...`)
- إضافة قاعدة `NetworkOnly` صريحة لـ `firestore.googleapis.com` قبل القاعدة العامة لـ googleapis — يمنع تعارض الـ Service Worker مع اتصالات Firestore المستمرة (Listen channels)

```ts
// ترتيب القواعد مهم — الأكثر تحديداً أولاً
navigateFallbackDenylist: [/^\/__/],
runtimeCaching: [
  { urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
  { urlPattern: /^https:\/\/.*\.googleapis\.com\//, handler: 'NetworkOnly' },
  // ...
]
```

**`public/icons/`  — أيقونات PWA الفعلية**
- أُضيفت `icon-192.png` و`icon-512.png` — التطبيق يدعم الآن التثبيت على الجوال (Add to Home Screen) بأيقونة حقيقية

---

### v3 — إعادة هيكلة معمارية شاملة

تحوّل المشروع من بنية مزدوجة (نسخ `.jsx` تعمل / نسخ `.tsx` تُفحَص فقط) إلى **TypeScript مصدراً وحيداً**، مع فصل المنطق وتنظيف الملفات. التفاصيل:

**1) فصل الحالة عن `App.tsx` إلى hooks**
- استُخرجت كل الحالة والتأثيرات إلى `src/hooks/`: `useAuth`, `useExchangeRates`, `useExpenses`, `useTravelers`, `useBalances`.
- `App.tsx` صار منسّقاً (coordinator): يستدعي الـ hooks ويحتفظ بالـ handlers وحالة النماذج/الواجهة فقط.
- `isSyncing`/`syncError` تبقى مملوكة لـ `App` وتُمرَّر setters لها إلى `useExpenses`/`useTravelers` (دوال ثابتة، فلا إعادة اشتراك في الـ listeners).
- أُضيف `src/firestore.ts` كمصدر واحد لمسارات Firestore يستخدمه الـ hooks و`App` معاً.

**2) اعتماد TypeScript مصدراً وحيداً**
- `index.html` صار يشير إلى `/src/main.tsx` بدل `/src/main.jsx`.
- أُضيف `resolve.extensions: ['.tsx','.ts','.jsx','.js','.mjs','.json']` لإعطاء الأولوية لملفات TS عند الاستيراد بدون امتداد.
- إعداد Vite موحّد في ملف واحد `vite.config.js` (حُذفت نسخة `.ts` المكررة التي كانت ناقصة إصلاحات Firebase). أي تعديل مستقبلي على إعداد Vite يكون في `vite.config.js`.

**3) حذف الملفات المهملة**
- حُذفت كل نسخ `.jsx`/`.js` الظِّل داخل `src/`، وكل النسخ المكررة في جذر المشروع (٤٧ ملفاً إجمالاً). المصدر الفعلي صار في `src/` فقط.

**4) `src/components/modals/`**
- استُعيد المجلد بعد حذفه بالخطأ أثناء التنظيف — كان غيابه يكسر الـ lazy imports في `App.tsx`.
- ❌ لا تحذف هذا المجلد: `AdminSignInModal`/`DepositModal`/`ModalFallback` ضرورية ومحمّلة عمداً بـ `lazy()`.

**5) إصلاح Tailwind**
- بعد حذف نسخ `.jsx`، فقد Tailwind ما يفحصه فاختفى التصميم (CSS شبه فارغ).
- صُحّح `content` في `tailwind.config.js` إلى `['./index.html', './src/**/*.{js,jsx,ts,tsx}']`. عند إضافة امتدادات ملفات جديدة، حدّث هذا المسار.

**6) `AppContext` للبيانات المشتركة**
- أُضيف `src/context/AppContext.ts` يوفّر البيانات والإجراءات المشتركة عبر `<AppContext.Provider>` المُغلِّف لـ render في `App.tsx`.
- `TravelerCard`/`AddTravelerForm`/`ExpenseForm`/`ExpenseListItem` تقرأ القيم المشتركة بـ `useAppContext()`، وتبقى props الخاصة بكل عنصر (`traveler`/`expense`) لأنها مشتقة من `map`.
- ملاحظة أداء: قيمة السياق تُبنى كائناً جديداً في كل render (نفس سلوك props السابق، لا تراجع). تحسينها لاحقاً يحتاج تقسيم السياق + `useMemo`/`useCallback`.

**7) فصل الحسابات إلى دوال نقية**
- أُضيف `src/utils/calculations.ts`: `calculateBalances`/`calculateTotalSpent`/`calculateTotalDeposited` — نقية بلا أي تبعية لـ React، قابلة للاختبار الوحدوي.
- `useBalances` صار غلافاً رفيعاً يستدعيها داخل `useMemo`.

---

### v4 — أمان واختبارات ومتانة بيانات وتنظيف

**1) قواعد Firestore (`firestore.rules`)**
- أُضيف ملف `firestore.rules` كمصدر رسمي للقواعد + `firebase.json` و`.firebaserc` لنشرها بـ CLI.
- الإنشاء صار مقيّداً بتحقّق من صحة الحقول (`isValidExpense`/`isValidTraveler`): الأنواع، الأطوال، القيم الموجبة، ومنع الحقول الزائدة عبر `hasOnly`. التعديل/الحذف للمسؤول فقط.

**2) اختبارات Vitest**
- أُضيف `vitest` + أمرا `npm test`/`npm run test:watch` + `vitest.config.ts` + `src/utils/calculations.test.ts` (يغطّي القسمة، التراكم، الحالات الحدّية، ودقّة المجاميع).

**3) متانة البيانات**
- `handleAddExpense` صار يستخدم `addDoc(expensesCol(), …)` للمصاريف الجديدة (معرّف يولّده Firestore) بدل `String(Date.now())` — يمنع تصادم المعرّفات عند الإضافة المتزامنة. التعديل ما زال `setDoc(expenseDoc(id), …)`.
- ⚠️ صار معرّف المصروف سلسلة عشوائية من Firestore (لا طابعاً زمنياً) — لا تعتمد على المعرّف للترتيب؛ الترتيب دائماً عبر `createdAt`.
- `calculateBalances` يستخدم `splitEven()` التي تقسّم بالهللات وتوزّع الباقي على الأوائل، فتتجمّع حصص المشاركين بدقّة = مبلغ المصروف (لا فروق تقريب).

**4) تنظيف الإعداد**
- حُذف `vite.config.ts` المكرر (كان ناقصاً إصلاحات Firebase) — الإعداد موحّد في `vite.config.js`.
- `README.txt` استُبدل بـ `README.md` حقيقي.
- وُسّع `.gitignore` (node_modules، dist، .DS_Store، .env…).

---

### v5 — الربط بالـ id + أدوات الجودة

**1) ربط المشاركين بالـ id بدل shortName**
- `Expense.participants` صار `Array<number | string>`: معرّفات رقمية (`Traveler.id`) مع قبول الأسماء المختصرة القديمة مؤقتاً للتوافق الخلفي. `ExpenseFormData.participants` صار `number[]`.
- أُضيف `src/utils/participants.ts`: `matchesTraveler` (مطابقة id أو اسم قديم)، `toDisplayNames` (عرض)، `toIds` (تطبيع عند التحرير).
- `calculateBalances` يطابق عبر `matchesTraveler`؛ النموذج والقائمة والبحث وتصدير CSV تعرض الأسماء عبر `toDisplayNames`. صار تغيير `shortName` آمناً.
- **هجرة بيانات لمرة واحدة:** `scripts/migrate-participants.mjs` يحوّل المصاريف القائمة (وضع معاينة افتراضي؛ خُذ نسخة احتياطية أولاً). الكود يعمل مع البيانات القديمة حتى قبل تشغيلها.

**2) ESLint + Prettier + CI**
- `.eslintrc.cjs` (قواعد منطقية فقط، بلا قواعد تنسيق تصطدم بالمحاذاة) + `npm run lint`.
- `.prettierrc` + `.prettierignore` + `npm run format` (لا يُشغَّل آلياً — يشغّله المطوّر؛ سيزيل محاذاة الأعمدة اليدوية).
- `.github/workflows/ci.yml` يشغّل typecheck/test/build عند كل push (lint إعلامي). ⚠️ يتطلّب `npm ci` تطابق `package-lock.json` — شغّل `npm install` واحفظ الـ lock.

---

### v6 — تعديلات المستخدم اليدوية (تقسيم السياق + استخراج hook + Git/CI)

تعديلات أجراها المستخدم يدوياً واكتُشِفت من مقارنة الملفات:

**1) تقسيم `AppContext` إلى سياقين (تحسين أداء/فصل اهتمامات)**
- حُذف `src/context/AppContext.ts` واستُبدل بـ:
  - `src/context/DataContext.ts` → `DataContext` + `useData()`: بيانات **للقراءة فقط** (`travelers`, `expenses`, `user`, `isAdmin`, `currencies`, `ratesUpdatedAt`).
  - `src/context/UIContext.ts` → `UIContext` + `useUI()`: حالة النماذج والإجراءات (نموذج المصروف، إضافة مسافر، الإيداع، التبديلات…).
- `App.tsx` يغلّف الـ render بـ `<DataContext.Provider>` + `<UIContext.Provider>`، والمكوّنات الورقية تقرأ بـ `useData()`/`useUI()` بدل `useAppContext()`.
- الفائدة: المكوّنات التي تحتاج البيانات فقط لا يُعاد رسمها عند تغيّر حالة النماذج، والعكس — تقليل إعادة الرسم غير الضروري.

**2) استخراج `useFilteredExpenses`**
- نُقل منطق البحث/الفرز والـ `useMemo` من `App.tsx` إلى `src/hooks/useFilteredExpenses.ts` (يملك `searchQuery`/`sortOrder` ويُرجِع `filteredExpenses`). مُصدَّر من `hooks/index.ts`.

**3) إدارة الإصدارات والنشر**
- المشروع صار تحت **Git** (`git init`)، وأُضيف فعلياً `.github/workflows/ci.yml`.
- وجود `firebase-debug.log` يشير إلى استخدام Firebase CLI (نشر القواعد على الأرجح).
- اكتمل التنظيف: حُذف `vite.config.ts` و`README.txt`.

> ملاحظة: عند التعديل التزِم بالفصل الجديد — البيانات للقراءة من `useData()`،
> والنماذج/الإجراءات من `useUI()`. لا تُعِد دمج السياقين.

---

### v7 — اكتمال تحسين الأداء + إصلاح حارس حذف المسافر

**1) منع إعادة الرسم غير الضروري (مكتمل)**
- قيمتا السياق في `App.tsx` مُغلّفتان بـ `useMemo` (`dataContextValue`/`uiContextValue`)، وكل الـ handlers بـ `useCallback`.
- المكوّنات المستهلكة مُغلّفة بـ `React.memo`: `TravelerCard`, `AddTravelerForm`, `ExpenseForm`, `ExpenseListItem`.
- النتيجة: الكتابة في البحث (حالته في `useFilteredExpenses`) لا تُعيد رسم بطاقات المسافرين أو النماذج. ⚠️ القطعتان ضروريتان معاً: تثبيت قيمة السياق **و** `React.memo` على المستهلك — أيٌّ منهما وحده لا يكفي.
- قائمة المصاريف افتراضية عبر `react-virtuoso` (تأكّد من وجوده في `dependencies`).

**2) إصلاح: حارس حذف المسافر كان معطّلاً**
- في `TravelerCard`، كان `hasExpenses` يطابق `traveler.shortName` داخل `participants` — لكنها صارت معرّفات رقمية بعد هجرة v5، فكان يُرجِع `false` دائماً ويسمح بحذف مسافر له مصاريف.
- صُحّح إلى `expenses.some(e => e.participants.some(p => matchesTraveler(traveler, p)))` (يدعم المعرّفات والأسماء القديمة).
- ⚠️ درس عام: بعد هجرة `id` راجِع **كل** مطابقة على `participants` لتمرّ عبر `matchesTraveler` لا عبر مقارنة نصية مباشرة.

---

### v8 — بوابة أمان رمز الرحلة + ملكية المصاريف + تحسينات تجربة المسؤول + سجل تدقيق الودائع

هذا الإصدار يحوّل التطبيق من "أي أحد يعرف الرابط يدخل" إلى **رحلة خاصة تتطلب رمزاً مشتركاً**، ويضيف عدة تحسينات اكتُشِفت من تقرير تحليل رحلة المستخدم (CX). التفاصيل:

**1) بوابة رمز الرحلة (Trip PIN) — أهم تغيير أمني في المشروع**
- `functions/index.js` (جديد): Cloud Function قابلة للاستدعاء `verifyTripPin` (Firebase Functions v2، `onCall`) تتحقق خادميًا من رمز رحلة مشترك مُخزَّن في **Secret Manager** (`TRIP_PIN`، عبر `defineSecret` — لا يُخزَّن الرمز في الكود ولا في git إطلاقاً). عند تطابق الرمز، تمنح المستخدم الحالي (حتى لو Anonymous) **Custom Claim** باسم `member: true`.
- ⚠️ الرمز يُقارَن بعد `.trim()` على الطرفين (خادم وعميل) لتفادي فروق مسافات بيضاء خفية.
- ⚠️ **الأسرار (Secrets) لا تُطبَّق تلقائياً على أحدث نسخة:** أي `firebase functions:secrets:set TRIP_PIN` جديد يتطلب `firebase deploy --only functions` بعده وإلا تبقى الدالة تستخدم النسخة القديمة من السر.
- `firestore.rules`: أُضيفت `isMember()` (تتحقق من `request.auth.token.member == true`)، وصار الوصول للقراءة/الإنشاء في `expenses`/`travelers` يتطلب `isMember() || isAdmin()` بدل `isSignedIn()` وحدها.
- `src/components/TripGate.tsx` (جديد): شاشة كاملة (وليست Modal) تُعرض بدل اللوحة الرئيسية للمستخدم غير المتحقَّق منه، تطلب إدخال الرمز.
- `src/hooks/useAuth.ts`: أُعيدت هيكلته بالكامل ليدير حالة `needsTripPin`/`pinCheckLoading`/`pinError`، ويحاول أولاً رمزاً مخزَّناً محلياً (`localStorage`) عند كل تحميل قبل إظهار `TripGate`.
- **مشكلة 401 Unauthorized حرجة اكتُشِفت ثم حُلَّت:** عند استدعاء الدالة عبر `httpsCallable` من Firebase SDK مباشرة (نطاق مختلف: `cloudfunctions.net`)، كان المتصفح **يُسقِط ترويسة `Authorization` فعلياً من الطلب الفعلي** (رغم أن الـ CORS preflight يُصرِّح بإرسالها) — تم تأكيد هذا عبر HAR export كامل من DevTools. **الحل:** إضافة `vercel.json` (جديد) يعيد توجيه `/api/verifyTripPin` (نفس الأصل/same-origin) إلى رابط الدالة الحقيقي عبر Vercel rewrite، مع إعادة كتابة `callVerify` في `useAuth.ts` لاستخدام `fetch()` مباشرة مع إرفاق `Authorization: Bearer <idToken>` يدوياً بدل `httpsCallable`. **راجع القسم الجديد "Cloud Functions ونشرها" أدناه للتفاصيل الكاملة — هذا الترتيب (Vercel rewrite + fetch يدوي) إلزامي ولا يجوز التراجع عنه لاستدعاء cloudfunctions.net مباشرة من العميل.**
- **إصلاح سباق Firestore listeners:** كانت `useExpenses`/`useTravelers` تُفعِّل `onSnapshot` فور توفر `user` (أي فور تسجيل الدخول المجهول)، أي **قبل** التحقق من رمز الرحلة — ما يسبب `permission-denied` فوري لا يزول تلقائياً حتى بعد نجاح التحقق لاحقاً. **الإصلاح:** في `App.tsx`، `hasAccess = isAdmin || (!pinCheckLoading && !needsTripPin)`، ويُمرَّر `hasAccess ? user : null` للـ hooks بدل `user` مباشرة (لا يخالف Rules of Hooks — الـ hooks تُستدعى دوماً، فقط قيمة `user` المُمرَّرة تتغيّر).

**2) ملكية المصاريف — تعديل/حذف ذاتي بدون صلاحية مسؤول**
- `src/types.ts`: حقل `createdByUid?: string` جديد في `Expense` (اختياري — المصاريف القديمة بدونه).
- `App.tsx` (`handleAddExpense`): يُسجَّل `createdByUid` عند الإنشاء (`user?.uid`)، ويُحافَظ عليه دون تغيير عند التعديل.
- `firestore.rules`: دالة جديدة `isExpenseOwner(existing)` تسمح للعضو صاحب `createdByUid` بتعديل/حذف (Soft Delete) مصروفه فقط، مع اشتراط `request.resource.data.createdByUid == resource.data.createdByUid` (يمنع انتحال/تحويل الملكية أثناء التعديل). لا حد زمني.
- `src/components/ExpenseSection.tsx`: `canManage = isAdmin || (createdByUid === user.uid)` يتحكم بظهور أزرار التعديل/الحذف بدل الاعتماد على `isAdmin` وحده.

**3) تحسينات تجربة وضع المسؤول**
- `src/components/Header.tsx`: زر تفعيل/تسجيل خروج وضع المسؤول صار يحمل `title` (tooltip) يشرح الغرض منه.
- استعادة كلمة مرور داخل التطبيق: `App.tsx` (`handleForgotPassword`) يستدعي `sendPasswordResetEmail` من `firebase/auth`، ويعرض رسالة نجاح عامة دائماً (لا يكشف عن وجود الحساب من عدمه). زر "نسيت كلمة المرور؟" جديد في `AdminSignInModal.tsx`.
- تمييز رسائل خطأ تسجيل الدخول: `handleAdminSignIn` في `App.tsx` صار يفرّق حسب كود خطأ Firebase (`auth/invalid-email`, `auth/user-disabled`, `auth/too-many-requests`, `auth/network-request-failed`) بدل رسالة عامة واحدة لكل الحالات.
- `src/components/OnboardingBanner.tsx` (جديد): شريط ترحيب يظهر مرة واحدة فقط لكل جهاز (`localStorage`) يشرح معنى "الدفع المسبق"/"المتبقي" ودور وضع المسؤول.

**4) سجل تدقيق تعديلات الودائع (Deposit Audit Log)**
- مجموعة فرعية جديدة **غير قابلة للتعديل أو الحذف** (immutable): `travelers/{id}/depositLogs/{logId}`.
- `App.tsx` (`handleAddDeposit`): يستخدم `writeBatch(db)` لكتابة تحديث الرصيد + سجل التدقيق **ذرياً** (Atomic) في عملية واحدة، بدل تحديث الرصيد فقط. السجل يتضمن `previousDeposited`/`newDeposited`/`delta`/`mode`/`reason` (اختياري)/`changedByEmail`/`changedByUid`/`createdAt`.
- `src/components/modals/DepositModal.tsx`: حقل نصي اختياري جديد "سبب التعديل" (حتى 300 حرف).
- `src/components/modals/DepositHistoryModal.tsx` (جديد): مرئي للمسؤول فقط، يعرض سجل التعديلات كاملاً (قراءة لمرة واحدة، لا يحتاج تحديثاً فورياً).
- `firestore.rules`: `isValidDepositLog()` + قواعد `depositLogs` (`allow read/create: if isAdmin()`، و`allow update, delete: if false` نهائياً — سجل تدقيق حقيقي لا يمكن التلاعب به بعد إنشائه). `changedByUid` يجب أن يطابق `request.auth.uid` لمنع انتحال الهوية.

> ⚠️ **الحالة المتوقفة مؤقتاً:** "لا ربط فعلي بين التحويل البنكي والتطبيق" (تأكيد وصول التحويل يدوي بالكامل) — نوقشت الخيارات (طلب تأكيد كامل بمراجعة المسؤول مقابل تذكير بسيط بدون موافقة) لكن لم يُتَّخذ قرار بعد. راجع نقاش الخيارات قبل أي تنفيذ.

---

### v9 — تصوّر بياني للأرصدة (Recharts) + فئة المصروف

**1) فئة المصروف**
- `src/constants.ts`: ثابت جديد `EXPENSE_CATEGORIES` (مواصلات/طعام وشراب/إقامة/أنشطة وترفيه/تسوق/أخرى — "أخرى" آخر عنصر عمداً، تصنيف افتراضي للمصاريف القديمة بلا فئة محفوظة).
- `src/types.ts`: `Expense.category?: string` (اختياري)، وحقل `category: string` إلزامي في `ExpenseFormData` (له قيمة افتراضية دائماً في النموذج).
- `ExpenseSection.tsx`: قائمة اختيار الفئة في `ExpenseForm`، وشارة الفئة في `ExpenseListItem`.
- `firestore.rules`: `isValidExpense` يسمح بحقل `category` اختياري (نص، حتى 50 حرفاً).

**2) رسوم بيانية — `src/components/charts/` (جديد، محمّل بتكاسل بالكامل)**
- `package.json`: أُضيفت تبعية `recharts`. ⚠️ **لا تنسَ `npm install`** بعد سحب هذا التحديث — تعديل `package.json` وحده لا يُثبّت الحزمة فعلياً (سبب شائع لأخطاء `Cannot find module 'recharts'` من `tsc`).
- `utils/calculations.ts`: دوال مشتقة جديدة نقية بلا أي تبعية Firestore: `calculateSettlements` (تسوية مبسّطة Debt Simplification بخوارزمية جشعة/Greedy — تحويلات **مقترحة** فقط، ليست بنكية فعلية)، `calculateCategoryTotals`، `calculateSpendingTrend`.
- `ChartsSection.tsx` هو المُصدَّر الوحيد `lazy()` من `App.tsx` (تبعية Recharts كبيرة نسبياً، لا داعي لتضمينها بالحزمة الرئيسية) ويجمّع: `SettlementFlowChart` (Sankey)، `CategoryPieChart` (Pie)، `SpendingTrendChart` (Bar + Line).
- لا تظهر الرسوم أثناء التحميل الأول (Skeleton) ولا إن لم يوجد أي مصروف بعد (رصد فارغ لا فائدة منه).

---

### v10 — بحث مؤجَّل (Debounce) + تراجع عن الحذف (Undo) + بانر عدم الاتصال + تحسين استرداد كلمة المرور

**1) `useDebounce` — تأخير البحث**
- `src/hooks/useDebounce.ts` (جديد): `useDebounce<T>(value: T, delayMs: number): T` عام وقابل لإعادة الاستخدام.
- `useFilteredExpenses.ts`: `filteredExpenses` كان يُعاد حسابه فوراً عند كل حرف بالبحث — أُصلح بتأخير القيمة المستخدمة في الحساب فقط (300ms) بينما تبقى حالة حقل الإدخال نفسه فورية (لا تأخير مرئي على الكتابة).

**2) Undo للحذف الليّن (مصاريف ومسافرين)**
- `src/types.ts`: `ToastMessage.onUndo?: () => void` — عند وجودها، `Toast.tsx` يعرض زر "تراجع" بجانب النص.
- `App.tsx` وقتها (لاحقاً `useExpenseActions.ts` بعد v12): `confirmDelete`/`confirmDeleteTraveler` يعرضان توست 5 ثوانٍ (بدل 2.5 الافتراضية) مع `onUndo` يستدعي `handleRestoreExpense`/`handleRestoreTraveler` مباشرة — يقلّل خطأ الحذف بالخطأ دون فتح سلة المهملات.
- ⚠️ **إصلاح سباق توست:** أُضيف `toastTimeoutRef` في `App.tsx` — `showToast` يمسح المؤقّت السابق (`clearTimeout`) قبل جدولة مؤقّت جديد، لمنع توست بمهلة قصيرة سابقة من إخفاء توست تراجع لاحق (5 ثوانٍ) قبل أوانه.

**3) بانر "غير متصل" (بدل Workbox BackgroundSync)**
- طُلب ابتداءً تنفيذ Workbox `BackgroundSync`، لكن تبيّن أنه **غير مناسب/خطر هنا**: التخزين والإرسال التلقائي عند استعادة الاتصال مُنفَّذ أصلاً عبر `persistentLocalCache` في `firebase.ts` (طابور Firestore الداخلي)، و`vite.config.js` يتعمّد تعطيل Workbox (`NetworkOnly`) لطلبات Firebase تحديداً لتفادي تعارض الاثنين. تنفيذ BackgroundSync فوقه كان سيتعارض معه.
- `src/hooks/useOnlineStatus.ts` (جديد): `useOnlineStatus(): boolean` عبر أحداث `online`/`offline`.
- `App.tsx`: بانر تنبيه عام (كهرماني) يظهر طوال فترة الانقطاع فقط، يطمئن المستخدم أن التخزين تلقائي بالفعل (لا حاجة لأي عمل إضافي منه).
- ❌ **لا تنفّذ Workbox BackgroundSync فوق Firestore's persistentLocalCache** — تعارض مباشر مع طابور الكتابة الداخلي.

**4) تحسين UX لاسترداد كلمة المرور**
- `App.tsx`: حالة جديدة `isSendingResetEmail`/`resetCooldownUntil` + `src/hooks/useCountdown.ts` (جديد، عام: `useCountdown(targetTimestamp): number`، عدّ تنازلي ذاتي الإيقاف) لحساب `resetCooldownSeconds`.
- `AdminSignInModal.tsx`: زر "نسيت كلمة المرور؟" يعرض الآن ثلاث حالات: عادي / "جارٍ الإرسال..." (مع سبينر) / `"أعد المحاولة خلال N ثانية"` — `disabled` طوال الإرسال وخلال مهلة 60 ثانية بعده، يمنع الإرسال المتكرر وإرهاق حدود Firebase/صندوق بريد المستخدم.

---

### v11 — حد المعدّل على إضافة المصاريف (Rate Limiting)

يمنع إساءة استخدام بسيطة (سبام/حلقة سكربت) دون التأثير على الاستخدام العادي.

- `firestore.ts`: `rateLimitDoc(uid)` جديد → `.../rateLimits/{uid}`.
- `firestore.rules`: مستند `rateLimits/{uid}` يخزّن `lastExpenseCreatedAt` لآخر مصروف أضافه كل مستخدم (غير المسؤول). دالة `withinExpenseRateLimit()` تقرأ القيمة السابقة عبر `get()` (تعكس حالة القاعدة **قبل** العملية الحالية حتى ضمن نفس الـ batch) وتقارنها بـ `request.time` — حد: مصروف واحد كل ثانية. `isValidRateLimitWrite()` يتحقق أن القيمة المكتوبة قريبة من `request.time` الفعلي (±5 ثوانٍ) لمنع كتابة قيمة مزيّفة للتحايل. `allow create` على `expenses` صار يتطلب `isAdmin() || (isMember() && withinExpenseRateLimit())` (المسؤول معفى).
- `useExpenseActions.ts` (كان `App.tsx` وقتها): `handleAddExpense` يكتب المصروف الجديد + تحديث `rateLimits/{uid}` بـ`writeBatch` واحد ذرّي (فشل أحدهما = فشل الاثنين). `lastExpenseCreateAtRef` (ref محلي، فحص UX فوري فقط — الفرض الحقيقي في القواعد لا هنا) يعرض رسالة صديقة فورية دون انتظار رفض الخادم.
- ⚠️ حد المعدّل الفعلي مصدره **القواعد فقط**؛ أي فحص عميل (ref محلي) قابل للتجاوز بسهولة من أي عميل يستدعي Firestore SDK مباشرة — لا تعتمد عليه للأمان.

---

### v12 — تقليل حجم `App.tsx` (استخراج useExpenseActions + utils/export)

- `src/hooks/useExpenseActions.ts` (جديد): يجمّع **كل** منطق نموذج/عمليات المصروف (فتح/إلغاء النموذج، `handleAddExpense` بكامل تعقيده — Optimistic Update + Rate Limiting batch، `startEditExpense`، حذف ليّن مع Undo، استعادة، تبديل المشاركين) — استُخرج حرفياً دون أي تغيير سلوك.
- `src/utils/export.ts` (جديد): `exportExpensesToCSV(expenses, travelers)` — دالة بحتة (بلا React) لبناء/تنزيل CSV، مستخرجة من `exportCSV` القديمة في `App.tsx`.
- `App.tsx`: 857 → 633 سطراً. لم يعُد يستورد `expensesCol`/`expenseDoc`/`rateLimitDoc`/`EXPENSE_CATEGORIES` مباشرة (انتقلت لـ`useExpenseActions.ts`).
- النطاق وُسِّع عمداً عن الطلب الأصلي (كان `exportCSV`/`handleAddExpense`/`handleUpdateExpense` فقط) ليشمل **كل** مجموعة handlers المصروف المترابطة معاً (تعديل/حذف/استعادة/تبديل مشاركين) بدل استخراج دالتين فقط وترك الباقي مبعثراً.
- > عند إضافة منطق جديد يخص "عمليات المصروف" (لا نموذج/عرضه)، ضَعه في `useExpenseActions.ts` لا في `App.tsx`.

---

### v13 — دعم رحلات متعددة (Multi-Trip Support)

**أهم تغيير معماري في المشروع** — يحوّل التطبيق من نسخة واحدة مرتبطة بمعرّف رحلة ثابت (`travelapp-87206`) إلى دعم عدد غير محدود من الرحلات المستقلة تماماً في نفس مشروع Firebase الواحد.

**1) تحديد الرحلة النشطة — Query Param**
- `src/utils/tripId.ts` (جديد): `TRIP_ID` يُحسب مرة واحدة عند تحميل الصفحة من `?trip=xyz` في الرابط (يُتحقّق من الصيغة: إنجليزي/أرقام/`-`/`_` فقط، 1-64 حرفاً — `TRIP_ID_PATTERN`، يجب أن يطابق تماماً نفس الفحص في `functions/index.js`). بلا معامل → `DEFAULT_TRIP_ID = 'travelapp-87206'` (يُبقي الرابط الحالي يعمل دون انقطاع).
- اختير Query Param (بدل subdomain أو مسار في الرابط) لأنه لا يتطلب أي DNS/إعداد استضافة إضافي، ويكفي مشاركة رابط مختلف `؟trip=tripId` لكل رحلة فوراً.
- `firebase.ts`/`firestore.ts`: `APP_ID` الثابت أُزيل بالكامل — كل مسارات Firestore (`expensesCol`/`travelersCol`/.../`rateLimitDoc`) تُبنى الآن على `TRIP_ID` من `utils/tripId.ts`.

**2) عضوية خاصة بكل رحلة — Custom Claim `trips` بدل `member` العالمي**
- ⚠️ **هذا التغيير ضروري أمنياً، لا اختياري:** لو بقيت العضوية علماً عالمياً (`member: true`) مع تعميم مسار Firestore إلى `/artifacts/{appId}/...`، لكان أي عضو في **أي** رحلة يقدر يقرأ/يكتب بيانات **كل** الرحلات الأخرى بمجرد تغيير `?trip=` في الرابط.
- `functions/index.js` (`verifyTripPin`): يستقبل الآن `{ tripId, pin }` بدل `{ pin }` فقط. عند النجاح: `admin.auth().setCustomUserClaims(uid, { ...existingClaims, trips: { ...existingTrips, [tripId]: true } })` — **يدمج** مع أي رحلات سابقة (لا يستبدل الـ claims بالكامل، `setCustomUserClaims` يستبدل كل القيمة افتراضياً فلازم قراءة `userRecord.customClaims` أولاً ودمجها يدوياً).
- `firestore.rules`: `isMember(appId)` يتحقق من `appId in request.auth.token.trips && request.auth.token.trips[appId] == true` — تحقق **صريح** من مفتاح appId المحدد داخل الخريطة، لا وجود مفتاح عشوائي فيها.
- `useAuth.ts`: يرسل `tripId: TRIP_ID` مع كل طلب تحقق، ويفحص `tokenResult.claims.trips?.[TRIP_ID] === true`. مفتاح تخزين الرمز محلياً (`localStorage`) صار خاصاً بكل رحلة: `` `travelapp_trip_pin_${TRIP_ID}` `` بدل مفتاح عالمي واحد.
- ⚠️ **أثر على النشر:** عضوية المستخدمين القديمة (`member: true`) لم تعد صالحة بعد نشر هذا التحديث — كل الأعضاء الحاليين (غير المسؤول) يحتاجون إعادة إدخال رمز الرحلة **مرة واحدة فقط**. هذا متوقع وطبيعي، وليس خللاً.

**3) رمز PIN لكل رحلة — Firestore بدل Secret Manager عالمي**
- `functions/index.js`: لم يعد يستخدم `defineSecret('TRIP_PIN')` من Secret Manager. بدلاً منه، كل رحلة تخزّن `{ salt, pinHash }` (SHA-256 مع ملح عشوائي، **لا نص صريح أبداً**) في مستند `tripSecrets/{tripId}` — تُقرأ عبر `admin.firestore()` (Admin SDK، يتجاوز قواعد الأمان). مقارنة الهاش المُدخَل بالمخزَّن تتم بدالة `crypto.timingSafeEqual` (مقاومة لهجوم قياس التوقيت).
- الفائدة: **إضافة رحلة جديدة لا تتطلب أي `firebase deploy --only functions`** — فقط تشغيل `scripts/create-trip.mjs` (كتابة Firestore مباشرة).
- `firestore.rules`: `match /tripSecrets/{tripId} { allow read, write: if false; }` — ممنوع الوصول من العميل نهائياً تحت أي ظرف؛ الوصول الوحيد عبر Admin SDK من الدالة (يتجاوز القواعد أصلاً).
- ⚠️ نفس رسالة الخطأ العامة ("رمز الرحلة غير صحيح") سواء كانت الرحلة غير موجودة أصلاً أو الرمز خاطئاً فقط — يمنع تسريب معلومة عن وجود/عدم وجود tripId معيّن لمن يجرّب تخمين معرّفات عشوائية.

**4) بيانات الرحلة (الاسم + تفاصيل البنك) — Firestore بدل ثابت بالكود**
- `firestore.ts`: `tripConfigDoc()` جديد → مستند `trips/{TRIP_ID}` (اسم الرحلة + `bankDetails`). `firestore.rules`: `allow read: if isMember(tripId) || isAdmin(); allow write: if false;` (لا كتابة من العميل إطلاقاً — فقط عبر `scripts/create-trip.mjs`).
- `src/hooks/useTripConfig.ts` (جديد): يقرأ هذا المستند مرة واحدة (`getDoc`، ليس `onSnapshot` — إعدادات نادراً ما تتغيّر) بنفس نمط `hasAccess ? user : null` المُستخدَم مع `useTravelers`/`useExpenses`. **يرجع دفاعياً لـ `BANK_DETAILS` الثابت في `constants.ts`** إن لم يكن المستند موجوداً بعد (رحلة لم تُهيَّأ بـ `create-trip.mjs`) أو عند أي خطأ قراءة — لا يكسر الشاشة الرئيسية أبداً.
- `App.tsx`: `bankDetails` من `useTripConfig` بدل `BANK_DETAILS` الثابت المستورد مباشرة.
- ملاحظة: `INITIAL_TRAVELERS` **لم** يُنقَل لأنه أصلاً غير مُستخدَم في أي مكان بالكود الفعلي (انظر ملاحظة `constants.ts` في هيكل المشروع أعلاه) — كل رحلة جديدة تبدأ بلا مسافرين، يُضافون يدوياً من واجهة المسؤول.

**5) `scripts/create-trip.mjs` (جديد) — الأداة الوحيدة لإدارة الرحلات**
- سكربت تفاعلي (نفس نمط `migrate-*.mjs`: Admin SDK + `serviceAccountKey.json`) يسأل عن: معرّف الرحلة، اسمها، اسم البنك، المستفيد، الآيبان، رمز PIN — ثم يكتب `trips/{tripId}` و`tripSecrets/{tripId}` (هاش + ملح عشوائي جديد، لا يُخزَّن الرمز الصريح أبداً ولا يُطبَع مرة ثانية بعد الإنشاء).
- ⚠️ **خطوة إلزامية عند النشر لأول مرة بعد هذا التحديث:** شغّل هذا السكربت مرة واحدة للرحلة الافتراضية الحالية (`travelapp-87206`) بنفس رمزها الحالي (الذي كان في `TRIP_PIN` Secret Manager سابقاً) **قبل** نشر `firestore.rules` الجديدة — وإلا يُرفض تحقق الجميع من رمز الرحلة الحالية فور النشر.
- لإضافة رحلة جديدة لاحقاً: نفس السكربت بمعرّف مختلف، ثم شارك رابط `?trip=المعرّف_الجديد` مع أعضاء تلك الرحلة فقط.

---

### v14 — تقسيم غير متساوٍ للمصاريف (حصص/أوزان)

قبل هذا التحديث: `splitEven()` فقط (تقسيم بالتساوي التام، لا استثناء). صار ممكناً الآن أن يدفع شخص حصة مضاعفة أو مختلفة عن الباقين، مع إبقاء التقسيم بالتساوي هو **الافتراضي دائماً** وعدم تعقيد الواجهة للاستخدام العادي.

**الآلية المُختارة: وزن/حصة رقمية لكل شخص (بدل الاختيار بين "ضعف" أو "نسبة مئوية" كخيارين منفصلين)**
- وزن 1 (افتراضي) = حصة عادية، وزن 2 = ضعف الحصة، وزن 0.5 = نصف حصة، وهكذا — تغطي أي نسبة مطلوبة برقم واحد بدل شرطين منفصلين بواجهتين مختلفتين.

**1) نموذج البيانات (بدون أي حاجة لترحيل بيانات قديمة)**
- `types.ts`: `Expense.shares?: Record<string, number>` اختياري تماماً — **غيابه بالكامل = تقسيم بالتساوي التام كما كان قبل هذا التحديث حرفياً**؛ كل المصاريف القديمة تستمر تعمل بلا أي تغيير أو سكربت هجرة. المفتاح نص (كـ`String(participantId)`) لأن مفاتيح خرائط Firestore نصوص دائماً. `ExpenseFormData` يضيف `splitMode: 'equal' | 'custom'` و`shares: Record<number, number>` (يُهمَل تماماً عند الحفظ بوضع `'equal'`).

**2) الحساب — `utils/calculations.ts`: `splitByShares`**
- تعمل بالهللات (أعداد صحيحة) كـ `splitEven` تماماً، وتوزّع باقي الهللات بطريقة "أكبر كسر متبقٍ" (Largest Remainder) بدل محاباة نفس المشارك دائماً.
- **مطابقة تماماً لـ `splitEven`** عند غياب `shares` أو كونها فارغة — لا فرع منطقي إضافي في بقية الكود.
- أي وزن غير صالح (سالب/صفر/غير رقم — قد يكون بيانات تالفة أو مُتلاعَباً بها كُتبت مباشرة عبر Firestore SDK متجاوزةً النموذج) يُعامَل **دفاعياً** كوزن 1 عادي — يحمي كل من يقرأ هذا المصروف (`calculateBalances`، عرض القائمة، تصدير CSV) من نتيجة حساب خاطئة.
- `calculateBalances` يستخدمها الآن بدل `splitEven` مباشرة.

**3) الواجهة — `ExpenseSection.tsx`**
- زر "تخصيص التقسيم (غير متساوٍ)" يظهر فقط بعد اختيار مشاركين، ومخفي بالكامل افتراضياً. عند الضغط: حقل وزن رقمي بجانب كل مشارك + معاينة حيّة للمبلغ الفعلي بالريال لكل شخص (تُحسب عبر `splitByShares` مباشرة أثناء الكتابة).
- `ExpenseListItem`: يعرض حصة كل شخص بجانب اسمه (`الاسم (المبلغ)`) بدل قائمة أسماء مجرّدة عند وجود `shares` على المصروف.
- `useExpenseActions.ts`: `toggleParticipant`/`toggleAllParticipants` يُبقيان `shares` متزامنة مع `participants` (حذف وزن مشارك أُزيل، إضافة وزن 1 افتراضي لمشارك جديد فقط في وضع `'custom'`). `startEditExpense` يفتح وضع "تخصيص" تلقائياً إن كان المصروف محفوظاً بتقسيم غير متساوٍ أصلاً.

**4) `firestore.rules`**
- `isValidExpense` يسمح بحقل `shares` اختياري. `isValidShares(shares, participants)`: يتحقق أنه `map`، غير فارغ، وعدد مفاتيحه لا يتجاوز عدد المشاركين (يمنع نمو خريطة غير محدود) — **بدون** تحقق فردي من كل قيمة وزن (لا وسيلة بسيطة موثوقة للتكرار على قيم خريطة بلغة القواعد)؛ صحة القيم الفردية مسؤولية `splitByShares` الدفاعية عند القراءة بدلاً من ذلك.

**5) تصدير CSV**
- `utils/export.ts`: عمود "المشاركون" يعرض حصة كل شخص (نفس منطق `ExpenseListItem`) عند وجود تقسيم مخصّص على المصروف.

---

> **ملاحظة (بدون أي تعديل كود) — Optimistic Updates:** طُلب التحقق من دعم "عرض
> التغيير فوراً + شارة جارٍ المزامنة + تراجع تلقائي عند فشل الشبكة" — تبيّن أن
> هذا مُطبَّق **بالكامل مسبقاً** (من إصدار سابق لهذا السجل): كل الكتابات
> (إضافة/تعديل/حذف مصروف، إيداع، إضافة/حذف مسافر) تُغلق النموذج وتعرض التوست
> فوراً قبل انتظار الشبكة، اعتماداً على أن Firestore SDK يطبّق الكتابة على
> الكاش المحلي فور الاستدعاء. `useExpenses.ts`/`useTravelers.ts` يستخدمان
> `onSnapshot(..., { includeMetadataChanges: true })` ويعرضان `_pending:
> d.metadata.hasPendingWrites` لكل عنصر — تُعرَض شارة "جارٍ المزامنة" في
> `ExpenseListItem`/`TravelerCard` بناءً عليها. عند رفض فعلي من الخادم (قاعدة
> أمان/حد معدّل)، يتراجع Firestore تلقائياً عن الكاش المحلي، ويُستكمَل برسالة
> خطأ عبر `handleFirestoreError`. لا يوجد فرق بين انقطاع شبكة حقيقي (الكتابة
> تبقى معلّقة حتى تعود الشبكة، لا "تراجع" هنا لأنها لم تُرفض) ورفض فعلي من
> الخادم (تراجع تلقائي + رسالة خطأ) — فرّق بينهما عند القراءة مستقبلاً.

### v15 — استكمال Skeleton Loading (قسم الرسوم البيانية + التمرير السريع)

- `components/Skeleton.tsx`: `ChartsSectionSkeleton` (جديد) يحاكي التخطيط الفعلي لـ `ChartsSection` (عنوان + 3 تبويبات + مساحة رسم بنفس ارتفاع `h-64`) بدل سبينر `Loader2` عام — يُستخدم كـ `fallback` لـ `<Suspense>` حول `<ChartsSection>` في `App.tsx`، فيتفادى أي قفزة تخطيط (Layout Shift) عند اكتمال تحميل حزمة Recharts.
- `App.tsx` (`<Virtuoso>`): أُضيف `scrollSeekConfiguration` (`enter`/`exit` بحسب سرعة التمرير) و`components={{ ScrollSeekPlaceholder }}` (يعرض `ExpenseListItemSkeleton`) — أثناء التمرير السريع تظهر عناصر نائبة نابضة بدل فراغات DOM مُعاد تدويرها. استُخرج `Loader2` من استيراد `icons` في `App.tsx` بعد حذف السبينر القديم (لم يعُد مُستخدَماً هناك).

---

### v16 — Swipe Actions لعناصر المصاريف

يزيل زرَي تعديل/حذف الثابتَين من كل عنصر، ويُوفّر مساحة أفقية.

- `components/ExpenseSection.tsx` (`ExpenseListItem`): سحب **لليمين** يكشف شريطاً teal ("تعديل") خلف المحتوى وينفّذ `startEditExpense` إن تجاوز السحب 60px عند رفع الإصبع؛ سحب **لليسار** يكشف شريطاً rose ("حذف") وينفّذ `requestDeleteExpense` — **نفس** الدالة المستخدَمة سابقاً مع الزر، فتفتح `ConfirmModal` الموجود أصلاً (التأكيد مضمون بغض النظر عن مصدر الطلب). أقل من 60px = يعود العنصر لمكانه دون أي تنفيذ.
- تنفيذ يدوي خفيف (touch events + CSS `transform`)، **بلا أي مكتبة جديدة** — `touch-action: pan-y` على الحاوية يترك التمرير الرأسي للمتصفح تلقائياً (مهم داخل قائمة `react-virtuoso`) ويمرّر فقط حركة الإصبع الأفقية لمنطق السحب.
- بديل سطح المكتب (فأرة بلا لمس): زرّا تعديل/حذف مضغوطان (أيقونة فقط، بلا نص) يظهران فقط عند `hover`/`focus` فوق العنصر (`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`) — بلا أي مساحة أفقية دائمة في التخطيط. كلاهما (السحب والزرّان) مقيّدان بنفس `canManage` الموجود أصلاً (المسؤول أو صاحب المصروف).
- عمود الأزرار الثابت الذي كان بجانب المبلغ في كل عنصر أُزيل نهائياً.

---

### v17 — Bottom Sheet لكل النوافذ (بدل نافذة مركزية) — framer-motion

- `package.json`: أُضيفت تبعية `framer-motion`. ⚠️ **لا تنسَ `npm install`** بعد سحب هذا التحديث (نفس تحذير `recharts` في v9).
- `components/Modal.tsx`: أُعيد بناؤه بالكامل كـ **Bottom Sheet** — ينبثق من الأسفل بحركة `spring` حقيقية (`motion.div` + `drag="y"`)، مع مقبض سحب مرئي أعلى المحتوى (`sm:hidden` — لا معنى له في نافذة مركزية). قابل للإغلاق بثلاث طرق: السحب لأسفل بما يكفي (`offset.y > 120` أو سرعة `> 500px/ث`، عبر `dragSnapToOrigin` + `onDragEnd`)، الضغط خلف النافذة (الخلفية الداكنة)، أو زر الإغلاق الصريح (X/إلغاء) الموجود أصلاً بكل نافذة. من عرض `sm` فأكبر (شاشات أوسع) تعود نافذة مركزية عادية بزوايا كاملة الاستدارة — Bottom Sheet مخصص للجوال فقط.
- ⚠️ `ModalProps` صار يتطلب `onClose: () => void` **إلزامياً** (لم يكن موجوداً قبل هذا الإصدار). كل الاستخدامات الخمسة الحالية مرَّرته: `ConfirmModal` (عبر `onCancel`)، `DepositModal`، `AdminSignInModal`، `TrashBinModal`، `DepositHistoryModal`. أي نافذة جديدة تُبنى على `Modal` مستقبلاً يجب أن تمرّر `onClose`.
- `App.tsx`: كل نافذة من الست (تأكيد حذف مصروف، تأكيد حذف مسافر، `AdminSignInModal`، `DepositModal`، `DepositHistoryModal`، `TrashBinModal`) أصبحت مُحاطة بـ `<AnimatePresence>` خاص بها — **ضروري** لتشغيل حركة الخروج (الانزلاق لأسفل + تلاشي الخلفية) قبل إزالة العنصر فعلياً من الشجرة؛ بدونه يختفي فوراً بلا أي حركة، حتى مع `<Suspense>` متداخل (الأخير لا يُعيد تعليق مكوّن سبق أن تحلّل فعلاً).
- `components/modals/ModalFallback.tsx`: أصبح بنفس شكل غلاف `Modal` (Bottom Sheet على الجوال/مركزي من `sm` فأكبر) لكن **بلا** أي حركة `framer-motion` (ظهور عابر جداً ريثما يُحمَّل جزء الكود الكسول) — يمنع أي قفزة بصرية عند استبداله بالنافذة الحقيقية.

---

### v18 — Pull-to-Refresh (سحب لأسفل لإعادة الجلب من الخادم)

- `components/PullToRefresh.tsx` (جديد): يُغلِّف `<main>` بالكامل في `App.tsx`. السحب لا يُتتبَّع إلا إن كانت الصفحة في القمة فعلاً (`window.scrollY === 0`)، فلا يتعارض مع أي تمرير رأسي عادي. تجاوز السحب 60px عند رفع الإصبع يُشغِّل `onRefresh` ويعرض سبينر ريثما ينتهي.
- ⚠️ **قرار تصميم مهم:** `react-virtuoso` هنا يستخدم `useWindowScroll` (الصفحة كاملة تتمرّر كوحدة واحدة، لا حاوية داخلية منفصلة لقائمة المصاريف) — لذا "أعلى نقطة" الوحيدة المتاحة تقنياً هي **قمة الصفحة كاملة**، وليس تحديداً قمة قسم قائمة المصاريف (الذي يقع أسفل نموذج الإضافة/بطاقة الحساب البنكي على الجوال). نفس سلوك تطبيقات الجوال المعتادة (تويتر/إنستقرام).
- `hooks/useExpenses.ts` / `hooks/useTravelers.ts`: أُضيفت `refreshExpenses`/`refreshTravelers` عبر `getDocsFromServer` (تتجاوز الكاش المحلي تماماً، بخلاف `onSnapshot` المستخدَم للتحديثات الفورية المعتادة) — تُحدِّثان `state` مباشرة (بدل انتظار `onSnapshot` لإعادة الإطلاق تلقائياً من الكاش)، وتُستخدَمان **فقط** من هذه الإيماءة الصريحة، لا من التدفق المعتاد.
- `App.tsx` (`handlePullToRefresh`): يستدعي الدالتين معاً بالتوازي (`Promise.all`)، مع رسالة خطأ واضحة عبر `handleFirestoreError` إن فشل الاتصال بالخادم فعلياً.
- `src/index.css`: `overscroll-behavior-y: contain` على `html, body` — يعطّل سحب-التحديث الأصلي للمتصفح (يظهر افتراضياً في Chrome على أندرويد) حتى لا يتعارض بصرياً مع المؤشر المخصص.
- ⚠️ **قاعدة عامة مهمة اكتُشِفت هنا (تنطبق على أي عنصر لاحق):** أي عنصر `position: fixed` يجب أن يبقى **خارج** `<PullToRefresh>` — الأخير يطبّق CSS `transform` دائماً على محتواه الداخلي (حتى بقيمة `translateY(0px)`)، وأي `transform` على عنصر أب يُنشئ "containing block" جديداً يُبطل ثبات أي عنصر `fixed` بداخله أثناء التمرير الفعلي (يتحرك مع الصفحة بدل البقاء ثابتاً). `QuickAddFab` (v20) وكل النوافذ (`AnimatePresence` blocks) والتوست في `App.tsx` مُتعمَّد إبقاؤها خارج هذه الشجرة تحديداً لهذا السبب.

---

### v19 — Header قابل للطي (Sticky + Collapsible)

- `hooks/useHeaderCollapse.ts` (جديد): يتتبّع اتجاه `window scroll` (نفس نمط `useWindowScroll` في `react-virtuoso`) — يتقلّص عند التمرير لأسفل بما يتجاوز 5px (عتبة تمنع اهتزاز/jitter من تمرير دقيق)، ويعود كاملاً فوراً عند أي تمرير لأعلى، أو تلقائياً عند الوصول لقمة الصفحة (أقل من 10px).
- `components/Header.tsx`: عند التقلّص — حشو أقل (`py-4 → py-2`)، أيقونة الشعار وعنوان التطبيق أصغر، شارة "مزامنة..." تختفي مؤقتاً، ونص تسمية زر المسؤول يختفي (تبقى الأيقونة، أصغر حجماً). `transition-all` يجعل التبدّل بين الحالتين حركة سلسة بدل قفزة مفاجئة.

---

### v20 — Quick Add (زر عائم واحد فقط — FAB)

- `components/QuickAddFab.tsx` (جديد): زر دائري عائم **واحد فقط** (بلا أي قائمة إجراءات متفرّعة) في الزاوية السفلية اليمنى — يفتح Bottom Sheet مصغّر (نفس `Modal.tsx` من v17) بحقلين فقط: الوصف والمبلغ.
- `hooks/useExpenseActions.ts`: `handleQuickAddExpense(description, amount)` (جديدة) — نسخة مختصرة **مستقلة تماماً** عن `handleAddExpense` (لا تشارك حالة `newExpense`؛ أُبقيت منفصلة عمداً تفادياً لأي مخاطرة تعديل غير مقصودة على مسار الإضافة الكامل المُختبَر أصلاً)، لكن بنفس آلية الكتابة (`writeBatch` + Rate Limiting + تحديث متفائل). الافتراضيات: تاريخ اليوم، ريال سعودي بلا تحويل عملة، كل المسافرين النشطين بتقسيم متساوٍ (بلا `shares`)، فئة "أخرى".
- الزر يختفي أثناء Skeleton Loading الأول (`isInitialLoading`) وأثناء فتح نموذج الإضافة/التعديل الكامل (`isAddingExpense`) — تفادياً لوجود إضافتين متزامنتين على الشاشة.
- ⚠️ يُعرَض **خارج** `<PullToRefresh>` (انظر تحذير v18 أعلاه) — وإلا ينكسر ثبات `position: fixed` أثناء التمرير الفعلي.
- `components/UpdatePrompt.tsx`: `bottom-4 → bottom-24` — يفسح مجالاً لهذا الزر العائم (ثابت في نفس الزاوية) حتى لا تتداخل معه هذه النافذة إن ظهرت الاثنتان معاً (نادر: فقط مباشرةً بعد نشر تحديث جديد).

---

### v21 — تصغير StatBox (دمج داخل الهيدر المتقلِّص)

نوقش خياران: تمرير أفقي للخانات الإحصائية، أو دمجها داخل الهيدر (v19) — اختير **الدمج** لتوفير أكبر.

- `App.tsx`: شبكة `grid grid-cols-2 lg:grid-cols-3` المستقلة (3 × `StatBox`) أُزيلت نهائياً. `StatBox.tsx` و`StatBoxSkeleton` (كانا في `Skeleton.tsx`) لم يعودا مستورَدين في أي مكان — ⚠️ لم يُحذف ملف `StatBox.tsx` فعلياً (لا صلاحية حذف ملفات على جهاز المستخدم، فقط كتابتها)، يمكن حذفه يدوياً.
- `components/Header.tsx`: `HeaderStats` prop جديد (`totalDeposited`/`totalSpent`/`totalRemaining`/`activeTravelersCount` — الأخير عدّاد **جديد** لم يكن موجوداً كـ `StatBox` منفصل من الأصل، أُضيف بناءً على طلب المستخدم صراحة). **موسَّع:** صفّ ثانٍ من "حبّات" (pill، بأيقونة + رقم) تحت صفّ العنوان. **مُتقلِّص:** نفس الحبّات تحلّ محل نص العنوان نفسه في نفس الصفّ — لا تُضاف أي مساحة عمودية إطلاقاً في هذه الحالة (الأكثر شيوعاً أثناء التصفّح الفعلي).
- `src/icons.ts`: أُضيفت `Wallet` و`Scale` (لحبّتَي "الإجمالي"/"المتبقي")؛ `Receipt` و`Users` مُعادتا الاستخدام من الاستيراد الموجود أصلاً.
- ⚠️ **إعادة تصميم بعد ملاحظة المستخدم أن الشكل الأول "قبيح":** الإصدار الأول عرض نصاً خاماً "تسمية: قيمة" متراصاً — استُبدل بحبّات (`rounded-full` بخلفية شبه شفافة) بنفس أسلوب شارة "مزامنة..." الموجودة أصلاً في الهيدر (إعادة استخدام نمط بصري ناجح بدل اختراع نمط جديد)، مع أيقونة دلالية بدل نص التسمية (أسرع للمسح البصري، ويوفّر مساحة)، تلوين دلالي (وردي خفيف لحبّة "المصروفات" — مبلغ خارج)، `tabular-nums` لمنع "رقص" الأرقام عند تغيّر عدد الخانات العشرية، وإخفاء شريط التمرير نفسه عن الصف الأفقي القابل للتمرير.

---

### v22 — إزالة عدّاد المسافرين من حبّات الهيدر (بعد لقطات شاشة فعلية)

بعد معاينة v21 على جهاز حقيقي (لقطات شاشة)، لاحظ المستخدم أن 4 حبّات في صفّ واحد عند التقلّص قد تتجاوز عرض الشاشات الضيقة جداً (أقل من 360px)، وأن عدّاد المسافرين تحديداً أقل أهمية من الأرقام المالية الثلاثة وأنسب مكاناً له بجانب قسم بطاقات المسافرين نفسه بدل الهيدر.

- `components/Header.tsx`: أُزيلت `activeTravelersCount` من `HeaderStats` بالكامل، وأُزيل عنصر `travelers` من `STAT_ITEMS` (صار 3 حبّات فقط: مودَع/مصروف/متبقٍ). استُخرج حقل `isCount` من `StatItem` (لم يعد له استخدام بعد إزالة العنصر الوحيد الذي احتاجه)، وأُزيل استيراد أيقونة `Users` (لم تعد مستخدَمة هنا). عدد حبّات الهيكل النابض (skeleton) عُدِّل من (3 مُتقلِّص / 4 موسَّع — كانا غير متطابقين أصلاً) إلى 3/3 مطابقين لعدد `STAT_ITEMS` الفعلي الجديد.
- `src/App.tsx`: `stats` المُمرَّرة لـ `Header` صارت `{ totalDeposited, totalSpent, totalRemaining }` فقط (بلا عدّاد المسافرين). عدد المسافرين النشطين (`activeTravelers.length`) انتقل إلى شارة صغيرة (`rounded-full bg-teal-100 text-teal-700`) بجانب عنوان "موقف المسافرين" مباشرة (نفس القسم الذي يعرض بطاقات المسافرين)، تظهر فقط بعد اكتمال التحميل الأول (`!isInitialLoading`) بنفس شرط ظهور `stats` في الهيدر.
- ⚠️ لا تُعِد `activeTravelersCount`/`Users` إلى `Header.tsx` — عدد المسافرين مكانه الوحيد الآن هو الشارة بجانب عنوان "موقف المسافرين" في `App.tsx`.

---

### v23 — تحسين بطاقات المسافرين (تصغير + شبكة متجاوبة + تغذية راجعة لمسية)

نوقشت نقطتان قبل التنفيذ: (1) هل نحذف شارة المزامنة/الرصيد المتبقي/الشريط النسبي/أزرار تعديل الرصيد-السجل-الحذف كما اقترح كود في تقرير خارجي؟ اختار المستخدم **الإبقاء على كل الميزات** وضغط التصميم فقط. (2) هل نستخدم Container Queries (`@[320px]:`) أم breakpoints العرض العادية؟ اختار المستخدم **breakpoints العرض العادية (`sm:`/`lg:`)** لتفادي تبعية جديدة (`@tailwindcss/container-queries` غير مُثبَّتة أصلاً).

- `components/TravelerSection.tsx` (`TravelerCard`): حُشوة/خطوط أصغر على الجوال تحديداً (`p-3 sm:p-4`، `text-sm sm:text-base`...) مع إبقاء الحجم الأصلي من `sm` فما فوق. أُضيف أفتار دائري مضغوط بحرف اسم المسافر الأول (`traveler.name[0]`، **ليس** `shortName` — ذاك مفتاح ربط داخلي لا للعرض) لتعرّف بصري أسرع. كل أزرار المسؤول (تعديل الرصيد/السجل/حذف) صار لها `active:scale-95` (+ `active:bg-*` على زر تعديل الرصيد) لتغذية راجعة لمسية واضحة عند الضغط على الجوال، تعالج ملاحظة "أزرار صغيرة" دون تكبير المساحة الفعلية للزر (كان تكبير المساحة سيتعارض مع هدف تصغير البطاقة).
- `src/App.tsx`: شبكة بطاقات المسافرين صارت **مشروطة بوضع المسؤول**: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` في وضع المشاهدة العادي (البطاقة مضغوطة بلا أزرار — عمودان يعملان بلا ازدحام)، لكن `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` في وضع المسؤول (البطاقة تحوي حتى 3 أزرار + رسالة الحذف — عمودان على الجوال يضيّقانها بشكل غير عملي). هذا حلّ وسط لم يرد صراحة في الطلب، بل قرار هندسي للتوفيق بين "إبقاء كل الميزات" و"شبكة مضغوطة على الجوال" معاً.
- `components/Skeleton.tsx` (`TravelerCardSkeleton`): أبعاد/حُشوة مطابقة للبطاقة الفعلية الجديدة (بما فيها دائرة الأفتار) لتفادي قفزة تخطيط بسيطة عند اكتمال التحميل.
- ⚠️ لم يُستخدم Container Queries ولا تبعية `@tailwindcss/container-queries` — إن احتجتها لاحقاً (مثال: مكوّن يتكرر داخل حاويات مختلفة العرض، لا الشاشة كاملة) ثبّتها وأضف `@container` صراحةً على العنصر الأب أولاً، فهي غير مُفعَّلة افتراضياً في Tailwind 3.4.

---

### v24 — إصلاح تقطّع اسم المسافر في البطاقة المضغوطة (لقطة شاشة فعلية)

بعد معاينة v23 على جهاز حقيقي (عمودان على الجوال في وضع المشاهدة)، ظهرت أسماء طويلة (`عبدالمجيد الدبيخي`، `محمد أحمد عبدالله العاثم`...) مقطوعة بشكل مشوَّه بلا نقاط حذف "…" — أحياناً يبدو الحرف الأخير المرئي حرفاً مختلفاً تماماً بسبب تشكّل الحروف العربية السياقي عند القصّ في منتصف حرف مركّب.

- **السبب الجذري:** `className="... flex items-center gap-1.5 truncate"` على عنصر `h3` — `truncate` (أي `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) **لا يعمل بشكل صحيح إن وُضع مباشرة على حاوية `flex`** تحوي أكثر من عنصر ابن (هنا: نص الاسم + شارة "مزامنة" الشرطية). المتصفح يقصّ الفائض عند حافة الحاوية (بفضل `overflow:hidden`) لكن **بلا** إدراج "…" فعلياً، لأن نموذج عرض `text-overflow` مصمَّم لعناصر `block`/`inline-block` ذات تدفّق نصّي، لا لعناصر `flex` تُدار أبعاد أبنائها بخوارزمية مختلفة (كل ابن، بما فيه العقدة النصية المجهولة، له `min-width: auto` افتراضياً فيرفض الانكماش دون ذلك).
- **الإصلاح** في `components/TravelerSection.tsx`: نُقل `truncate` من `h3` إلى `<span className="truncate min-w-0">{traveler.name}</span>` يلفّ اسم المسافر وحده، مع `min-w-0` صريحة (ضرورية لأن العنصر أصبح الآن flex item بحد ذاته). بقي `h3` نفسه `flex items-center gap-1.5 min-w-0` فقط (لترتيب الاسم + الشارة بجانب بعضهما، بلا truncate عليه هو).
- أيضاً أُضيف `truncate` لسطر "الدفع المسبق: ..." (عنصر `<p>` عادي غير flex — آمن هنا) لمنع التفافه لسطرين عند تضييق البطاقة، فتبقى كل بطاقات نفس الصفّ بارتفاع متطابق.
- ⚠️ **قاعدة عامة يجب تذكّرها لأي truncate مستقبلي:** لا تضع `truncate` مباشرة على عنصر `flex`/`inline-flex` يحوي أكثر من ابن واحد (أو حتى ابن واحد نصّي محض دون التفاف بـ`span`). ضع `truncate` + `min-w-0` على الابن النصّي (`span`) نفسه، واترك الحاوية `flex` بلا `truncate`. راجع أي مكان آخر بالكود يجمع `flex` و`truncate` على نفس العنصر (مثال: أي `h3`/`p` مستقبلي يعرض نصاً متغيّر الطول بجانب شارة أو أيقونة).

---

## بنية البيانات في Firestore

**مسار المجموعات (🆕 v13: `{TRIP_ID}` ديناميكي بدل `APP_ID` ثابت):**
```
artifacts/{TRIP_ID}/public/data/expenses/{expenseId}
artifacts/{TRIP_ID}/public/data/travelers/{travelerId}
artifacts/{TRIP_ID}/public/data/travelers/{travelerId}/depositLogs/{logId}
artifacts/{TRIP_ID}/public/data/rateLimits/{uid}
trips/{TRIP_ID}                 ← 🆕 v13 إعدادات الرحلة العامة (اسم + بنك) — top-level، خارج مسار artifacts/
tripSecrets/{TRIP_ID}           ← 🆕 v13 هاش رمز PIN (لا يُقرأ من العميل إطلاقاً) — top-level
```
حيث `TRIP_ID` يُحسب ديناميكياً في `src/utils/tripId.ts` من `?trip=xyz` في الرابط
(افتراضياً `'travelapp-87206'` إن غاب المعامل). **لم يعُد ثابتاً واحداً بالكود** —
انظر قسم v13 أعلاه لتفاصيل دعم الرحلات المتعددة.

**حقول المصروف (`expenses`):**
```ts
{
  date: '2024-03-15',           // string YYYY-MM-DD
  description: 'وقود',          // string
  amount: 187.5,                // number — المبلغ بالريال السعودي دائماً
  originalAmount: 50,           // number — المبلغ بالعملة الأصلية
  currency: 'USD',              // string — رمز العملة (SAR إن كانت ريالاً)
  exchangeRate: 3.75,           // number — سعر الصرف وقت التسجيل
  participants: [1, 2],         // number[] — معرّفات المسافرين (Traveler.id)؛ بيانات
                                //            قديمة قد تحوي أسماء مختصرة حتى تُهاجَر
  createdAt: 1710500000000,     // number — Unix timestamp بالميلي ثانية
  deletedAt: null,              // number | null — اختياري، لحذف ليّن (Soft Delete)
  createdByUid: 'abc123...',    // string — اختياري، uid صاحب المصروف (مصاريف قديمة بدونه = تعديل المسؤول فقط)
  category: 'طعام وشراب',        // string — 🆕 v9 اختياري (من EXPENSE_CATEGORIES)، "أخرى" افتراضياً للمصاريف القديمة بلا فئة
  shares: { '1': 1, '2': 2 },    // Record<string, number> — 🆕 v14 اختياري تماماً؛ غيابه = تقسيم بالتساوي التام (splitEven).
                                //            المفتاح: participant id كنص. وزن غائب لمشارك = 1 افتراضياً.
}
```

**سجل تدقيق تعديلات الرصيد (🆕 `travelers/{travelerId}/depositLogs/{logId}`):**
```ts
{
  travelerId: 1,                 // number
  previousDeposited: 1000,       // number — الرصيد قبل التعديل
  newDeposited: 1200,            // number — الرصيد بعد التعديل
  delta: 200,                    // number — الفرق (قد يكون سالباً)
  mode: 'add',                   // 'add' | 'subtract' | 'set'
  reason: 'دفع نقدي إضافي',      // string | null — اختياري، حتى 300 حرف
  changedByEmail: 'admin@...',   // string
  changedByUid: 'xyz789...',     // string — يجب أن يطابق uid المسؤول الذي أنشأ السجل
  createdAt: 1710500000000,      // number — Unix timestamp بالميلي ثانية
}
```
> مجموعة **غير قابلة للتعديل أو الحذف** بعد الإنشاء (`allow update, delete: if false`)، ومرئية للمسؤول فقط. انظر `DepositHistoryModal.tsx` و`handleAddDeposit` في `App.tsx` (يكتب الرصيد والسجل ذرياً عبر `writeBatch`).

**🆕 v11 حد المعدّل (`rateLimits/{uid}`):**
```ts
{
  lastExpenseCreatedAt: 1710500000000,  // number — Unix timestamp لآخر مصروف أضافه هذا المستخدم في هذه الرحلة
}
```
> لا يُقرأ من العميل مباشرة (`allow read: if false`) — يُستخدم داخلياً فقط عبر `get()` في دالة `withinExpenseRateLimit()` بقواعد الأمان. انظر v11 أعلاه.

**🆕 v13 إعدادات الرحلة (`trips/{tripId}`، top-level، خارج `artifacts/`):**
```ts
{
  name: 'رحلة بولندا',                    // string — اسم الرحلة (يُقرأ من useTripConfig)
  bankDetails: {
    bankName: 'البنك السعودي للاستثمار (SAIB)',
    beneficiary: 'محمد أحمد عبدلله العاثم',
    iban: 'SA3265000005555459829001',
  },
}
```
> يُقرأ فقط بعد التحقق من عضوية *نفس* الرحلة (`isMember(tripId) || isAdmin()`). **لا كتابة من العميل إطلاقاً** — يُدار حصراً عبر `scripts/create-trip.mjs`.

**🆕 v13 هاش رمز الرحلة (`tripSecrets/{tripId}`، top-level):**
```ts
{
  salt: 'a1b2c3...',       // string (hex) — ملح عشوائي، فريد لكل رحلة
  pinHash: 'd4e5f6...',    // string (hex) — SHA-256(salt + pin)، لا يُخزَّن الرمز الصريح أبداً
}
```
> **ممنوع الوصول من العميل تماماً** (`allow read, write: if false`) — الوصول الوحيد عبر `admin.firestore()` داخل `functions/index.js` (Admin SDK يتجاوز القواعد أصلاً).

**حقول المسافر (`travelers`):**
```ts
{
  id: 1,               // number — معرّف فريد، يُستخدم كـ doc ID أيضاً
  name: 'محمد العاثم', // string — الاسم الكامل (للعرض)
  shortName: 'محمد',   // string — اسم العرض المختصر (لم يَعُد مفتاح الربط)
  deposited: 1214,     // number — إجمالي ما دفعه مسبقاً بالريال
}
```

> **ملاحظة:** بعد هجرة v5 صار مفتاح الربط بين المصروف والمسافر هو **`id` الرقمي**
> (في `Expense.participants`)، لا `shortName`. لذا صار تغيير `shortName` آمناً (مجرد
> اسم عرض). الربط بالـ id يتم في `utils/participants.ts` (`matchesTraveler`)، مع توافق
> خلفي مع الأسماء القديمة حتى يُشغَّل `scripts/migrate-participants.mjs`.

---

## قواعد Firestore (Security Rules)

المصدر الرسمي للقواعد صار ملف **`firestore.rules`** في جذر المشروع — عدّله هناك،
ثم انشره عبر `firebase deploy --only firestore:rules` أو الصقه في
Firebase Console › Firestore › Rules. لا تترك القواعد في الـ Console فقط.

القراءة والإنشاء تتطلبان **`isMember(appId) || isAdmin()`** بدل مجرد `isSignedIn()` —
أي أن مجرد الدخول كـ Anonymous لا يكفي؛ يجب أولاً اجتياز بوابة رمز الرحلة
(`TripGate` → `verifyTripPin` Cloud Function → Custom Claim `trips: { [tripId]: true }`،
انظر قسم Cloud Functions أدناه وv8/v13). 🆕 v13: المسار صار مُعمَّماً
(`/artifacts/{appId}/...`) بدل معرّف رحلة ثابت واحد، وعضوية كل مستخدم مضبوطة
**لكل رحلة على حدة** عبر خريطة `trips` — لا وجود "عضوية عامة" تشمل كل الرحلات.
التعديل/الحذف الليّن (`deletedAt`) مسموح أيضاً لصاحب المصروف نفسه (`isExpenseOwner`)
وليس المسؤول فقط. القراءة/الإنشاء كلاهما مع **تحقّق صارم من صحة الحقول**
(`isValidExpense`/`isValidTraveler`/`isValidDepositLog`/`isValidShares`) لمنع
المستندات العشوائية أو الضخمة أو ذات الحقول الزائدة.

هذا ملخّص مبسّط — **الملف `firestore.rules` نفسه هو المصدر الرسمي والدقيق دائماً**،
راجعه مباشرة عند أي شك:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }

    function isAdmin() {
      return isSignedIn()
        && request.auth.token.email in [
          'mostqbel.morsel@gmail.com'   // ← يجب أن يطابق ADMIN_EMAILS في constants.ts. عالمي (كل الرحلات)، لم يُفصَل لكل رحلة.
        ];
    }

    // 🆕 v13 عضوية رحلة محددة (appId) — تُمنح فقط بعد التحقق من رمز *تلك* الرحلة
    // تحديداً عبر verifyTripPin. عضو في رحلة A لا يُعتبر عضواً في رحلة B إطلاقاً.
    function isMember(appId) {
      return isSignedIn()
        && ('trips' in request.auth.token)
        && (appId in request.auth.token.trips)
        && request.auth.token.trips[appId] == true;
    }

    // صاحب المصروف: نفس uid الذي أنشأه أصلاً (createdByUid). appId يُمرَّر صراحةً.
    function isExpenseOwner(existing, appId) {
      return isMember(appId)
        && 'createdByUid' in existing.data
        && existing.data.createdByUid == request.auth.uid;
    }

    function isValidExpense(d) {
      return d.keys().hasOnly(['date','description','amount','originalAmount',
               'currency','exchangeRate','participants','createdAt','deletedAt',
               'createdByUid','category','shares'])           // 🆕 category (v9) + shares (v14)
        && d.amount is number && d.amount >= 0
        && d.participants is list && d.participants.size() > 0
        && (!('shares' in d) || isValidShares(d.shares, d.participants));
      // (انظر firestore.rules للتحقّق الكامل لكل حقل)
    }

    // 🆕 v14 تقسيم غير متساوٍ — خريطة { [participantId]: وزن }؛ لا تحقّق فردي لكل
    // قيمة وزن هنا عمداً (splitByShares في utils/calculations.ts دفاعية بما يكفي عند القراءة)
    function isValidShares(shares, participants) {
      return shares is map && shares.size() > 0 && shares.size() <= participants.size();
    }

    function isValidTraveler(d) {
      return d.keys().hasOnly(['id','name','shortName','deposited','deletedAt'])
        && d.deposited is number && d.deposited >= 0;
    }

    // سجل تدقيق تعديل الرصيد — immutable
    function isValidDepositLog(d) {
      return d.keys().hasOnly(['travelerId','previousDeposited','newDeposited','delta',
               'mode','reason','changedByEmail','changedByUid','createdAt'])
        && d.changedByUid is string && d.changedByUid == request.auth.uid;
      // (انظر firestore.rules للتحقّق الكامل لكل حقل)
    }

    // 🆕 v11 حد المعدّل: مصروف واحد كل ثانية لكل عضو (غير المسؤول) — appId يُمرَّر صراحةً
    function withinExpenseRateLimit(appId) {
      let rl = /databases/$(database)/documents/artifacts/$(appId)/public/data/rateLimits/$(request.auth.uid);
      return !exists(rl) || request.time.toMillis() - get(rl).data.lastExpenseCreatedAt >= 1000;
    }

    // ⚠️ نعتمد على ساعة العميل (Date.now()) لا serverTimestamp — نتحقق أن القيمة
    // قريبة من request.time الفعلي (±5 ثوانٍ) لمنع تحايل بقيمة مزيّفة قديمة
    function isValidRateLimitWrite(d) {
      return d.keys().hasOnly(['lastExpenseCreatedAt'])
        && d.lastExpenseCreatedAt is number
        && d.lastExpenseCreatedAt <= request.time.toMillis() + 5000
        && d.lastExpenseCreatedAt >= request.time.toMillis() - 5000;
    }

    // 🆕 v13 {appId} مُعمَّم بدل معرّف رحلة ثابت — متاح كمتغيّر مسار لكل ما بداخل هذا الـ match
    match /artifacts/{appId}/public/data {
      match /expenses/{expenseId} {
        allow read:   if isMember(appId) || isAdmin();
        allow create: if isValidExpense(request.resource.data)
                        && ( isAdmin() || (isMember(appId) && withinExpenseRateLimit(appId)) );
        // تعديل (يشمل الحذف الليّن): المسؤول دائماً، أو صاحب المصروف بشرط عدم تغيير createdByUid
        allow update: if isValidExpense(request.resource.data)
                        && ( isAdmin()
                             || ( isExpenseOwner(resource, appId)
                                  && request.resource.data.createdByUid == resource.data.createdByUid ) );
        allow delete: if false; // 🚫 حظر صلب — Soft Delete فقط عبر deletedAt
      }
      match /travelers/{travelerId} {
        allow read:   if isMember(appId) || isAdmin();
        allow create: if (isMember(appId) || isAdmin()) && isValidTraveler(request.resource.data);
        allow update: if isAdmin()    && isValidTraveler(request.resource.data);
        allow delete: if false; // 🚫 حظر صلب — يحمي سجل الأرصدة التراكمي

        // سجل تدقيق الودائع — مرئي للمسؤول فقط، غير قابل للتعديل أو الحذف نهائياً
        match /depositLogs/{logId} {
          allow read:           if isAdmin();
          allow create:         if isAdmin() && isValidDepositLog(request.resource.data);
          allow update, delete: if false;
        }
      }

      // 🆕 v11 حد المعدّل — لا يُقرأ من العميل، يُكتب فقط من صاحبه
      match /rateLimits/{uid} {
        allow read:            if false;
        allow create, update:  if isMember(appId) && request.auth.uid == uid && isValidRateLimitWrite(request.resource.data);
        allow delete:          if false;
      }
    }

    // 🆕 v13 إعدادات كل رحلة (اسم + بنك) — top-level، لا كتابة من العميل إطلاقاً
    match /trips/{tripId} {
      allow read:  if isMember(tripId) || isAdmin();
      allow write: if false;
    }

    // 🆕 v13 هاش رمز PIN لكل رحلة — ممنوع الوصول من العميل تماماً (Admin SDK فقط)
    match /tripSecrets/{tripId} {
      allow read, write: if false;
    }
  }
}
```

---

## Firebase Authentication

- **المستخدمون العاديون:** يُسجَّلون تلقائياً كـ Anonymous عند فتح التطبيق، لكنهم **لا يملكون صلاحية القراءة/الإنشاء بعد** — يجب أولاً اجتياز `TripGate` (رمز الرحلة) عبر `verifyTripPin` ليحصلوا على Custom Claim `trips: { [tripId]: true }` (🆕 v13: خريطة لكل رحلة، بدل `member: true` عالمي كان في v8). راجع قسم "Cloud Functions ونشرها" أدناه وv13 في سجل التعديلات.
- **المسؤول:** حساب Email/Password مُنشأ يدوياً في Firebase Console › Authentication › Users. **عالمي** (يدير كل الرحلات) — لم يُفصَل لكل رحلة.
- **تحديد المسؤول في الكود:** `ADMIN_EMAILS` في `src/constants.ts` — يجب أن يطابق بريد Firebase وقواعد Firestore (`isAdmin()`).
- **إن أردت تغيير بريد المسؤول:** عدّل في ثلاثة أماكن: `constants.ts` + Firestore Rules + Firebase Auth Users.
- **استعادة كلمة المرور:** زر "نسيت كلمة المرور؟" في `AdminSignInModal.tsx` يستدعي `sendPasswordResetEmail` من `firebase/auth` مباشرة (لا Cloud Function مخصصة) ويعرض دائماً رسالة نجاح عامة بغض النظر عن نتيجة الاستدعاء الفعلية — لتفادي كشف ما إذا كان البريد مسجَّلاً أم لا. 🆕 حالة تحميل + مهلة 60 ثانية قبل إعادة الإرسال (`isSendingResetEmail`/`useCountdown` في `App.tsx`).
- **رسائل خطأ تسجيل الدخول:** `handleAdminSignIn` في `App.tsx` يميّز حسب `err.code` (`auth/invalid-email`, `auth/user-disabled`, `auth/too-many-requests`, `auth/network-request-failed`, وإلا فرسالة عامة "بيانات الدخول غير صحيحة").
- **Custom Claims وتحديثها:** بعد نجاح `verifyTripPin`، يحمل الـ ID token الجديد `trips: {...}` فوراً (السطر `await auth.currentUser.getIdToken(true)` في `useAuth.ts` يجبر تحديث الـ token). لا حاجة لتسجيل خروج/دخول.
- 🆕 v13 **العضوية خاصة بكل رحلة:** التحقق من رمز رحلة A يمنح `trips.A: true` فقط — لا يمنح أي صلاحية على رحلة B. `verifyTripPin` يدمج (لا يستبدل) مع أي رحلات سابقة تحقق منها نفس المستخدم، فيمكنه أن يكون عضواً في عدة رحلات على نفس الحساب/الجهاز.

---

## Cloud Functions ونشرها

المشروع يحوي **ثلاثة أنظمة منفصلة تُنشَر بأوامر مختلفة تماماً ولا تتزامن تلقائياً**:
الواجهة (Vercel) / قواعد Firestore / Cloud Functions. انظر التحذير في قسم
"الأوامر الأساسية" أعلاه — نسيان نشر واحد منها يسبب سلوكاً متضارباً صامتاً.

**`functions/index.js` — الدالة الوحيدة حالياً: `verifyTripPin`**
- Firebase Functions **v2** (`onCall`/`HttpsError` من `firebase-functions/v2/https`)، المنطقة `us-central1` (يجب أن تطابق دائماً وجهة `vercel.json` أدناه ومشروع Firebase).
- 🆕 v13: تستقبل `{ tripId, pin }` (كانت `{ pin }` فقط في v8). تبحث عن `tripSecrets/{tripId}` عبر `admin.firestore()` (Admin SDK — يتجاوز قواعد الأمان)، وتقارن `SHA-256(salt + pin)` المُدخَل مع `pinHash` المخزَّن عبر `crypto.timingSafeEqual` (مقاومة لهجوم قياس التوقيت).
- ⚠️ **لم تعُد تستخدم `defineSecret('TRIP_PIN')`/Secret Manager إطلاقاً** — رمز كل رحلة وهاشه يُداران بالكامل عبر Firestore (`scripts/create-trip.mjs`)، لا تُعِد هذا النمط القديم ولا تحاول إعادة ربط `firebase functions:secrets:set`.
- `maxInstances: 5` — حد أقصى للنسخ المتزامنة يقلل الأثر المالي المحتمل لأي محاولة تخمين متكررة للرمز.
- الرمز المُدخَل والمُخزَّن يُقارَنان بعد `.trim()` (دفاعي ضد فروق المسافات البيضاء).
- عند النجاح: يقرأ `userRecord.customClaims` الحالية أولاً، ثم `admin.auth().setCustomUserClaims(uid, { ...existing, trips: { ...existingTrips, [tripId]: true } })` (دمج لا استبدال) ثم `{ success: true }`.
- إن لم يوجد مستند `tripSecrets/{tripId}` أصلاً (رحلة غير موجودة)، أو كان الرمز خاطئاً — **نفس رسالة الخطأ العامة** بالحالتين (لا تسريب معلومة عن وجود tripId من عدمه).

**⚠️ لا تستدعِ الدالة مباشرة من العميل عبر `cloudfunctions.net` — استخدم `/api/verifyTripPin` حصراً**
- السبب: عند استدعاء `us-central1-travelapp-87206.cloudfunctions.net/verifyTripPin` مباشرة (نطاق مختلف عن الواجهة)، **يُسقِط المتصفح ترويسة `Authorization` فعلياً من الطلب الفعلي** رغم أن الـ CORS preflight يُصرِّح بإرسالها (مؤكَّد عبر HAR export كامل من DevTools) — ما يسبب 401 Unauthorized دائماً.
- **الحل الدائم:** `vercel.json` في جذر المشروع يعيد توجيه (rewrite) `/api/verifyTripPin` إلى رابط الدالة الحقيقي. بما أن الطلب صار لنفس أصل الواجهة (`travel-app-final-nu.vercel.app`)، يُرسِل المتصفح الترويسة بشكل طبيعي، وحافة Vercel (خادمية، لا تخضع لسياسات المتصفح) تُمرِّره للدالة الحقيقية.
- `useAuth.ts` (`callVerify`) يستدعي `fetch('/api/verifyTripPin', …)` مباشرة مع إرفاق `Authorization: Bearer <idToken>` يدوياً — **وليس** `httpsCallable` من `firebase/functions` (الاستخدام المباشر لها يعيد نفس مشكلة الترويسة المفقودة).
- شكل الاستجابة الفعلي `{"result":{"success":true}}` — تحليل الاستجابة في `callVerify` يتحقق من عدة أشكال محتملة تحسّباً (`resData?.result?.success` أو `resData?.result?.data?.success` أو `resData?.success`).
- ❌ **لا تحذف `vercel.json` ولا تُبسّط `useAuth.ts` للعودة لاستخدام `httpsCallable`** — هذا يعيد مشكلة الـ 401.

**نشر التغييرات:**
```bash
firebase deploy --only functions          # لازم بعد أي تعديل في functions/index.js فقط

# إضافة/تحديث رمز رحلة (لا تتطلب أي نشر للدوال — كتابة Firestore مباشرة عبر Admin SDK)
node scripts/create-trip.mjs
```
🆕 v13: لم يعُد هناك "سر" على مستوى المشروع يحتاج `firebase functions:secrets:set` —
كل رحلة (بما فيها الرحلة الحالية بعد النشر الأول لهذا التحديث) تُدار عبر
`scripts/create-trip.mjs` وحده. `firebase deploy --only functions` يلزم فقط عند
تعديل *كود* `functions/index.js` نفسه، لا عند إضافة/تغيير رمز رحلة.

**نمط خطأ CLI حميد ومتكرر:** أحياناً ينجح الأمر فعلياً (نشر الدالة/القواعد) لكن ينتهي الـ CLI برسالة مخيفة مثل
`[error] Error: An unexpected error has occurred.` بسبب خطوة تنظيف داخلية لاحقة تنتهي بمهلة (timeout) —
لا علاقة لها بالعملية الأساسية. **تحقّق دائماً من `firebase-debug.log`** (ابحث عن `✔ Deploy complete!`
أو `Updated function verifyTripPin` أو `released rules firestore.rules`) قبل افتراض الفشل وإعادة المحاولة.

---

## أسعار الصرف

- تُجلب من `https://open.er-api.com/v6/latest/SAR` عند تحميل الصفحة.
- تُخزَّن بالـ PWA cache لمدة 6 ساعات (NetworkFirst).
- إن تعذّر الجلب، تُستخدم `FALLBACK_RATES` من `src/constants.ts` — عدّل هذه القيم إن أردت تحديث الأسعار الاحتياطية.

---

## PWA والأيقونات

- الأيقونات **موجودة** في `public/icons/` ولا تحتاج إعادة إضافة.
- ⚠️ **لا تضِف `public/manifest.json` يدوياً.** الـ manifest يُولَّد تلقائياً من كائن
  `manifest` في `vite.config.js` بواسطة `vite-plugin-pwa`، ويظهر في البناء باسم
  `dist/manifest.webmanifest`، ويُحقَن رابطه `<link rel="manifest">` آلياً في
  `dist/index.html`. لذا لا تجده في `index.html` المصدري (طبيعي) — ولا يحتاج رابطاً
  يدوياً. أي تعديل على بيانات الـ manifest (الاسم، الألوان، الأيقونات) يكون في
  `vite.config.js` فقط. إضافة manifest يدوي تُنشئ مصدرَي حقيقة متعارضين.
- الـ Service Worker والـ manifest لا يُولَّدان إلا بعد `npm run build` — لا يعملان في `npm run dev`
  (إلا بإضافة `devOptions: { enabled: true }` إلى إعداد VitePWA لاختبار الـ PWA أثناء التطوير).
- لاختبار الـ PWA محلياً: `npm run build && npm run preview`.

---

## أنماط يجب اتباعها عند التعديل

### إضافة أيقونة جديدة
1. أضف الأيقونة لـ `src/icons.ts` (من `lucide-react` فقط).
2. استوردها في المكوّن المطلوب من `'../icons'` أو `'../../icons'`.
3. لا تستورد من `lucide-react` مباشرة في ملفات المكونات.

### إضافة عملة جديدة
عدّل `FALLBACK_RATES` و`CURRENCY_LABELS` في `src/constants.ts` فقط — الباقي يُحسب تلقائياً.

### إضافة حقل جديد للمصروف
1. أضف النوع في `src/types.ts` (واجهة `Expense` و`ExpenseFormData`).
2. 🆕 أضفه في `payload` داخل `handleAddExpense` بـ`src/hooks/useExpenseActions.ts` (وليس `App.tsx` — انتقل هناك في v12).
3. أضف حقل الإدخال في `ExpenseForm` داخل `ExpenseSection.tsx` (يقرأ `expenseForm`/`setExpenseForm` من `useUI()`).
4. أضف عرضه في `ExpenseListItem` إن أردت إظهاره في القائمة.
5. 🆕 أضفه في `exportExpensesToCSV` داخل `src/utils/export.ts` إن أردت تصديره (ليس `App.tsx` — انتقلت في v12).

### إضافة modal جديد
1. أنشئ الملف في `src/components/modals/` بامتداد `.tsx`.
2. استورده بـ `React.lazy()` في `App.tsx`.
3. غلّفه بـ `<Suspense fallback={<ModalFallback />}>` في الـ render.

### 🆕 إضافة رحلة جديدة (Multi-Trip)
1. شغّل `node scripts/create-trip.mjs` (يتطلب `serviceAccountKey.json` بجذر المشروع) وأدخل: معرّف الرحلة، اسمها، بيانات البنك، رمز PIN.
2. شارك رابط `<رابط موقعك>/?trip=المعرّف` مع أعضاء تلك الرحلة فقط.
3. لا حاجة لأي تعديل كود أو نشر (`firestore.rules`/`functions`) — القواعد والدالة مُعمَّمتان أصلاً لأي `tripId` صالح. انظر v13.
4. ❌ لا تُنشئ معرّف رحلة يدوياً بكتابة مباشرة في Firestore Console — استخدم السكربت دائماً (يضبط الهاش والملح بالطريقة الصحيحة، ولا طريقة أخرى مدعومة لإنشاء `tripSecrets/{tripId}` بأمان).

### المنطق في hooks/App لا في المكونات
الحالة الأساسية والتأثيرات في `src/hooks/`، ومنطق عمليات المصروف تحديداً في `useExpenseActions.ts` (🆕 v12)، والباقي من الـ handlers وحالة الواجهة في `App.tsx`. المكونات لا تحوي منطق عمل أو جلب بيانات — تستقبل props أو تقرأ القيم المشتركة من `useData()` (بيانات) و`useUI()` (إجراءات/نماذج) فقط.

### 🆕 v17 إضافة/استخدام Modal جديد (Bottom Sheet)
1. مرِّر `onClose` إلزامياً لأي `<Modal>` — أصبح مطلوباً منذ v17 (يُستخدم لإغلاق النقر على الخلفية وسحب البطاقة للأسفل).
2. غلِّف أي رندرة شرطية لمكوّن يحوي `<Modal>` بـ `<AnimatePresence>` عند نقطة الرندرة نفسها (كما في `App.tsx`) — بدونها لا تُشغَّل حركة الخروج (`exit`) لأن المكوّن يُزال من الشجرة فوراً بدل التلاشي/الانزلاق.
3. لا تُنشئ نافذة مركزية عادية (بدون Bottom Sheet) لمكوّن جديد — اتّبع نفس نمط `Modal.tsx` الحالي لثبات تجربة المستخدم عبر كل النوافذ.

### 🆕 v18 إضافة عنصر `position: fixed` جديد (زر عائم، تنبيه، Toast...)
ركِّبه **خارج** `<PullToRefresh>` في `App.tsx` (بجانبه لا داخله) — أي `transform` على سلف (حتى `translateY(0px)` كما يطبّق `PullToRefresh` دوماً على أبنائه) ينشئ "containing block" جديداً يكسر سلوك `position: fixed` (يصبح نسبياً لذلك السلف بدل نافذة العرض، ويفقد الثبات أثناء التمرير). انظر `QuickAddFab` في `App.tsx` كمثال (مع تعليق يشرح السبب في مكانه).

---

## الحسابات المُخزَّنة بـ useMemo

| المتغير | الموقع | يُعاد حسابه عند تغيّر |
|---|---|---|
| `CURRENCIES` | `hooks/useExchangeRates.ts` | `rates` |
| `{ balances, totalSpent, totalDeposited, totalRemaining }` | `hooks/useBalances.ts` (المنطق في `utils/calculations.ts`) | `travelers` أو `expenses` |
| `filteredExpenses` | `hooks/useFilteredExpenses.ts` | `expenses` أو `searchQuery` (🆕 مؤجَّلة 300ms عبر `useDebounce`) أو `sortOrder` |
| 🆕 `settlements` / `categoryTotals` / `spendingTrend` | `App.tsx` (المنطق في `utils/calculations.ts`) | `balances`/`activeExpenses` — تغذّي `ChartsSection` فقط، لا تُقرأ من Firestore مباشرة |

لا تحذف الـ `useMemo` — هذه الحسابات تعمل على كل المصاريف والمسافرين في كل render.

---

## ما لا يجب فعله

- ❌ لا تضع `async/await` مباشرة في جسم المكوّن — استخدم `useEffect`.
- ❌ لا تستورد `AdminSignInModal` أو `DepositModal` بشكل مباشر (static import) — هما lazy-loaded عمداً.
- ❌ لا تعدّل `shortName` لمسافر موجود — يكسر الربط مع المصاريف القديمة.
- ❌ لا تضيف منطق عمل أو جلب بيانات داخل المكونات — الـ handlers في `App.tsx` والحالة في `src/hooks/`؛ المكونات تستهلك props أو `useData()`/`useUI()` فقط.
- ❌ لا تُعِد إنشاء `vite.config.ts` — الإعداد موحّد في `vite.config.js` فقط؛ أي تعديل على Vite يكون فيه.
- ❌ لا تحذف نسخ `.tsx` ولا مجلد `components/modals/` — هي المصدر الفعلي للتطبيق.
- ❌ لا تستخدم `enableIndexedDbPersistence` — محلّها `initializeFirestore` + `persistentLocalCache`.
- ❌ لا تضيف قاعدة `NetworkOnly` عامة لـ `googleapis.com` قبل قاعدة `firestore.googleapis.com` — الترتيب حرج في Workbox.
- ❌ 🆕 لا تستدعِ `us-central1-travelapp-87206.cloudfunctions.net/verifyTripPin` مباشرة من العميل (cross-origin) — استخدم `/api/verifyTripPin` (Vercel rewrite في `vercel.json`) حصراً، وإلا يُسقِط المتصفح ترويسة `Authorization` وتفشل الدالة بـ 401. لا تحذف `vercel.json` ولا تُرجِع `useAuth.ts` لاستخدام `httpsCallable`.
- ❌ 🆕 لا تنسَ `firebase deploy --only functions` بعد أي تعديل في كود `functions/index.js` — الدالة المنشورة لا تلتقط الكود الجديد تلقائياً (🆕 v13: لم يعُد هناك سر Secret Manager يحتاج نشراً منفصلاً — انظر ملاحظة v13 أدناه).
- ❌ 🆕 لا تفترض فشل أمر Firebase CLI لمجرد ظهور `[error] Error: An unexpected error has occurred.` في آخر المُخرَجات — قد يكون خطأ حميد من خطوة تنظيف داخلية لاحقة. تحقّق من `firebase-debug.log` (أو Firebase Console) قبل إعادة المحاولة أو افتراض الفشل.
- ❌ 🆕 لا تُمرِّر `user` مباشرة لـ `useExpenses`/`useTravelers` في `App.tsx` — مرِّر `hasAccess ? user : null` لتفادي عودة سباق Firestore listener (اشتراك قبل اكتمال التحقق من رمز الرحلة يسبب `permission-denied` عالقاً). نفس القاعدة تنطبق على `useTripConfig` (🆕 v13).
- ❌ 🆕 لا تسمح بتعديل `createdByUid` عند تعديل مصروف قائم (لا في الكود ولا في قواعد Firestore) — يكسر ضمان "لا يمكن انتحال/تحويل ملكية المصروف".
- ❌ 🆕 v10 لا تنفّذ Workbox `BackgroundSync` فوق `persistentLocalCache` في `firebase.ts` — الاثنان يتعارضان على نفس طابور الكتابة، والتخزين/الإرسال التلقائي عند استعادة الاتصال مُنفَّذ أصلاً عبر Firestore. اكتفِ ببانر توعوي (`useOnlineStatus`) إن أردت مؤشراً مرئياً فقط.
- ❌ 🆕 v11 لا تعتمد على `lastExpenseCreateAtRef` (الفحص المحلي في `useExpenseActions.ts`) كحماية أمنية فعلية ضد سبام إضافة المصاريف — هو UX فقط؛ الفرض الحقيقي حصراً في `firestore.rules` (`withinExpenseRateLimit`).
- ❌ 🆕 v12 لا تُعِد وضع منطق عمليات المصروف (إضافة/تعديل/حذف/استعادة) داخل `App.tsx` — مكانه `src/hooks/useExpenseActions.ts` حصراً.
- ❌ 🆕 v13 لا تكتب `APP_ID`/معرّف رحلة ثابتاً بأي كود جديد — استخدم `TRIP_ID` من `src/utils/tripId.ts` دائماً (كل مسارات Firestore يجب أن تعتمد عليه، لا على نص حرفي).
- ❌ 🆕 v13 لا تنشر `firestore.rules` بعد سحب هذا التحديث دون تشغيل `node scripts/create-trip.mjs` أولاً للرحلة الافتراضية الحالية (`travelapp-87206`) بنفس رمزها القديم — وإلا ينقطع وصول كل الأعضاء الحاليين فوراً.
- ❌ 🆕 v13 لا تُعِد استخدام `firebase functions:secrets:set TRIP_PIN`/`defineSecret('TRIP_PIN')` — هذا النمط أُزيل بالكامل؛ رمز كل رحلة يُدار عبر `tripSecrets/{tripId}` في Firestore و`scripts/create-trip.mjs` فقط.
- ❌ 🆕 v13 لا تكتب أو تقرأ `trips/{tripId}`/`tripSecrets/{tripId}` مباشرة من كود العميل (React) — الأولى للقراءة فقط بعد التحقق من العضوية، والثانية ممنوعة تماماً من العميل؛ كلتاهما تُكتَبان حصراً عبر `scripts/create-trip.mjs`.
- ❌ 🆕 v14 لا تفترض أن `Expense.shares` موجودة دائماً أو صالحة القيم — تعامل معها دائماً عبر `splitByShares` (لا تصل لقيمها مباشرة)، فهي دفاعية أصلاً ضد أوزان تالفة/سالبة/غير رقمية.
- ❌ 🆕 v17 لا تُركِّب أي عنصر يستخدم `<Modal>` بدون تغليفه بـ `<AnimatePresence>` عند نقطة الرندرة الشرطية — بدونها تختفي الحركة (exit) فوراً بلا انزلاق/تلاشٍ.
- ❌ 🆕 v17 لا تُعِد نافذة مركزية عادية (بدون Bottom Sheet) أو مكتبة `react-spring-bottom-sheet` — تم اختيار `framer-motion` + النمط الحالي في `Modal.tsx` لكل النوافذ عمداً؛ لا تخلط نمطين مختلفين للنوافذ في نفس التطبيق.
- ❌ 🆕 v17 لا تنسَ `npm install` بعد سحب هذا التحديث — أُضيفت `framer-motion` إلى `package.json` ولن تُثبَّت تلقائياً بدونه.
- ❌ 🆕 v18 لا تُركِّب أي عنصر `position: fixed` جديد (زر عائم، Toast، تنبيه...) داخل شجرة `<PullToRefresh>` — تنكسر خاصية `fixed` بسبب `transform` الدائم على الغلاف؛ ركِّبه بجانبه في `App.tsx` كما فعل `QuickAddFab`.
- ❌ 🆕 v18 لا تستخدم `getDocsFromServer` في أي مسار غير Pull-to-Refresh الصريح — الاشتراك الفوري العادي (`onSnapshot`) يبقى مصدر البيانات الحي الوحيد؛ `getDocsFromServer` مخصّصة فقط لتجاوز الكاش عند طلب المستخدم اليدوي.
- ❌ 🆕 v18 لا تزل `overscroll-behavior-y: contain` من `src/index.css` — بدونها يتعارض سحب-التحديث الأصلي للمتصفح بصرياً مع مؤشر `PullToRefresh` المخصّص.
- ❌ 🆕 v20 لا تضع منطق "الإضافة السريعة" في أي مكان غير `handleQuickAddExpense` بـ `useExpenseActions.ts` — ولا تدمجه مع `handleAddExpense` (فُصلا عمداً لتفادي المساس بمسار النموذج الكامل المُختبَر).
- ❌ 🆕 v21 لا تُعِد شبكة `StatBox` المستقلة (`grid grid-cols-2 lg:grid-cols-3`) — الإحصائيات مدموجة الآن في `Header` عبر `stats: HeaderStats | null` وحبّات (pills)؛ أي إحصائية جديدة تُضاف إلى `STAT_ITEMS` في `Header.tsx` فقط.
- ❌ 🆕 v22 لا تُعِد عدّاد المسافرين (`activeTravelersCount`) إلى `HeaderStats`/`STAT_ITEMS` — أُزيل عمداً لتقليل عدد الحبّات في الصفّ المتقلِّص (خطر تجاوز عرض الشاشات الضيقة) ولأنه أنسب سياقياً كشارة بجانب عنوان "موقف المسافرين" في `App.tsx`، حيث يبقى الآن حصراً.
- ❌ 🆕 v23 لا تحذف شارة المزامنة/الرصيد المتبقي/الشريط النسبي أو أزرار تعديل الرصيد/السجل/حذف من `TravelerCard` بحجّة "تبسيط" — قرار صريح من المستخدم بإبقائها كلها كاملة رغم اقتراح مختصَر ورد في تقرير خارجي.
- ❌ 🆕 v23 لا تجعل شبكة بطاقات المسافرين ثابتة على `grid-cols-2` بلا شرط `isAdmin` — تُصبح ضيقة جداً في وضع المسؤول (3 أزرار + رسالة الحذف داخل عمود ~150px). الشرط في `App.tsx` (`isAdmin ? ... : ...`) مقصود ويجب الإبقاء عليه.
- ❌ 🆕 v23 لا تضِف `@tailwindcss/container-queries` أو صيغة `@[Npx]:` دون تثبيت الحزمة وإضافة class باسم `@container` صراحةً على العنصر الأب — غير مفعّلة افتراضياً في هذا المشروع (Tailwind 3.4، بلا الإضافة).
- ❌ 🆕 v24 لا تضع class `truncate` مباشرة على عنصر `flex`/`inline-flex` يحوي أكثر من ابن — لا يعمل `text-overflow: ellipsis` بشكل صحيح على حاويات flex، فيُقصّ النص بلا "…" (وأحياناً في منتصف حرف عربي مركّب فيبدو حرفاً آخر تماماً). ضع `truncate min-w-0` على `span` يلفّ النص المتغيّر الطول وحده، واترك الحاوية `flex` بلا `truncate` عليها هي (انظر `TravelerCard` في `TravelerSection.tsx`).
