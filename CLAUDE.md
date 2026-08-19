# CLAUDE.md — Project Documentation

<div dir="rtl" style="text-align: right">

## آخر تحديث: 2026-08-19

### توثيق هذا الملف أُعيد تنظيمه

كان `CLAUDE.md` قد تضخّم ليضم سجل التغييرات، وسجل القرارات المعمارية، والمرجع التقني الكامل، وجدول حل المشاكل — كل ذلك في ملف واحد. بما أن `graphify` يوفر استكشافاً للكود عبر `graphify query`، لم تعد الحاجة قائمة لوضع كل شيء هنا. الملف الآن تعريف سريع للمشروع فقط؛ التفاصيل انتقلت إلى:

- **[CHANGELOG.md](CHANGELOG.md)** — سجل "ماذا تغيّر" يوماً بيوم.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — لماذا اتُّخذ كل قرار معماري (اقرأه قبل "إصلاح" أي شيء يبدو كخطأ).
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — المهام الشائعة (إنشاء رحلة، منح صلاحية admin، إلخ) وجدول المشاكل وحلولها.
- **[docs/REFERENCE.md](docs/REFERENCE.md)** — هيكلية الملفات، نماذج البيانات، مرجع الدوال السحابية (API)، الاختبارات، والنشر.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — القواعد الواجب اتباعها عند تعديل الكود.

---

## Project Overview

**Travel Wallet (لوحة مصاريف السفر)** is a Progressive Web App (PWA) for tracking and splitting group travel expenses. Built as a React SPA with full Arabic RTL support, multi-currency exchange rates, offline-first Firestore persistence, and real-time sync across devices.

**Target users:** Group travelers who need to track shared expenses, split costs, settle debts, and export reports — all in one place, without a server backend.

**Core features:**
- Multi-trip support (each trip has its own data + PIN)
- Anonymous or admin auth via Firebase Auth + Custom Claims
- Real-time Firestore listeners with optimistic updates
- Offline-first: `persistentLocalCache` + `persistentMultipleTabManager`
- Smart input bar for quick expense entry (bottom-fixed)
- 160+ currencies with live exchange rates (open.er-api.com)
- Category-based spending breakdown (HTML/CSS charts — no Recharts)
- Per-traveler account statements + PDF printing via Portal
- Full Excel export (pure-JS OOXML, no external deps)
- Haptic feedback (Web Vibration API + visual flash for iOS)
- Rate limiting on PIN verification and expense creation
- Trip itinerary (flights/car/train/bus) stored per-trip + "next segment" widget
- In-app admin panel (admin-only): list all trips, create a trip, set/reset its PIN, edit bank details and itinerary, delete an *empty* trip
- 🆕 "My trips" picker: opening the app with no `?trip=` shows the trips you belong to instead of demanding a PIN for the default one

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | ^18.2.0 |
| Language | TypeScript | ^5.3.3 |
| Bundler | Vite | ^5.1.4 |
| State | React Context (DataContext + UIActionsContext + UIFormContext) | — |
| Styling | Tailwind CSS | ^3.4.1 |
| Icons | Lucide React | ^0.383.0 |
| QR encoding | qrcode-generator | ^2.0.4 |
| Animations | Framer Motion | ^11.2.10 |
| Virtual List | React Virtuoso | ^4.18.10 |
| Backend | Firebase Auth + Firestore | ^10.8.1 |
| Offline | Firestore `persistentLocalCache` | — |
| Cloud Functions | Firebase v2 onCall (Node 22) | — |
| PWA | vite-plugin-pwa (generateSW) | ^0.19.8 |
| Testing (unit) | Vitest + React Testing Library | ^1.6.0 |
| Testing (rules) | @firebase/rules-unit-testing + Firestore emulator | ^3.0.4 |
| Testing (E2E) | Playwright (chromium) + Auth/Firestore/Functions emulators | ^1.49.1 |
| Component workshop | Storybook (react-vite) | ^10.5.7 |
| Linting | ESLint + Prettier | ^8.57.0 |
| Deployment (frontend) | Vercel SPA | — |
| Deployment (backend) | Firebase CLI | — |

