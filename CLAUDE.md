# CLAUDE.md — Project Documentation

<div dir="rtl" style="text-align: right">

## آخر تحديث: 2026-08-08

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
- In-app admin panel (admin-only): list all trips, create a trip, set/reset its PIN, edit bank details and itinerary

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | ^18.2.0 |
| Language | TypeScript | ^5.3.3 |
| Bundler | Vite | ^5.1.4 |
| State | React Context (DataContext + UIContext) | — |
| Styling | Tailwind CSS | ^3.4.1 |
| Icons | Lucide React | ^0.383.0 |
| Animations | Framer Motion | ^11.2.10 |
| Virtual List | React Virtuoso | ^4.18.10 |
| Backend | Firebase Auth + Firestore | ^10.8.1 |
| Offline | Firestore `persistentLocalCache` | — |
| Cloud Functions | Firebase v2 onCall (Node 20) | — |
| PWA | vite-plugin-pwa (generateSW) | ^0.19.8 |
| Testing | Vitest + React Testing Library | ^1.6.0 |
| Linting | ESLint + Prettier | ^8.57.0 |
| Deployment (frontend) | Vercel SPA | — |
| Deployment (backend) | Firebase CLI | — |

**No external charting library** — all charts are pure HTML/CSS. **No external XLSX library** — OOXML generated inline via `src/utils/xlsx.ts`.

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

**Data flow:** React Context (DataContext for reads, UIContext for actions) → Hooks (useExpenses, useTravelers, etc.) → Firestore onSnapshot listeners → Optimistic updates with `_pending` flags.

**Two contexts:**
- `DataContext` — read-only data (travelers, expenses, user, currencies)
- `UIContext` — form state and action handlers (expense form, traveler form, modals)

**Trip identification:** `TRIP_ID` from `?trip=xyz` query param → used to build Firestore paths at `artifacts/{TRIP_ID}/public/data/{expenses|travelers|rateLimits}/...`

**Modal state:** all general modals (reports, trash bin, delete traveler, deposit, deposit history) live in a single discriminated union (`ModalState` in `useModals.ts`) so only one can be open at a time, and are rendered by `ModalManager.tsx`. Two modals are deliberately *outside* this union because they belong to their own domain state: expense delete confirmation (in `useExpenseActions`) and admin sign-in (in `useAdminAuth` + `AuthFlow.tsx`).

---

## Directory Structure

```
├── src/
│   ├── App.tsx                    # Root orchestrator (~500 lines)
│   ├── main.tsx                  # React entry point
│   ├── firebase.ts               # Firebase init (auth, db, functions)
│   ├── firestore.ts              # Collection/doc ref builders (expensesCol, travelerDoc, etc.)
│   ├── types.ts                  # All TypeScript interfaces
│   ├── constants.ts              # FALLBACK_RATES, CURRENCY_LABELS (160), EXPENSE_CATEGORIES
│   ├── icons.ts                  # Re-exports from lucide-react
│   ├── index.css                 # Tailwind + print styles + Safari fixes
│   │
│   ├── hooks/
│   │   ├── index.ts              # Unified re-export
│   │   ├── useAuth.ts            # Auth state, admin claims, PIN verification, rate limiting
│   │   ├── useAdminAuth.ts       # Admin sign-in modal state, sign-in/out, password reset + cooldown
│   │   ├── useModals.ts          # Unified modal state (discriminated union + reducer)
│   │   ├── useExpenses.ts        # Firestore onSnapshot → Expense[]
│   │   ├── useTravelers.ts       # Firestore onSnapshot → Traveler[]
│   │   ├── useBalances.ts        # Derived balances via useMemo
│   │   ├── useExchangeRates.ts   # Live FX rates from open.er-api.com
│   │   ├── useExpenseActions.ts  # CRUD logic for expenses (form, quick-add, edit, delete)
│   │   ├── useTravelerActions.ts # Add traveler form + add/delete/restore handlers
│   │   ├── useDepositActions.ts  # Deposit form + balance update & audit log write
│   │   ├── useFilteredExpenses.ts # Search + sort with debounce
│   │   ├── useTripConfig.ts      # Trip name + bank details + itinerary (live onSnapshot)
│   │   ├── useTripAdminActions.ts # Admin writes to any trips/{tripId} (merge-only) + manageTrip calls
│   │   ├── useAllTrips.ts        # Live list of every trip (admin-only query)
│   │   ├── useDepositLogs.ts     # Deposit audit log fetcher
│   │   ├── useOnlineStatus.ts    # navigator.onLine tracking
│   │   ├── useCountdown.ts       # Generic countdown timer
│   │   ├── useDebounce.ts        # Generic debounce hook
│   │   └── useHeaderCollapse.ts  # Scroll direction tracking for sticky header
│   │
│   ├── context/
│   │   ├── DataContext.ts        # Read-only data context
│   │   └── UIContext.ts          # UI actions context
│   │
│   ├── components/
│   │   ├── TripGate.tsx          # PIN entry screen with rate limit countdown
│   │   ├── Header.tsx            # Sticky collapsible header with stats pills
│   │   ├── SmartInputBar.tsx     # Fixed bottom input bar (quick expense)
│   │   ├── TravelerSection.tsx   # Traveler cards + add form + profile modal
│   │   ├── ExpenseSection.tsx    # Expense form + filtered virtual list
│   │   ├── ModalManager.tsx      # Renders the 5 general modals from useModals state (lazy)
│   │   ├── AuthFlow.tsx          # Lazy wrapper for the admin sign-in modal (view-only)
│   │   ├── NextSegmentWidget.tsx # "Next leg" card — first future itinerary segment
│   │   ├── ItinerarySection.tsx  # Full itinerary list (rendered inside ReportsView)
│   │   ├── Misc.tsx              # BankDetailsCard (copy IBAN / Web Share API)
│   │   ├── admin/TripAdminView.tsx   # Admin panel shell: trips list ↔ trip detail (full-screen)
│   │   ├── admin/TripDetailPanel.tsx # One trip: name + bank, itinerary editor, PIN reset
│   │   ├── admin/NewTripForm.tsx     # Create a trip (id + name + PIN) via manageTrip
│   │   ├── admin/SegmentForm.tsx     # Add/edit form for a single itinerary segment
│   │   ├── charts/ChartsSection.tsx  # Settlements, categories, trend (HTML/CSS)
│   │   ├── reports/ReportsView.tsx   # Full trip report page
│   │   ├── reports/PrintDocs.tsx     # Printable trip report / statement
│   │   ├── modals/
│   │   │   ├── DepositModal.tsx        # Deposit adjustment (add/subtract/set)
│   │   │   ├── DepositHistoryModal.tsx # Deposit audit log viewer
│   │   │   ├── AdminSignInModal.tsx    # Admin email/password sign-in
│   │   │   ├── TrashBinModal.tsx       # Soft-deleted items restore
│   │   │   ├── TravelerProfileModal.tsx # Per-traveler statement + export
│   │   │   └── ModalFallback.tsx       # Lazy loading fallback
│   │   ├── Modal.tsx             # Bottom sheet / centered modal
│   │   ├── Toast.tsx             # Animated toast (new/edit/success/error + undo/retry)
│   │   ├── EmptyState.tsx        # Reusable empty state component
│   │   ├── Skeleton.tsx          # Loading skeletons
│   │   ├── ErrorBoundary.tsx     # Class-based error boundary
│   │   ├── PullToRefresh.tsx     # Pull-to-refresh gesture
│   │   ├── OnboardingBanner.tsx  # First-time user banner
│   │   └── UpdatePrompt.tsx      # PWA update prompt
│   │
│   └── utils/
│       ├── calculations.ts       # Pure: splitEven, splitByShares, calculateBalances, settlements, etc.
│       ├── participants.ts       # matchesTraveler, toDisplayNames, toIds
│       ├── reportData.ts         # buildTravelerReport, buildAccountStatement, buildDailySummary
│       ├── reports.ts           # Excel row builders + exportTripToExcel + exportTravelerToExcel
│       ├── xlsx.ts              # Pure-JS OOXML generator (inlineStr, RTL, ZIP stored)
│       ├── itinerary.ts         # Pure: segment draft validation, normalize/sort, findNextSegment
│       ├── haptics.ts           # Vibration API + visual flash overlay
│       ├── cn.ts                # Tailwind class merge (clsx alternative)
│       └── tripId.ts           # TRIP_ID from ?trip= query param
│
├── functions/
│   └── index.js                 # Cloud Function: verifyTripPin (rate-limited)
│
├── scripts/
│   ├── create-trip.mjs          # Admin SDK script: create/update trip + PIN
│   ├── set-admin.mjs            # Admin SDK script: grant/revoke admin claim
│   ├── list-trips.mjs           # Admin SDK script: list existing trips
│   └── add-flights.mjs          # ⚠️ Admin SDK script: writes itinerary — data hardcoded, edit before each run
│
├── firestore.rules              # Security rules (multi-trip, admin claims, rate limiting)
├── vercel.json                  # Vercel SPA rewrite for /api/verifyTripPin
├── vite.config.js               # Vite + PWA config (code splitting, Workbox)
├── vitest.config.ts             # Vitest with jsdom + setupFiles
├── tailwind.config.js           # Tailwind content paths
└── .github/workflows/ci.yml    # CI: lint → typecheck → test → build
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Root component: orchestrates auth flow, state, modals, and layout. The "controller" of the app. |
| `src/types.ts` | All interfaces: `Traveler`, `Expense`, `ExpenseFormData`, `Settlement`, `ToastMessage`, etc. |
| `src/hooks/useExpenseActions.ts` | All expense CRUD: form submission, quick add, optimistic updates, retry logic, rate limiting. |
| `src/hooks/useAuth.ts` | Auth state machine: anonymous sign-in, admin claim detection, PIN verification via Cloud Function, rate limit countdown. |
| `src/hooks/useModals.ts` | `ModalState` discriminated union + reducer — the single source of truth for which modal is open. |
| `src/components/ModalManager.tsx` | Renders those modals (all `React.lazy`). Purely presentational; data/handlers passed from `App.tsx`. |
| `src/hooks/useTripConfig.ts` | Live `onSnapshot` on `trips/{TRIP_ID}`: trip name, bank details, itinerary — with `constants.ts` fallbacks. |
| `src/hooks/useTripAdminActions.ts` | The only client write path to `trips/{TRIP_ID}`. Always `setDoc(..., { merge: true })` — never a full overwrite. |
| `src/components/admin/TripAdminView.tsx` | Admin panel. Itinerary is edited locally then saved in one explicit write. |
| `src/utils/itinerary.ts` | Pure itinerary helpers: draft validation, defensive `normalizeItinerary`, `findNextSegment`. Fully tested. |
| `src/firestore.ts` | Single source of truth for Firestore paths: `expensesCol`, `travelerDoc`, `depositLogsCol`, `rateLimitDoc`, `tripConfigDoc`. |
| `src/constants.ts` | `CURRENCY_LABELS` (160 currencies), `FALLBACK_RATES`, `EXPENSE_CATEGORIES`, `BANK_DETAILS`. |
| `src/utils/calculations.ts` | Pure functions for balances, settlements, category totals, spending trend. Fully tested. |
| `src/utils/xlsx.ts` | Pure-JS OOXML XLSX generator — no dependencies. |
| `functions/index.js` | `verifyTripPin` Cloud Function: rate-limited PIN verification, grants `trips` custom claim. |
| `firestore.rules` | Security rules: `isAdmin()`, `isMember(tripId)`, `withinExpenseRateLimit`, immutable deposit logs. |
| `scripts/create-trip.mjs` | Admin SDK script to create/update a trip (name, bank details, PIN hash). |
| `scripts/set-admin.mjs` | Admin SDK script to grant/revoke `admin: true` custom claim. |

---

## Development Setup

```bash
# Prerequisites: Node.js v18+, Firebase CLI, Vercel CLI