**No external charting library** — all charts are pure HTML/CSS. **No external XLSX library** — OOXML generated inline via `src/utils/xlsx.ts`. 🆕 **QR encoding *is* a dependency** — see *Design Decisions* for why that is consistent rather than an exception.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        App.tsx                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  TripGate    │  │   Header     │  │  SmartInputBar  │ │
│  │  (PIN auth)  │  │  (stats +    │  │  (quick add)   │ │
│  │              │  │   collapse)  │  │                │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  <main> (PullToRefresh wrapper)                    │ │
│  │  ┌──────────────┐ ┌───────────┐ ┌────────────────┐ │ │
│  │  │ NextSegment  │ │ TravelerSec│ │ ChartsSection │ │ │
│  │  │ (next trip   │ │ (cards +   │ │ (stats)       │ │ │
│  │  │  leg)        │ │  add form) │ │               │ │ │
│  │  └──────────────┘ └───────────┘ └────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────┐│ │
│  │  │ ExpenseSection (form + virtual list + search)  ││ │
│  │  └────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────┘ │
│  ┌──────────────┐ ┌───────────┐ ┌──────────────┐       │
│  │ ModalManager │ │ AuthFlow  │ │    Toast     │       │
│  │ (lazy, from  │ │ (lazy     │ │              │       │
│  │  useModals)  │ │  admin)   │ │              │       │
│  └──────────────┘ └───────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────┘
          │                      │
     ┌────▼────┐          ┌──────▼──────┐
     │  Auth   │          │  Firestore  │
     │ (anon / │          │ (real-time) │
     │  admin) │          └─────────────┘
     └─────────┘
```

**Data flow:** React Context (reads + actions) → Hooks (useExpenses, useTravelers, etc.) → Firestore onSnapshot listeners → Optimistic updates with `_pending` flags.

**Three contexts — split by *how often they change*, not by topic:**
- `DataContext` — read-only data (travelers, expenses, user, currencies)
- `UIActionsContext` — handler functions only; identity is stable in practice
- `UIFormContext` — the volatile expense-form state, and the handlers bound to it

🆕 The UI split is load-bearing for performance, not cosmetic — see *Design Decisions* below. Only three components read context at all: `TravelerSection`, `ExpenseSection`, `ChartsSection`.

**Trip identification:** `TRIP_ID` from `?trip=xyz` query param → used to build Firestore paths at `artifacts/{TRIP_ID}/public/data/{expenses|travelers|rateLimits}/...`

🆕 `HAS_EXPLICIT_TRIP_ID` (same module) records whether the URL actually named a trip. Opening the app *bare* means no trip was intended, so the "my trips" picker is shown instead of the default trip's PIN gate.

**Modal state:** all general modals (reports, trash bin, delete traveler, deposit, deposit history) live in a single discriminated union (`ModalState` in `useModals.ts`) so only one can be open at a time, and are rendered by `ModalManager.tsx`. Two modals are deliberately *outside* this union because they belong to their own domain state: expense delete confirmation (in `useExpenseActions`) and admin sign-in (in `useAdminAuth` + `AuthFlow.tsx`).

---

## Development Setup

```bash
# Prerequisites: Node.js v18+, Firebase CLI, Vercel CLI

# 1. Install dependencies
npm install

# 1b. Firebase config (required — the app refuses to start without it)
cp .env.example .env.local
# then fill the values from Firebase Console › Project settings › Your apps

# 2. Set up Firebase
firebase login
firebase use travelapp-87206

# 3. Create a trip (interactive — provides PIN for the trip URL)
node scripts/create-trip.mjs

# 4. Deploy Firestore rules + Cloud Function (after creating a trip)
firebase deploy --only firestore:rules
firebase deploy --only functions

# 5. Grant admin privileges to a user who has logged in at least once
node scripts/set-admin.mjs grant admin@example.com

# 6. Start dev server
npm run dev

# 7. Open http://localhost:5173/?trip=YOUR_TRIP_ID