# 1. Install dependencies
npm install

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
```

**Important:** The app reads `TRIP_ID` from `?trip=xyz` in the URL. Without it, it defaults to `?trip=travelapp-87206`.

---

## Environment Variables

**No runtime env vars needed** — Firebase config is hardcoded in `src/firebase.ts` (this is safe per Firebase docs for client SDKs). 

For deployment:
- `.env.local` is **git-ignored** (`.gitignore` excludes `.env.*`) and is not tracked. It exists locally only; the app does not read it at runtime, since Firebase config lives in `src/firebase.ts`.
- `serviceAccountKey.json` is required for all admin scripts (`create-trip.mjs`, `set-admin.mjs`, `list-trips.mjs`, `add-flights.mjs`). It is git-ignored. **Do not commit this file.**
- `.npmrc` sets `legacy-peer-deps=true` — required for Vercel installs to resolve.

---

## API / Interface Reference

### Cloud Functions (accessible via Vercel rewrites)

```
POST /api/verifyTripPin
Headers: { Authorization: "Bearer <idToken>" }
Body: { data: { pin: string, tripId: string } }
Response: { result: { success: boolean } } | HttpsError

POST /api/manageTrip                     # admin claim required, checked server-side
Headers: { Authorization: "Bearer <idToken>" }
Body: { data: { mode: 'create' | 'resetPin', tripId, pin, name? } }
Response: { result: { success: boolean, tripId: string } } | HttpsError
```

`manageTrip` exists because creating a trip or changing its PIN writes
`tripSecrets/{tripId}`, which is `read, write: if false` for every client
including admins. Salt generation and hashing stay server-side. Everything
non-secret (name, bank details, itinerary) is written straight from the client
through `firestore.rules` instead — no function deploy needed to change it.

`mode: 'create'` refuses to overwrite an existing trip: overwriting would
replace its PIN and lock out every current member.

### Key Data Context (available to all components)

```typescript
// From DataContext (useData())
{
  travelers: Traveler[]
  expenses: Expense[]
  user: User | null
  isAdmin: boolean
  currencies: CurrencyMap      // { "SAR": { label, rate }, ... }
  ratesUpdatedAt: Date | null
}

// From UIContext (useUI())
{
  expenseForm: ExpenseFormData
  isExpenseFormOpen: boolean
  openExpenseForm: (initialDesc?, initialAmount?) => void
  handleQuickAddExpense: (desc, amount) => string | null
  // ... plus traveler form, deposit, modals
}
```

### Pure Utility Functions

```typescript
// Core calculations (fully tested)
splitEven(total, n)               // Equal split with remainder distribution
splitByShares(total, pIds, shares?) // Weighted split
calculateBalances(travelers, expenses) => TravelerBalance[]
calculateSettlements(balances) => Settlement[]
calculateCategoryTotals(expenses) => CategoryTotal[]
calculateSpendingTrend(expenses) => SpendingTrendPoint[]

// Excel export
exportTripToExcel({ expenses, travelers, balances, settlements })  // 4-sheet workbook
exportTravelerToExcel({ traveler, balance, statement })            // per-traveler workbook

// Participant helpers
matchesTraveler(traveler, participantId) => boolean
toDisplayNames(participants, travelers) => string[]
toIds(participants, travelers) => number[]
```

---

## Data Models

```typescript
interface Traveler {
  id: number                    // Unique integer
  name: string                  // Full name
  shortName: string             // First word of name (used for matching in participants)
  deposited: number             // Total pre-paid amount (in SAR)
  deletedAt?: number | null     // Soft delete timestamp
  _pending?: boolean            // Client-only: optimistic sync indicator
}