# 8. (optional) Prepare the E2E browser — first time only
npm run e2e:install
```

**Important:** The app reads `TRIP_ID` from `?trip=xyz` in the URL. Without it, it defaults to `?trip=travelapp-87206` — and 🆕 if you already belong to trips, the "my trips" picker is shown instead of that trip's PIN gate.

🆕 **Prerequisite for the rules and E2E suites: Java.** The Firestore emulator is a JVM process; without a JDK both fail with «Unable to locate a Java Runtime» buried in `firebase-debug.log`.

🆕 **PIN verification works under `npm run dev` with no proxy of any kind.** The client calls functions through `httpsCallable`, which derives the URL from `projectId`, so the dev server has nothing to forward. The old `/api/*` dev proxy — and the `vercel.json` rewrite it mirrored — are both gone; see *Environment Variables*.

### استخدام graphify أثناء العمل على المشروع

هذا المشروع لديه رسم معرفي (knowledge graph) في `graphify-out/` يضم العُقد المحورية (god nodes)، وبنية المجتمعات (community structure)، والعلاقات بين الملفات.

- لأسئلة عن الكود، شغّل `graphify query "<question>"` أولاً عند وجود `graphify-out/graph.json`. استخدم `graphify path "<A>" "<B>"` للعلاقات، و`graphify explain "<concept>"` لمفاهيم محددة. هذه الأوامر تُعيد رسماً فرعياً مركّزاً، أصغر بكثير عادةً من `GRAPH_REPORT.md` أو نتائج grep الخام.
- إذا وُجد `graphify-out/wiki/index.md`، استخدمه للتنقّل الواسع بدلاً من تصفح المصدر مباشرة.
- اقرأ `graphify-out/GRAPH_REPORT.md` فقط لمراجعة معمارية واسعة، أو عندما لا تكفي نتائج query/path/explain.
- بعد تعديل الكود، شغّل `graphify update .` لإبقاء الرسم محدّثاً (استخراج AST فقط، بلا تكلفة API).

---

## Environment Variables

Firebase client config now comes from **build-time** env vars (`import.meta.env`), not from hardcoded values. Copy `.env.example` to `.env.local` and fill it from Firebase Console › Project settings › Your apps.

```
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
VITE_FIREBASE_APP_ID          # all required — the app throws at startup if any is missing
VITE_FIREBASE_MEASUREMENT_ID  # optional (analytics only)
```

These are not secrets — a Firebase client config is public by design and ships in the JS bundle. Security lives in `firestore.rules` and the functions. The env vars exist so a build can be pointed at a different project without editing tracked code.

**Missing vars fail loudly at startup, by design.** The only sensible fallback would be the production config, and silently falling back to it means a misconfigured staging build writes to the production database. `src/firebase.ts` throws and names the missing variables instead.

**Vite substitutes `VITE_*` at build time, not runtime.** They must exist in the build environment: `.env.local` locally, and Vercel › Project Settings › Environment Variables for deploys. Adding them to Vercel *after* a deploy does nothing until you redeploy.

🆕 **A second environment now works from the env vars alone.** Everything the client touches — Firestore, Auth **and Cloud Functions** — follows `VITE_FIREBASE_PROJECT_ID`.

This used not to be true. The client called functions through `fetch('/api/verifyTripPin')`, a `vercel.json` rewrite pointing at a **literal** function URL, and Vercel does not interpolate env vars in rewrite destinations. So a preview build authenticated against staging while calling production's functions: the function received a token issued by a different project and rejected it as `unauthenticated`, and read `tripSecrets` from the wrong database. Staging was not merely awkward, it could not work.

The fix was to stop hand-rolling the call. `httpsCallable` derives the function URL from the app's `projectId`, so it follows the environment for free — and `getFunctions` was already exported from `src/firebase.ts`, unused, since the beginning. `vercel.json` no longer needs any rewrite, and the `/api` dev proxy is gone with it.

Two things still need setting per environment, but both accept it now:

| Place | How to point it at another project |
|---|---|
| `.firebaserc` | 🆕 multi-project: `firebase use staging` or `--project staging` |
| admin scripts | 🆕 `FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.staging.json node scripts/…` |

Unrelated but easy to confuse: `DEFAULT_TRIP_ID` in `src/utils/tripId.ts` is the string `travelapp-87206`, which happens to match the project id. It is a *trip* id, not a project id — changing it breaks existing trip links.

### Setting up a staging environment (🆕)

1. Create a second Firebase project; enable **Anonymous** and **Email/Password** auth, and create a Firestore database.
2. Put its id in `.firebaserc` under `staging`, then deploy the backend to it:
   `npx firebase deploy --only firestore:rules,functions --project staging`
3. Download that project's service-account key as `serviceAccountKey.staging.json` (git-ignored by the `serviceAccountKey*.json` pattern), then seed it:
   `FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.staging.json node scripts/create-trip.mjs`
4. In Vercel › Settings › Environment Variables, set the six `VITE_FIREBASE_*` values for the **Preview** environment only, pointing at the staging project. Leave **Production** on the production project.
5. Redeploy. Preview deployments now read and write staging exclusively.

Every admin script prints the project id it is about to touch before doing anything — the last guard against running a seeding script against production while believing you are on staging.

For deployment:
- `.env.local` is **git-ignored** (`*.local` in `.gitignore`) and holds the real values. `.env.example` is tracked as the template.
- A service-account key is required for all admin scripts. The default is `serviceAccountKey.json`; override per environment with `FIREBASE_SERVICE_ACCOUNT`. All `serviceAccountKey*.json` files are git-ignored. **Never commit one.**
- `.npmrc` sets `legacy-peer-deps=true` — required for Vercel installs to resolve.

---

## Contributing Guidelines

للمساهمة وكتابة الكود، يرجى مراجعة ملف [`CONTRIBUTING.md`](CONTRIBUTING.md) — 23 قاعدة يجب اتباعها عند تعديل الكود.

</div>