interface Expense {
  id: string                    // Firestore document ID
  date: string                  // YYYY-MM-DD
  description: string           // Max 200 chars
  amount: number                // Amount in SAR (after currency conversion)
  originalAmount: number        // Amount in original currency
  currency: string              // Currency code (SAR, USD, etc.)
  exchangeRate: number          // Rate used for conversion
  participants: (number | string)[]  // Traveler IDs (or old shortNames)
  createdAt: number             // Unix timestamp (ms)
  createdByUid?: string         // Creator's UID (for self-edit permission)
  category?: string             // From EXPENSE_CATEGORIES
  shares?: Record<string, number> // Uneven split weights
  deletedAt?: number | null     // Soft delete
  _pending?: boolean            // Client-only
}

// Derived (not stored in Firestore)
interface TravelerBalance extends Traveler {
  totalExpenses: number
  remaining: number
}

interface Settlement {
  fromId: number; fromName: string
  toId: number;   toName: string
  amount: number
}

// Trip itinerary — stored inside the trips/{tripId} doc, not a subcollection
type TransportMode = 'flight' | 'car' | 'train' | 'bus'

interface ItinerarySegment {
  id: string                    // Random hex, generated by the writing script
  mode: TransportMode
  identifier: string            // Flight no. ("QR 1155") or vehicle description
  reference?: string            // PNR / rental booking ref
  departure: { location: string; time: string }  // time = ISO timestamp
  arrival:   { location: string; time: string }
}
```

**Firestore structure:**
```
artifacts/{tripId}/public/data/
  expenses/{docId}               — Expense documents
  travelers/{travelerId}          — Traveler documents (id as string key)
  rateLimits/{uid}               — Rate limit tracking per user
  travelers/{id}/depositLogs/{id} — Immutable deposit audit log (admin-only)

trips/{tripId}                    — Trip config (name, bankDetails, itinerary[])
                                    Admin-writable from the app (validated by isValidTripConfig);
                                    delete stays forbidden — it would orphan artifacts/{tripId}
tripSecrets/{tripId}              — PIN hash + salt (no client access, function only)
rateLimits/verify_{key}          — PIN verify rate limits (function only)
```

---

## Common Tasks

### Add a new expense field
1. Add field to `Expense` type in `types.ts`
2. Add to `ExpenseFormData` type (if user-editable)
3. Add to `isValidExpense()` in `firestore.rules`
4. Add to `emptyExpenseForm()` in `useExpenseActions.ts`
5. Update `ExpenseSection.tsx` form UI
6. Add to export builders in `reports.ts` / `reportData.ts`

(Excel is the only export path. The legacy CSV `utils/export.ts` was deleted on 2026-08-08 — it had been dead code for a while; recover from git history if ever needed.)

### Add a new currency
Simply add to `CURRENCY_LABELS` in `constants.ts`. The `buildCurrencyMap` function and `useExchangeRates` hook handle the rest automatically.

### Create a new trip
Sign in as admin → **إدارة الرحلات** → «إنشاء رحلة جديدة». Enter a trip id, a name and a PIN; the app calls `manageTrip` which writes `trips/{tripId}` and `tripSecrets/{tripId}` in one atomic batch. Then share `https://your-app.vercel.app/?trip=YOUR_TRIP_ID` plus the PIN.

The PIN is stored only as a salted SHA-256 hash and is never shown again — capture it when you set it. It can be changed later from the same panel (رمز الدخول tab), which forces every member of that trip to re-enter it once.

`scripts/create-trip.mjs` still works and is the fallback if functions are not deployed.

### Grant admin access
```bash
# First, user must log in to the app at least once
node scripts/set-admin.mjs grant user@example.com
```

### List existing trips
The admin panel lists every trip with its id, name and segment count, and each row has an **فتح** link to `?trip=X`. `scripts/list-trips.mjs` remains as a CLI equivalent.

Switching trips is a full page load: `TRIP_ID` is read once at module load (`utils/tripId.ts`). You do **not** need to switch trips to edit one — the admin panel edits any trip in place, because the write rule keys on `isAdmin()` and never references the active trip.

### Add / update a trip itinerary or bank details
Use the in-app admin panel: sign in as admin → **إدارة الرحلة** button in the expenses section header. Two tabs — bank details, and an itinerary editor (add / edit / delete / reorder segments).

The itinerary is edited locally and saved in one explicit write, because the field is stored as a whole array: saving on every keystroke would mean a stream of writes to the same doc and a bigger window to lose an edit when two admins are editing at once.

`scripts/add-flights.mjs` still exists for bulk entry but is no longer the primary path — it hardcodes its data and overwrites the whole array.

⚠️ `scripts/create-trip.mjs` calls `.set()` **without merge**, so re-running it to change bank details wipes an existing itinerary. Prefer the admin panel for edits; keep the script for first-time trip creation and PIN setup.

Once saved, `NextSegmentWidget` shows the first segment whose `departure.time` is in the future, and `ItinerarySection` lists all segments in the reports view. Both update immediately — `useTripConfig` listens with `onSnapshot`.

### Deploy all systems
```bash
npm run build                    # Frontend build
vercel --prod                    # Deploy frontend
firebase deploy --only firestore:rules   # Deploy security rules
firebase deploy --only functions         # Deploy Cloud Function
```

### Export trip data
The app exports Excel directly from the UI (button in expense section header). For per-traveler exports, open a traveler's profile card and use the export button.

---

## Testing

```bash
npm test                    # vitest run (once)
npm run test:watch          # vitest (watch mode)
npm run typecheck           # tsc --noEmit
npm run lint                # ESLint
```

**Test files:**
- `src/utils/calculations.test.ts` — Core math (splitEven, splitByShares, balances, settlements, charts)
- `src/utils/reportData.test.ts` — Report builders (traveler report, daily summary, account statement)
- `src/utils/reports.test.ts` — Excel row builders + XLSX generation
- `src/utils/itinerary.test.ts` — Segment validation, time round-tripping, normalize/sort, next-segment
- `src/utils/tripId.test.ts` — Trip id format guard (path-escape rejection, length limit)
- `src/components/EmptyState.test.tsx` — Empty state component (RTL test)

**Structure:** Pure utility tests live next to their source. Component tests use `@testing-library/react` with `jsdom` environment. Vitest config in `vitest.config.ts` with `setupFiles: ['./src/setupTests.ts']`.

---

## Deployment

Three independent systems that must be deployed separately:

| System | Deployment Command | Purpose |
|---|---|---|
| Frontend | `vercel --prod` | SPA hosted on Vercel |
| Firestore Rules | `firebase deploy --only firestore:rules` | Security rules |
| Cloud Functions | `firebase deploy --only functions` | `verifyTripPin`, `manageTrip` |

**Important:** After updating `firestore.rules` or `functions/index.js`, existing users may need to re-enter their trip PIN (custom claim format changed). Always create the trip via `scripts/create-trip.mjs` before deploying new rules.

**Vercel rewrites** (`vercel.json`): `/api/verifyTripPin` and `/api/manageTrip` are proxied to their Cloud Function URLs to avoid CORS. The client always calls the `/api/...` path, never the function URL directly. Adding a function means adding a rewrite here too, otherwise the call 404s in production while working fine locally.

---

## Troubleshooting

| Issue | Likely Cause | Solution |
|---|---|---|
| "خطأ في الصلاحيات" | User not a member of this trip, or trip not created in Firestore | Run `scripts/create-trip.mjs` for this tripId; user must re-enter PIN |
| PIN entry stuck in loop | Custom claims format mismatch | User logs out and back in (or `getIdToken(true)`) |
| Expenses not syncing | Network offline; Firestore SDK queues writes | Check `isOnline` banner; writes sync when connection returns |
| `recharts` not found (build error) | Old dependency referenced somewhere | Run `npm install` (package.json no longer lists recharts) |
| iOS date picker issues | Safari's native date/select styling | Fixes in `index.css` (`.safari-date-fix`, `.safari-select-fix`) |
| Blank screen after deploy | Trip ID mismatch or missing trip config | Ensure `scripts/create-trip.mjs` was run for the tripId in use |
| "يوجد مسافر بنفس الاسم" | Duplicate shortName (first word of name) | Use a different name or rename existing traveler. ⚠️ This check is client-side only (`useTravelerActions.ts`) — `firestore.rules` does not enforce uniqueness, so two admins adding the same shortName simultaneously can both succeed. |
| Itinerary widget not showing | No `itinerary` on the trip doc, or every segment's `departure.time` is in the past | Add a future segment via **إدارة الرحلة** → مسار الرحلة |
| A saved segment vanished from the list | `normalizeItinerary` drops malformed segments on read — `firestore.rules` cannot validate list items, so a segment written directly via the SDK with a missing field is filtered out instead of crashing the UI | Re-add it through the admin panel, which validates before writing |
| Itinerary disappeared after running `create-trip.mjs` | The script uses `.set()` without merge and its payload omits `itinerary` unless you re-enter it | Re-add via the admin panel; use the panel rather than the script for edits |
| Trips list empty / "تعذّر جلب قائمة الرحلات" for an admin | A `list` query on `trips/` is only satisfiable by `isAdmin()`; the admin claim may not be on the current token yet | Sign out and back in, or force `getIdToken(true)` — the claim is only refreshed on a new token |
| "إنشاء الرحلة" fails with 404 | `manageTrip` is deployed but the `/api/manageTrip` rewrite is missing from `vercel.json`, or the frontend was deployed without it | Add the rewrite and redeploy the frontend |
| "هذا الإجراء متاح للمسؤول فقط" when creating a trip | `manageTrip` re-checks `request.auth.token.admin` server-side and does not trust the client | Run `scripts/set-admin.mjs grant <email>`, then re-login |

---

## Contributing Guidelines

1. **No direct `lucide-react` imports in components** — use `src/icons.ts` re-exports only.
2. **No `recharts`** — charts are pure HTML/CSS in `ChartsSection.tsx`.
3. **No `enableIndexedDbPersistence`** — use `persistentLocalCache` (modern API).
4. **No direct Cloud Function URL** — always use the Vercel rewrite path `/api/verifyTripPin`.
5. **Soft delete only** — `deletedAt` timestamps, never permanent deletion (`allow delete: if false` in rules).
6. **Modals go in `src/components/modals/`**, are registered in `useModals.ts` (`ModalState` union) and rendered lazily by `ModalManager.tsx` — not directly in App.tsx.
7. **Pure logic in `utils/`** — testable without React/DOM.
8. **Arabic-first** — all UI text in Arabic, RTL layout, Arabic numeral conversion.
9. **Optimistic updates** — close form immediately on submit, show `_pending` flag until server confirms.
10. **Haptic feedback** — use `haptic` from `utils/haptics.ts` for all important interactions.
11. **Run scripts with Admin SDK** — `serviceAccountKey.json` required, never expose admin operations to clients.
13. **Never write `trips/{tripId}` without merge** — the doc holds independent sections (name, bankDetails, itinerary). Use `useTripAdminActions`, which always merges; a full `set()` silently drops whatever it omits.
14. **Secrets stay server-side** — `tripSecrets/{tripId}` is `read, write: if false` and must remain so. PIN handling belongs in `functions/index.js` or an Admin SDK script, never in the client.
12. **CI pipeline** — all PRs must pass: lint → typecheck → test → build. Run `npm run lint` locally before pushing; ESLint bans `any` (`no-explicit-any`) and empty `catch {}` blocks (`no-empty`), which are easy to introduce accidentally.

</div>
