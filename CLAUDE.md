# CLAUDE.md — Project Documentation

<div dir="rtl" style="text-align: right">

## آخر تحديث: 2026-08-16

### What changed on 2026-08-16

**Rate-limit race condition in `verifyTripPin`, found and fixed.** A full fresh security audit (no prior "Final Release Audit" findings list was recoverable — see guideline 23) found `checkRateLimit` in `functions/index.js` reading the attempt counter with `get()` then writing the increment with a separate `update()` — a check-then-act race. Concurrent PIN-guess requests arriving while the counter sat one below the limit could all read the same pre-increment value and all pass, letting a burst exceed the stated 15/20-attempt window and weakening brute-force protection on trip PINs as short as 4 characters. Fixed by wrapping the read-check-write in `db.runTransaction()`, which Firestore serializes automatically. Deployed to production and verified live.

**`main` was red on `e2e` for 15+ hours, and the real cause was two layers deep.** `afdad97` (the `firebase-functions` v5→v7.3.2 upgrade) broke `verifyTripPin` in the Firestore emulator specifically — the function crashed with "unhandled error" on its very first invocation, cascading into every e2e test that needs the PIN gate. Confirmed **not** a code bug: calling `verifyTripPin.run()` directly (bypassing the emulator's HTTP/CORS layer entirely) succeeded perfectly with the exact same code, and production deploys of that code already worked. The actual fault was firebase-tools 13.x's CORS/OPTIONS handling for `onCall` under firebase-functions v7 — fixed by upgrading `firebase-tools` to `^14.27.0`. e2e now passes in ~2m48s (was retrying for 6+ minutes before failing).

**And the reason nobody noticed for 15 hours: the push gate had a real hole.** `build`'s `needs: [lint, typecheck, test, rules, e2e]` meant that when a dependency failed, GitHub reported `build` as **"skipping"**, not "failure" — and the repository ruleset's required-status-check treats "skipping" as satisfying the requirement. This is exactly how the broken `e2e` state rode into `main` unnoticed. Fixed with `if: always()` on `build` plus an explicit first step that fails (`exit 1`) if any `needs.*.result` is `failure` or `cancelled`. **Verified as a real negative case, not assumed** (guideline 18): a PR was pushed with one Firestore rules test deliberately inverted (`assertFails` → `assertSucceeds`), confirmed `build` now shows `fail` in 4 seconds instead of skipping, and confirmed the merge button is actually refused ("the base branch policy prohibits the merge") before the inverted test was reverted for a clean merge.

**Backup/restore has a real plan now, and all three stages shipped the same day:** `docs/PLAN-backup-recovery.md`. The trigger was a direct question this file already answered honestly but incompletely — *what happens if an admin deletes a trip by mistake, a migration script goes wrong, corruption slips in, or 500 expenses get edited badly?* Answer for three of those four, before today: nothing recovers them, and Excel export does not count — it drops `deletedAt`, `createdByUid`, internal ids, and everything outside one trip's Firestore-scoped read, so it cannot be re-imported, only rebuilt by hand. The plan is three independent stages, each solving a scenario the others don't. **Stage 0 — done and verified live**, not just proposed: the owner ran `gcloud firestore backups schedules create` directly and confirmed the result (`dailyRecurrence`, 7-day retention, a real schedule id), which is now recorded in both the plan and `RECOVERY.md` §4 rather than assumed from documentation (guideline 18). This is the actual fix for corruption, bad migrations, and mass-edit mistakes. **Stage 1 — done**: a client-only per-trip JSON download in the admin panel (new "نسخة احتياطية" tab in `TripDetailPanel.tsx`, `src/utils/backup.ts` for the pure shape + Blob download, `exportBackup` in `useTripAdminActions.ts`) — no new Cloud Function needed, since `isAdmin()` already grants read access to any trip's `expenses`/`travelers`/`depositLogs`, the same basis the pre-delete emptiness check already relies on. This is the one thing Stage 0 cannot cover: a Firestore backup lives inside the same GCP project and is lost with it, while a JSON file on the admin's own machine survives losing the Google account entirely. Verified via unit tests (`backup.test.ts`, `useTripAdminActions.test.ts`), a clean production boot with no console errors, and — since this needed credentials the assistant doesn't have and shouldn't handle — **the owner ran the live click-through personally**: downloaded a backup, deleted the trip, restored it from the file. Worked cleanly first try. **Stage 2 — done, built last and tested hardest**, because restore-from-JSON is the single riskiest operation shape in this codebase: bulk financial writes past the rules, Admin-SDK-side. The plan's own five guardrails shipped, with one deliberate simplification from the original design — the "overwrite a live trip with explicit confirmation" path was dropped entirely rather than built. `restoreTrip` in `functions/index.js` now only accepts an empty-or-nonexistent trip, full stop, matching `manageTrip mode=delete`'s own condition exactly; overwriting a trip with data stays impossible no matter how the caller confirms. The other four guardrails: every document is re-validated in JS against the same shape rules enforces for live writes (`isValidExpenseJs` and siblings — necessary because Admin SDK bypasses `firestore.rules` entirely, so nothing else stops a hand-edited backup file from writing garbage) plus a referential-integrity check the rules can't express (every `travelerName`/`depositLog` must point at a traveler actually present in the same file); writes are chunked into ≤500-op batches (Firestore's real limit, and coincidentally the same number this conversation used as its "500 expenses" example) with sequential — not cross-batch-atomic — commits, so a failure partway through is a loud error naming the exact count written, never a silent partial success; a new PIN is mandatory since the hash is never exported in the first place; and a deposit log's `changedByUid` is preserved from the backup file, never overwritten with the restoring admin's uid — the live rule requires them to match to stop impersonation on a direct write from a member, but restore is rewriting genuine history, and relabeling who actually made a past financial decision would falsify the one record a dispute would fall back on. **Verified before any client code was written**: a standalone script called `restoreTrip.run()` directly (bypassing the emulator's HTTP layer, same technique that root-caused the e2e crash above) against real Auth+Firestore emulators, covering seven cases including a full restore whose every written Firestore document was checked field-by-field against the source — not just the function's return value — and confirming `changedByUid` really did survive as the historical actor. `RestoreTripForm.tsx` (file upload + trip id + new PIN, in `TripAdminView.tsx` next to "create trip") was the one piece not exercised by that direct-invocation test — and it's exactly what the owner's live click-through covered: the file-upload path, the empty-trip gate after a real delete, and the full restore, all through the actual UI.

---

## آخر تحديث سابق: 2026-08-11

### What changed on 2026-08-11

**Financial invariant tests, and the bug they found.** `src/utils/calculations.invariants.test.ts` adds 21 property-based rules (fast-check) over the money calculations — conservation of shares, the ledger equation, settlement coverage, and no `NaN`/`Infinity`/impossible share. Rules 1–3 held. **Rule 4 did not.**

Clearing the exchange-rate field (or typing a lone `.` in the amount) produced `amount: NaN`, which the optimistic write put straight into the local cache — turning **every balance and settlement into `NaN`** — and which `firestore.rules` then rejected with a permissions message unrelated to the cause. Offline it was not rejected at all. Fixed at the input boundary *and* inside the pure functions; see *Design Decisions*. Note `handleQuickAddExpense` had always guarded correctly while `handleAddExpense` never did.

Also corrected: rule 3 cannot be `sum(settlements) === total debt`, because the balances only sum to zero by coincidence. See *Testing*.

**`App.tsx` split: 639 → 260 lines.** Hook wiring moved to `hooks/useAppCoordinator.ts`, the three context values to `components/AppProviders.tsx`, and the layout to five panel components. `App.tsx` now does routing and composition only. A characterization test (`src/App.test.tsx`, 17 cases) was written against the *old* file and proven green **before** anything moved, then left untouched — it still passes. See *Design Decisions*.

**Documentation drift fixed.** The `httpsCallable` migration removed the `vercel.json` rewrites and the `/api` dev proxy, but only the *Environment Variables* section was updated. Six other places still described `/api/*` as the live call path — the directory tree, the dev-setup note, the whole *API Reference*, the E2E description, the *Deployment* section and two Troubleshooting rows — plus guideline 4, which instructed the opposite of what the code now does. All corrected against `vercel.json` (a `$schema` line and nothing else) and `vite.config.js` (no proxy). Nothing in the app was wrong; the map was.

**A push gate, and why `main` was red for two days.** Running the new suite surfaced three *unrelated* failures in `useMyTrips.test.ts`, live since `c51e9f8` — `status` was added to `MyTrip` without updating the `toEqual` assertions. The cause was not the CI definition, which is correct, but that **this repo has zero merge commits**: everything is pushed straight to `main`, so the `pull_request:` trigger has never fired and CI can only report after the fact. Added `.githooks/pre-push` (wired through `prepare`, so a fresh clone gets it) and enabled a **repository ruleset on `main`** — verified by having a direct push refused with `GH013`. Direct pushes to `main` are now impossible; work goes through a PR. See *The push gate* under *Testing*.

---

### What changed on 2026-08-09

**Testing went from one layer to three.** Unit coverage previously reached the pure calculation utilities only; every hook was untested. Now: **255 unit tests**, **44 `firestore.rules` tests** against a real emulator, and **8 Playwright E2E tests** driving a real browser. CI runs all three.

**Six real bugs were found and fixed.** Four of them were invisible to code review and to unit tests, and only surfaced in a real browser:

| Bug | Why it hid |
|---|---|
| Submit lock never released while offline — silently blocked every expense after the first | Mocked promises always settle; only a real dropped connection reproduces it |
| Admin evicted from admin mode on every page reload | Needed a real reload cycle; trip switching made it routine |
| App crashed to `ErrorBoundary` on the first expense of a trip while offline | A `React.lazy` chunk fetched with no connectivity |
| A whole travel group locked out after 5 PIN attempts on one shared wifi | Rate-limit key was per-IP, not per-trip; a group shares both |
| `haptics.ts` threw where `matchMedia` is unavailable, despite documenting itself as always safe | — |
| `TrashBinModal` close button had no accessible name | — |

**Features added:** the "my trips" picker (open the app with no `?trip=` and pick from the trips you belong to), deletion of **empty** trips, and a **trip lifecycle** (`active` / `completed` / `archived`) enforced in the rules — which is what finally gives trips with data a way to be closed without destroying anything.

**Performance:** the UI context was split by volatility, so typing in the expense form no longer re-renders every expense row and traveler card. Zustand was evaluated and deliberately not adopted — see *Design Decisions*.

**Security gap closed:** `firestore.rules` now verifies `createdByUid` on expense **creation**, not just on update. A member could previously attribute an expense to someone else — making "who recorded this" unreliable, which is the only reference there is when a settlement is disputed. `createdByUid` is now required on create, must equal the caller, and is immutable afterwards **for admins too**. See *Design Decisions*.

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

## Directory Structure

```
├── src/
│   ├── App.tsx                    # 🆕 ~260 lines — routing + composition only (was 639, see Design Decisions)
│   ├── main.tsx                  # React entry point
│   ├── firebase.ts               # Firebase init (auth, db, functions) — config from import.meta.env
│   ├── vite-env.d.ts             # Types for import.meta.env (typo in a var name becomes a compile error)
│   ├── firestore.ts              # Collection/doc ref builders (expensesCol, travelerDoc, etc.)
│   ├── types.ts                  # All TypeScript interfaces
│   ├── constants.ts              # FALLBACK_RATES, CURRENCY_LABELS (160), EXPENSE_CATEGORIES
│   ├── icons.ts                  # Re-exports from lucide-react
│   ├── index.css                 # Tailwind + print styles + Safari fixes
│   │
│   ├── fixtures/index.ts         # Sample data for stories and tests (derived values computed, not hardcoded)
│   ├── stories/                  # Storybook stories + context decorators
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
│   │   ├── useMyTrips.ts         # 🆕 Trips this user joined — one getDoc each (a list query is admin-only)
│   │   ├── useDepositLogs.ts     # Deposit audit log fetcher
│   │   ├── useOnlineStatus.ts    # navigator.onLine tracking
│   │   ├── useCountdown.ts       # Generic countdown timer
│   │   ├── useDebounce.ts        # Generic debounce hook
│   │   ├── useHeaderCollapse.ts  # Scroll direction tracking for sticky header
│   │   ├── useDialogA11y.ts     # 🆕 Escape / focus trap / focus enter + restore — used by Modal.tsx
│   │   └── useAppCoordinator.ts  # 🆕 All hook wiring + derived values — the seam App.tsx used to be
│   │
│   ├── context/
│   │   ├── DataContext.ts        # Read-only data context
│   │   └── UIContext.ts          # 🆕 TWO contexts: UIActionsContext (stable) + UIFormContext (volatile)
│   │
│   ├── components/
│   │   ├── TripGate.tsx          # PIN entry screen with rate limit countdown (+ escape link to "my trips")
│   │   ├── TripPicker.tsx        # 🆕 "My trips" list — shown when the URL names no trip
│   │   ├── SaveAccountBanner.tsx # 🆕 Optional "save your account" offer, shown only to anonymous users
│   │   ├── Header.tsx            # Sticky collapsible header with stats pills
│   │   ├── SmartInputBar.tsx     # Fixed bottom input bar (quick expense)
│   │   ├── TravelerSection.tsx   # Traveler cards + add form + profile modal
│   │   ├── ExpenseSection.tsx    # Expense form + filtered virtual list
│   │   ├── AppProviders.tsx      # 🆕 The three context values + providers — the volatility split lives here
│   │   ├── AppErrorFallback.tsx  # 🆕 App-wide and expense-list error screens
│   │   ├── StatusBanners.tsx     # 🆕 Closed-trip / offline / sync-error banners
│   │   ├── TravelersPanel.tsx    # 🆕 Traveler cards + add form (extracted from App.tsx)
│   │   ├── ChartsPanel.tsx       # 🆕 Lazy ChartsSection + its empty state; exports chartsImporters
│   │   ├── ExpensesPanel.tsx     # 🆕 Toolbar + search + virtual list (extracted from App.tsx)
│   │   ├── ModalManager.tsx      # Renders the 5 general modals from useModals state (lazy)
│   │   ├── AuthFlow.tsx          # Lazy wrapper for the admin sign-in modal (view-only)
│   │   ├── NextSegmentWidget.tsx # "Next leg" card — first future itinerary segment
│   │   ├── ItinerarySection.tsx  # Full itinerary list (rendered inside ReportsView)
│   │   ├── Misc.tsx              # BankDetailsCard (copy IBAN / Web Share API)
│   │   ├── admin/TripAdminView.tsx   # Admin panel shell: trips list ↔ trip detail (full-screen)
│   │   ├── admin/TripDetailPanel.tsx # One trip: name + bank, itinerary editor, PIN reset, delete (empty only), 🆕 JSON backup download
│   │   ├── admin/NewTripForm.tsx     # Create a trip (id + name + PIN) via manageTrip
│   │   ├── admin/RestoreTripForm.tsx # 🆕 Restore a trip from a Stage-1 JSON backup via restoreTrip
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
│       ├── deposits.ts          # 🆕 Pure: applyDepositMode + replayDepositLogs — makes the ledger invariant testable
│       ├── participants.ts       # matchesTraveler, toDisplayNames, toIds
│       ├── reportData.ts         # buildTravelerReport, buildAccountStatement, buildDailySummary
│       ├── reports.ts           # Excel row builders + exportTripToExcel + exportTravelerToExcel
│       ├── xlsx.ts              # Pure-JS OOXML generator (inlineStr, RTL, ZIP stored)
│       ├── backup.ts            # 🆕 Pure: buildTripBackup + downloadTripBackup — per-trip JSON (PLAN-backup-recovery.md Stage 1)
│       ├── itinerary.ts         # Pure: segment draft validation, normalize/sort, findNextSegment
│       ├── travelerName.ts      # Pure: deriveShortName, isValidNameKey, newTravelerId
│       ├── writeErrors.ts       # Pure: Firestore error code → real cause + is a retry worthwhile
│       ├── callableErrors.ts    # 🆕 Pure: Cloud Function error code → real cause (ad blocker, network, wrong PIN)
│       ├── haptics.ts           # Vibration API + visual flash overlay
│       ├── preload.ts           # 🆕 Idle-time preloading of lazy chunks (onIdle + preloadAll)
│       ├── cn.ts                # Tailwind class merge (clsx alternative)
│       └── tripId.ts           # TRIP_ID + HAS_EXPLICIT_TRIP_ID from ?trip= query param
│
├── functions/
│   └── index.js                 # Cloud Functions: verifyTripPin + manageTrip + mergeAnonymousTrips + manageMember + 🆕 restoreTrip
│
├── scripts/
│   ├── audit-legacy-docs.mjs    # 🆕 Read-only: counts documents still needing each legacy fallback
│   ├── create-trip.mjs          # Admin SDK script: create/update trip + PIN
│   ├── set-admin.mjs            # Admin SDK script: grant/revoke admin claim
│   ├── list-trips.mjs           # Admin SDK script: list existing trips
│   ├── backfill-traveler-names.mjs # One-off migration: claim docs for pre-existing travelers
│   ├── add-flights.mjs          # ⚠️ Admin SDK script: writes itinerary — data hardcoded, edit before each run
│   └── run-with-emulators.mjs   # 🆕 Runs a command inside the emulators with a trustworthy exit code
│
├── tests/                       # 🆕 firestore.rules tests (emulator, NOT app code)
│   ├── firestore-rules/firestore.rules.test.ts
│   └── tsconfig.json
│
├── e2e/                         # 🆕 Playwright end-to-end specs (real browser + emulators)
│   ├── critical-flow.spec.ts            # PIN → admin → travelers → expense → edit → balances → report → export
│   ├── balances-math.spec.ts            # Exact settlement arithmetic through the real UI
│   ├── soft-delete-trash.spec.ts        # Delete → undo toast → delete again → restore from trash
│   ├── offline-optimistic-write.spec.ts # Offline write shows _pending, then syncs on reconnect
│   ├── trip-picker.spec.ts              # Bare URL shows "my trips"; clicking one opens it
│   ├── admin-persists-across-trips.spec.ts # Admin survives reload and trip switching
│   ├── wrong-pin.spec.ts                # Rejection message, then success
│   ├── utils/{seed,flows}.ts            # Emulator seeding + shared UI steps
│   └── tsconfig.json
│
├── firestore.rules              # Security rules (multi-trip, admin claims, rate limiting)
├── vercel.json                  # 🆕 SPA config only — no rewrites; functions are called via httpsCallable
├── vite.config.js               # Vite + PWA config (code splitting, Workbox, env substitution)
├── vitest.config.ts             # Vitest with jsdom + setupFiles (unit tests)
├── vitest.rules.config.ts       # 🆕 Separate config for rules tests (node env, needs emulator)
├── playwright.config.ts         # 🆕 E2E config — boots `vite --mode e2e` against the emulators
├── tailwind.config.js           # Tailwind content paths
└── .github/workflows/ci.yml    # CI: lint → typecheck → test → rules → e2e → build
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/App.tsx` | 🆕 Two jobs only: **routing** (picker → PIN gate → app, in that order) and **composition**. No hook wiring, no context values, no layout. |
| `src/hooks/useAppCoordinator.ts` | 🆕 Every hook call and derived value, returned as named groups (`session`, `ledger`, `trip`, `rates`, `status`, `picker`, …). Order inside is load-bearing — later hooks consume earlier results. |
| `src/components/AppProviders.tsx` | 🆕 Builds and provides the three context values. Read `context/UIContext.ts` before touching it — the volatility split is a performance guarantee whose breakage is silent. |
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
| `functions/index.js` | `verifyTripPin` (rate-limited PIN verification, grants the `trips` claim) + `manageTrip` (create / resetPin / delete) + `mergeAnonymousTrips` (rescues memberships when linking hits an existing account) + `manageMember` (removes one trip from another user's claims — the only way, since claims live on the target's account) + 🆕 `restoreTrip` (rebuilds a trip from a Stage-1 JSON backup — empty-or-nonexistent trips only, re-validates every document since Admin SDK bypasses the rules). |
| `firestore.rules` | Security rules: `isAdmin()`, `isMember(tripId)`, `withinExpenseRateLimit`, immutable deposit logs. |
| `src/context/UIContext.ts` | 🆕 Two contexts split by volatility. Read the comment there before adding a field — putting a changing value in the actions context silently undoes the split. |
| `src/hooks/useMyTrips.ts` | 🆕 The user's own trips. Reads each `trips/{id}` with its own `getDoc` — a `list` query is admin-only and would fail for members. |
| `src/utils/preload.ts` | 🆕 Idle-time preloading of lazy chunks so they exist before connectivity is lost. |
| `scripts/create-trip.mjs` | Admin SDK script to create/update a trip (name, bank details, PIN hash). |
| `scripts/set-admin.mjs` | Admin SDK script to grant/revoke `admin: true` custom claim. |
| `scripts/run-with-emulators.mjs` | 🆕 Wrapper giving emulator-backed test runs a trustworthy exit code. See its header comment — three separate bugs lived here. |

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

## API / Interface Reference

### Cloud Functions (🆕 called via `httpsCallable`, never over HTTP by hand)

Both are Firebase v2 `onCall` functions. The client invokes them through the SDK, which
attaches the ID token, derives the URL from `projectId`, and handles CORS — so there is
**no `/api/*` path, no `vercel.json` rewrite, and no dev proxy**. See *Environment
Variables* for why hand-rolled `fetch` made a staging environment impossible.

```ts
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

// hooks/useAuth.ts
await httpsCallable<{ pin: string; tripId: string }, { success: boolean }>(
  functions, 'verifyTripPin',
)({ pin, tripId })

// hooks/useTripAdminActions.ts — admin claim required, re-checked server-side
await httpsCallable<
  { mode: 'create' | 'resetPin' | 'delete'; tripId: string; pin?: string; name?: string },
  { success: boolean; tripId: string }
>(functions, 'manageTrip')({ mode, tripId, pin, name })
```

```ts
// 🆕 hooks/useAccountLink.ts — only on the account-conflict path
await httpsCallable<{ previousIdToken: string }, { merged: number }>(
  functions, 'mergeAnonymousTrips',
)({ previousIdToken })
```

```ts
// 🆕 hooks/useTripAdminActions.ts — restore a trip from a Stage-1 JSON backup
// (docs/PLAN-backup-recovery.md). backup: unknown deliberately — the real shape
// is re-validated entirely server-side, since Admin SDK bypasses firestore.rules.
await httpsCallable<
  { tripId: string; pin: string; backup: unknown },
  { success: boolean; tripId: string; restored: { travelers: number; expenses: number; depositLogs: number } }
>(functions, 'restoreTrip')({ tripId, pin, backup })
```

Failures arrive as `FirebaseError` with a `functions/…` code (`unauthenticated`,
`permission-denied`, `resource-exhausted` for the PIN rate limit), not as an HTTP status.

`manageTrip` exists because creating a trip or changing its PIN writes
`tripSecrets/{tripId}`, which is `read, write: if false` for every client
including admins. Salt generation and hashing stay server-side. Everything
non-secret (name, bank details, itinerary) is written straight from the client
through `firestore.rules` instead — no function deploy needed to change it.

`mode: 'create'` refuses to overwrite an existing trip: overwriting would
replace its PIN and lock out every current member.

🆕 `mode: 'delete'` needs no `pin` or `name`, and **refuses any trip that has a
single traveler or expense** (checked server-side with `limit(1)` queries — the
question is "is there data?", not "how much"). This is what keeps the deletion
safe, and why `allow delete: if false` stays in `firestore.rules`: if the client
could delete directly, that emptiness check could simply be bypassed, orphaning
`artifacts/{tripId}` and destroying deposit logs that are immutable by design.
It deletes `trips/{tripId}` and `tripSecrets/{tripId}` in one atomic batch, which
also frees the trip id for reuse — the actual need behind it (a trip created with
a typo'd id). Archiving would not free the id, which is why it wasn't chosen.

🆕 **Trip membership lives in the token, and that has a ceiling.** `verifyTripPin` writes `trips: { [tripId]: true }` into the custom claims, and `isMember()` in `firestore.rules` reads it straight from the token — a **free** read. Storing membership in Firestore instead would force a billed `get()` into nearly every rule, on every read and every write, against a 10-read-per-request budget that expense creation already spends two of. The trade is deliberate.

Its cost is a hard limit: Firebase caps custom claims at **1000 bytes**. With a 16-character trip id each membership costs ~25 bytes, so `assertClaimsFitTokenLimit` refuses at **38 trips** (913 bytes), leaving 111 bytes of headroom. The budget is 900 rather than 1000 so that adding `admin: true` — or any future claim — does not turn a near-limit account into a broken one.

⚠️ **Without that guard the failure is actively misleading:** authentication does *not* break and existing tokens keep working. What fails is the *join* — `setCustomUserClaims` throws, and the user sees an opaque `internal` error naming nothing. Now they get `resource-exhausted` with a sentence that says what happened.

**When a real user approaches 38 trips**, the fix is `users/{uid}.joinedTrips` in Firestore — priced honestly in `docs/PLAN-account-linking.md`, and deliberately not built before it is needed.

🆕 **PIN rate limiting is scoped per trip.** The key is `anon_${ip}_${tripId}` (or
`auth_${uid}_${tripId}`), so exceeding the limit on one trip no longer locks the
user out of every other trip. The anonymous limit is **15** per 15 minutes, not 5:
a travel group joining the *same* trip shares one wifi and therefore one key, and
5 attempts between them was reachable by two typos. The IP is used rather than the
uid because `signInAnonymously` makes fresh uids free — a uid-based limit is
bypassed by reloading the page.

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

// 🆕 From UIActionsContext (useUIActions()) — functions only, stable identity.
// This is what per-item components (ExpenseListItem, TravelerCard) may consume.
{
  cancelExpenseForm: () => void
  startEditExpense: (expense: Expense) => void
  requestDeleteExpense: (id: string) => void
  openDeposit: (traveler: Traveler) => void
  requestDeleteTraveler: (traveler: Traveler) => void
  openDepositHistory: (traveler: Traveler) => void
}

// 🆕 From UIFormContext (useUIForm()) — changes on every keystroke.
// Consumed only by ExpenseForm. Do NOT consume this from a repeated component.
{
  expenseForm: ExpenseFormData
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormData>>
  isExpenseFormOpen: boolean
  isEditingExpense: boolean
  submitExpense: (e: FormEvent<HTMLFormElement>) => void
  toggleParticipant: (id: number) => void
  toggleAllParticipants: () => void
}
```

Everything else the screens need (traveler form fields, quick add, `openExpenseForm`) is passed as **props** from `App.tsx` — it was removed from context because nothing read it there.

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
  travelerNames/{shortName}       — Name claim; the doc ID *is* the name.
                                    `allow update: if false` is what enforces
                                    uniqueness: a write to an existing doc is an
                                    update, so the loser of a race is rejected.
                                    Written with the traveler in one writeBatch.
  rateLimits/{uid}               — Rate limit tracking per user
  travelers/{id}/depositLogs/{id} — Immutable deposit audit log (admin-only)

trips/{tripId}                    — Trip config (name, bankDetails, itinerary[])
                                    Admin-writable from the app (validated by isValidTripConfig);
                                    delete stays forbidden — it would orphan artifacts/{tripId}
trips/{tripId}/members/{uid}      — 🆕 Membership roster. Written ONLY by the functions
                                    (verifyTripPin on join, mergeAnonymousTrips on merge);
                                    `allow write: if false`, read admin-only.
                                    { joinedAt, lastVerifiedAt, email?, displayName?,
                                      mergedFrom?, backfilledAt? }
                                    ⚠️ An index, NOT a source of access — see Design Decisions
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

### Close or archive a trip (🆕)
Admin panel → select the trip → **الاسم والحساب** tab → **حالة الرحلة**.

| Status | Expenses | Travelers & deposits | In the trip list |
|---|---|---|---|
| `active` (default) | yes | yes | shown |
| `completed` | **blocked** | yes — so you can still settle up after the trip | shown, tagged |
| `archived` | blocked | blocked | hidden unless it is the trip you have open |

The reasoning behind `completed` keeping deposits writable: "the spending has ended" is not the same as "the books are closed". After a trip you often still correct a deposit or record who paid whom. `archived` is the full close.

**Enforced in `firestore.rules`, not in the UI** — `tripAcceptsExpenses` / `tripAcceptsWrites`. A read-only trip that is only read-only in the UI is not read-only. The UI hiding (`utils/tripStatus.ts`) exists so the user is told *why* the buttons are gone, rather than clicking something the server will refuse with an opaque permission error.

⚠️ **A missing `status` field means `active`**, in both the rules and `utils/tripStatus.ts`. Every trip created before this feature lacks the field; treating absence as anything else would have frozen all of them on deploy. No migration is needed or wanted.

⚠️ **Cost:** one extra document read per write to a trip's data (the rules `get()` the trip doc). Negligible against the guarantee — and the rules limit is 10 reads per request, of which expense creation now uses two.

Requires deploying rules: `npx firebase deploy --only firestore:rules`.

### Delete a trip (🆕)
Admin panel → select the trip → **حذف الرحلة** tab. You must type the trip id to confirm, because the action is irreversible and trip names in a list look alike.

**Only empty trips can be deleted** — the server refuses if a single traveler or expense exists, and returns a message saying so. That restriction is the whole safety model: see `mode: 'delete'` under *API Reference*. A trip that holds data is never deleted; 🆕 **archive it instead** (see above) — that is what the lifecycle states are for.

Requires deploying functions (`npx firebase deploy --only functions`) — it is server-side logic, not a rules change.

### List existing trips
The admin panel lists every trip with its id, name and segment count, and each row has an **فتح** link to `?trip=X`. `scripts/list-trips.mjs` remains as a CLI equivalent.

Members (non-admins) get their own list via the 🆕 **"my trips"** picker — the trips in their token's `trips` claim. Opening the app with no `?trip=` shows it; picking a trip navigates to `?trip=X`. Admins see *all* trips there instead, via `useAllTrips`.

Switching trips is a full page load: `TRIP_ID` is read once at module load (`utils/tripId.ts`). You do **not** need to switch trips to edit one — the admin panel edits any trip in place, because the write rule keys on `isAdmin()` and never references the active trip.

### Add / update a trip itinerary or bank details
Use the in-app admin panel: sign in as admin → **إدارة الرحلة** button in the expenses section header. Two tabs — bank details, and an itinerary editor (add / edit / delete / reorder segments).

The itinerary is edited locally and saved in one explicit write, because the field is stored as a whole array: saving on every keystroke would mean a stream of writes to the same doc and a bigger window to lose an edit when two admins are editing at once.

`scripts/add-flights.mjs` still exists for bulk entry but is no longer the primary path — it hardcodes its data and overwrites the whole array.

`scripts/create-trip.mjs` writes with `{ merge: true }`, so re-running it to change bank details no longer wipes an existing itinerary. It still replaces the PIN every run, which signs every member of that trip out — the prompt says so before proceeding.

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

Three independent layers. Each catches a class of bug the others structurally cannot.

```bash
npm test                    # 1. unit — vitest, jsdom, no emulator, ~3s
npm run test:rules          # 2. firestore.rules — real Firestore emulator
npm run test:e2e            # 3. E2E — real browser + auth/firestore/functions emulators
npm run e2e:install         # first time only: download the Playwright chromium build

npm run typecheck           # app sources
npm run typecheck:rules     # tests/ (separate tsconfig)
npm run typecheck:e2e       # e2e/  (separate tsconfig)
npm run lint                # ESLint
```

Layers 2 and 3 need **Java** (the Firestore emulator is a JVM process) and a cached emulator jar.

#### 1. Unit tests (`src/**/*.test.ts`)
Pure utilities and every hook. Hooks are tested with `renderHook`, mocking `firebase/firestore` and `src/firestore.ts` — none of them need React context, because hooks take their data as parameters and the contexts only carry results *outward*.

- `utils/`: `calculations`, `reportData`, `reports`, `itinerary`, `tripId`, `travelerName`, `writeErrors`, 🆕 `callableErrors`, `preload`
- `hooks/`: `useAuth`, `useExpenseActions`, `useTravelerActions`, `useDepositActions`, `useMyTrips`, `useModals`, `useBalances`, `useFilteredExpenses`, `useDebounce`, `useCountdown`, `useOnlineStatus`, `useHeaderCollapse`, 🆕 `useAccountLink`
- `components/EmptyState.test.tsx`
- 🆕 `App.test.tsx` — a **characterization test**: it describes behaviour as it is, not as it should be, and exists to make refactors of `App.tsx` safe. Pins gate ordering, the status banners, the closed-trip hiding of both expense inputs, the empty states, and that empty states stay hidden while loading. ⚠️ If it fails during a refactor, the refactor changed behaviour — changing the expectation to make it pass destroys the only reason it exists.

🆕 **Financial invariants (`utils/calculations.invariants.test.ts`)** — a fourth kind of test inside layer 1, using **fast-check** for property-based generation. A unit test says "this input gives this output"; an invariant says "whatever the input, this must hold" — so it covers what you did *not* think of, which is what breaks an arithmetic app. Four rules: sum of shares equals the expense amount; the ledger equation (`remaining = deposited − attributed`, and nothing created or lost); settlements equal `min(debt, credit)`; and no `NaN`/`Infinity`/impossible share anywhere. On failure fast-check shrinks to the smallest reproducing case.

Two things worth knowing before editing that file:

- **Compare in halalas, never in riyals.** Every calculation rounds to `Math.round(total * 100)`; comparing floats directly (`0.1 + 0.2 !== 0.3`) fails a correct rule for a reason unrelated to money. Rule 1 therefore guarantees conservation *of the amount rounded to the halala* — the strongest claim that is actually true.
- **Rule 3 is `min(debt, credit)`, not "total debt".** `remaining = deposited − share`, so the balances sum to the fund's surplus or deficit and reach zero only by coincidence; a surplus leaves creditors unmatched. Stating it as "= total debt" fails on a perfectly healthy ledger. A separate test covers the balanced case where the stronger claim does hold. Measured deviation is exactly one halala, bounded by `EPSILON` and *not* by group size.

#### 2. Rules tests (`tests/firestore-rules/`)
Run against the emulator with `@firebase/rules-unit-testing` — they test `firestore.rules` itself, not app code. Cover: anonymous/non-member denial, cross-trip isolation, expense ownership on update, hard-delete blocked everywhere, admin-only trip writes, `tripSecrets` unreachable even by admin, the expense rate limit including clock tampering, deposit-log immutability, and `travelerNames` uniqueness.

🆕 Expense attribution is covered in both directions: a member (and an admin) is refused when creating an expense under someone else's `createdByUid`, refused when omitting it, and refused when changing it on update. Legacy expenses that predate the field are covered too — see *Design Decisions*.

⚠️ **Use `expenseBy(uid)` — not `validExpense()` — in any test that creates an expense** unless attribution itself is what's being tested. `validExpense()` omits `createdByUid`, so creation now fails on that alone, and an `assertFails` test would pass for entirely the wrong reason while appearing to verify something else.

#### 3. E2E tests (`e2e/`)
A real browser driving the real UI against emulators — no mocks. `playwright.config.ts` boots `vite --mode e2e` with `VITE_USE_FIREBASE_EMULATORS=true`, which makes `src/firebase.ts` call `connectAuthEmulator` / `connectFirestoreEmulator` / `connectFunctionsEmulator`. 🆕 Functions included — the SDK routes callables to the emulator directly, so no `/api` proxy is involved here either.

**These earned their keep immediately** — three bugs found here were invisible to unit tests and code review: the offline submit-lock, the app crash on a lazy chunk while offline, and admin being evicted on reload. Each required a real browser losing a real connection.

**Structure:** unit tests live next to their source; rules and E2E live in their own top-level folders with their own `tsconfig.json`, because they compile against different globals and must not be swept into `npm test` (which has no emulator running).

### 🆕 The push gate — why CI alone was not enough

`.github/workflows/ci.yml` was never the problem. `npm test` exits non-zero on failure and `build` depends on `test`, so the pipeline is correctly wired. The gap was structural: **this repository has zero merge commits** — every commit has gone straight to `main`, so the workflow's `pull_request:` trigger has never fired once. Only `push: branches: [main]` applies, and that reports *after* the code has already landed.

That is how `c51e9f8` put `main` in a red state for two days: it added `status` to `MyTrip` without updating the three `toEqual` assertions in `useMyTrips.test.ts`. Note that `npm run typecheck` could not have caught it — `toEqual` is loosely typed, so only actually running the suite finds it.

Two layers now close it:

**1. `.githooks/pre-push` (local, in place).** Runs `lint → typecheck → test` before any push. Wired via `core.hooksPath`, which the `prepare` script in `package.json` sets on every `npm install` — so it survives a fresh clone, unlike a hand-edited `.git/hooks/`. Bypass with `git push --no-verify`.

`test:rules` and `test:e2e` are deliberately **not** in the hook: both need Java and emulators and take minutes, and a hook that slow gets routinely bypassed, which makes it worth nothing. They stay in CI.

**2. A repository ruleset on `main` (🆕 enabled and verified, 2026-08-11).** The hook is a courtesy that `--no-verify` defeats; only the server can actually refuse. Settings › Rules › Rulesets → ruleset named `main`:

| Setting | Value | Why |
|---|---|---|
| Enforcement status | **Active** | `Disabled` creates a ruleset that does nothing |
| Target branches | **Default** | an unconfigured target matches no branch |
| Bypass list | **empty** | with an entry for the owner, the gate is decorative — direct pushes by the one person who pushes would skip it |
| Require a pull request | ✅, **Required approvals: `0`** | ⚠️ any value above 0 locks the repo: GitHub forbids approving your own PR, and this is a single-maintainer repo |
| Require status checks | ✅ **`build`** | it depends on the other five jobs, so requiring it requires them all |
| Restrict deletions, Block force pushes | ✅ | |

**Require branches to be up to date before merging is deliberately off.** It guards against a semantic conflict when `main` moves while a PR is open; with one maintainer and short-lived branches that risk is negligible, and the cost is a forced re-sync on every such change.

**The negative case was verified, not assumed** (guideline 18) — an empty commit pushed straight to `main` was refused:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Required status check "build" is expected.
remote: - Changes must be made through a pull request.
```

Note the order in that run: the local hook ran, went green, and allowed the push — then the server refused it. The hook knows nothing about repository rules; its job is to catch red code before it costs a CI cycle. Refusal is the server's job alone.

The workflow from here:

```bash
git checkout -b fix/something
git push -u origin fix/something
gh pr create --fill && gh pr merge --squash --auto   # merges itself once `build` is green
```

`gh` is **not** a project dependency and may not be installed (`brew install gh && gh auth login`). Without it, `git push` prints a `.../pull/new/<branch>` URL — open it, **Create pull request**, then **Enable auto-merge** for the same effect.

### 🆕 Hunting a regression with `git bisect`

```bash
git bisect start HEAD <last-known-good-sha>
git bisect run npm test        # ~3s per step, ~6 steps for the whole history
git bisect reset
```

This works well here, and it is worth knowing *why* so nobody "improves" it away:

- **The linear history is an advantage, not the debt it looks like.** `bisect` is a binary search over a list. Merge commits make it *worse*: you land on a merge and cannot tell which parent introduced the fault, and `--first-parent` hides the individual commits that would have told you. Squash-merging PRs keeps the history linear while making each commit a coherent reviewed unit — the ideal input.
- **The commits are small.** Median 2 files changed; only 7 of 55 exceed 10 files. Landing on a typical commit narrows the fault to a couple of files immediately.
- **The suite is what makes it work.** `bisect` is only as good as the check you run at each step, and `npm test` is 318 tests in ~3 seconds with no emulator. Use `npm run test:rules` or `test:e2e` in a bisect only when the fault is genuinely in the rules or the browser — both need Java and take minutes per step.

⚠️ **Two commits poison an automated bisect: `c51e9f8` and `a3bf1f3`.** `npm test` fails on both for an unrelated reason (`status` was added to `MyTrip` without updating `useMyTrips.test.ts`; fixed in `c9b0277`). Crossing that range, `bisect run` reports a false "bad" and points at the wrong commit. Use `git bisect skip` there, or bound the search to one side of it.

That two-day red window is the real cost of the old push-straight-to-`main` habit — not the linear history. It cannot happen again: see *The push gate* above.

⚠️ **Bisecting across `c0139c7` gives poor resolution** (45 files, ~11k lines: a feature plus its tests plus CI plus rules). Keeping PRs small is what preserves resolution going forward, since squash-merge collapses each PR to a single commit.

### 🆕 Diagnosing a failing Cloud Function call

**Ask this before anything else: does it fail on another device, browser or network?**

A two-hour hunt on 2026-08-13 went through five wrong theories — the Anonymous provider, Cloud Run IAM, the service worker, an outdated `firebase-functions`, the Cloud Run auth toggle — before the decisive fact surfaced: **the app worked fine on other phones.** That one sentence eliminated every server-side theory at once. The cause was an ad blocker on a single machine stripping the `Authorization` header from the cross-origin call.

⚠️ **DevTools "Copy as cURL" cannot detect this.** It shows the header, because it reflects what the page *intended* to send — an extension modifies the request afterwards. The header appears present in DevTools and absent at the server, and both are telling the truth.

**Then read the response body — the exact wording names the layer that failed:**

| Response body | What it means | Where to look |
|---|---|---|
| `{"message":"يجب تسجيل الدخول أولاً."}` (Arabic) | Our code ran; `request.auth` was undefined, i.e. **no `Authorization` header arrived** | Between browser and function: extensions, proxies |
| `{"message":"Unauthenticated"}` (English) | The header arrived and `firebase-functions` **rejected the token** | The token itself, or `admin.initializeApp()` |
| An HTML/text page from Google, without our message | The request **never reached our code** | Cloud Run IAM — `allUsers` needs `roles/run.invoker` |

The framework's own source makes this precise: `checkAuthToken` returns `MISSING` when `req.header("Authorization")` is falsy (execution continues, our code throws the Arabic message) and `INVALID` when verification throws (the framework throws the English one). So `verifications.auth` in the Cloud Logging entry says the same thing as the response body.

✅ **The UI no longer hides this.** `callVerify` used to swallow every error except `resource-exhausted` and show «رمز الرحلة غير صحيح» — the same sentence for a wrong PIN, a missing trip, an unauthenticated call and an infrastructure fault. That is the same failure mode `utils/writeErrors.ts` exists to prevent for writes, and it is what made this take two hours.

`utils/callableErrors.ts` now translates the code into its real cause, and `unauthenticated` names the ad blocker explicitly — the one cause a user can fix unaided. ⚠️ **"Wrong PIN" and "no such trip" stay merged on purpose**: the server returns one `permission-denied` for both so that trip existence cannot be probed by guessing `?trip=`. That merge is security; the rest was noise. `callableErrors.test.ts` pins both halves of that line.

### Storybook

```bash
npm run storybook          # dev server on :6006
npm run build-storybook    # static build → storybook-static/ (git-ignored)
```

Storybook 10 with `@storybook/react-vite`. Two pieces of setup are load-bearing and easy to lose:

- `.storybook/preview.tsx` imports `src/index.css` and wraps every story in `dir="rtl" lang="ar"`. Storybook renders inside its own iframe and inherits neither from `index.html`. Without the CSS import Tailwind classes are just unstyled names; without the `dir` every horizontal layout mirrors, so a story would not show what users see.
- `src/stories/decorators.tsx` supplies `DataContext`, `UIActionsContext` and `UIFormContext`. Only `TravelerSection`, `ExpenseSection` and `ChartsSection` read from context — the other components take props and need no decorator. Handlers are no-ops that log to the console; stories are for inspecting state, not for writing to Firestore. (`Providers` takes `uiActions` / `uiForm` overrides separately since the 🆕 context split.)

Sample data lives in `src/fixtures/`, shared with tests. Derived values (balances, settlements, category totals, trend) are **computed** from the fixture expenses via the real functions, never hand-written — an early draft hardcoded them and they disagreed with the same expense list, which reads as a bug in the app's arithmetic.

Story names are Arabic on purpose (the app is Arabic-first and these are what appear in the sidebar), so `storybook/prefer-pascal-case` is disabled for `src/stories/**` in `.eslintrc.cjs` — Arabic has no letter case, so the rule can only ever emit unfixable warnings.

---

## Design Decisions

Decisions that look like oversights but are not. Read this before "fixing" them.

### Optimistic updates roll back automatically — do not build a retry queue

`firebase.ts` enables `persistentLocalCache`, and that is the rollback mechanism. On every write the Firestore SDK:

1. applies the mutation to the local cache immediately, so `onSnapshot` fires at once with `metadata.hasPendingWrites === true` (this is what surfaces as `_pending`)
2. persists the pending write to **IndexedDB**, so it survives closing the app
3. retries it automatically when connectivity returns
4. **reverts the local mutation if the server ultimately rejects it**, then emits a corrected snapshot — the row disappears on its own

So a queue in IndexedDB would sit on top of the SDK's own IndexedDB queue, and two things retrying the same write means duplicate expenses. Don't.

**The consequence that actually matters:** a write's promise does **not** reject when offline — it stays pending until the server answers. So reaching `.catch()` means the server *refused* the write (rules, a claimed shortName, the expense rate limit), not that the network dropped. The old message said "يبدو أنك غير متصل بالإنترنت" for every failure, which sent people to check their wifi while the real cause was elsewhere, and offered a retry button that was guaranteed to fail identically.

`utils/writeErrors.ts` now maps the Firestore error code to the real cause, states that the change was reverted (because the user is about to watch it vanish), and marks whether a retry is worth offering. Retry is shown only for transient codes — `unavailable`, `deadline-exceeded`, `aborted`, `internal`, `cancelled`.

Match on `error.code`, never on message text: the text varies between SDK versions.

**What is genuinely missing:** undo exists for deleting an expense or a traveler, but not for create or edit. Undoing an edit needs the previous version kept somewhere to restore.

### 🆕 The submit lock is released when the write is *issued*, not when it is confirmed

`useExpenseActions` guards against double submission with `isSubmittingExpenseRef`. It used to be cleared inside `.finally()` on the write promise — which is wrong for exactly the reason documented directly above: **an offline write's promise never settles.** So while offline the lock stayed closed forever, and every expense after the first was rejected at `if (isSubmittingExpenseRef.current) return` in **complete silence** — the form didn't close, no error appeared, nothing happened.

A user on a plane could log one expense, then find the form dead with no explanation. Found by `e2e/offline-optimistic-write.spec.ts`; pinned by two regression tests that simulate a never-settling promise.

Releasing it synchronously is safe: the form closes and clears its fields in the same handler, so there is no button left to double-click.

**The lesson worth keeping:** the codebase documented "offline writes never reject" accurately in one place and then contradicted it in another. When you rely on that fact, grep for the other places that also rely on it.

### 🆕 Never call `signInAnonymously` unconditionally on load

`useAuth` used to call it at the top of its effect on every mount. Firebase returns the current user if they are *already anonymous*, but creates a **new anonymous session that replaces them** if they are signed in with email/password. Result: every page reload evicted the admin.

It stayed invisible until trip switching shipped, because switching trips is a full page load (`TRIP_ID` is read once at module load) and that was the first thing to reload the page routinely.

Now the anonymous session is created only after `onAuthStateChanged` reports *no* user — i.e. after Firebase has finished restoring any persisted session. A ref guards against two concurrent calls, since each could mint a **different** anonymous uid and the second would silently lose the trip memberships stored in the first one's claims. For the same reason `useAdminAuth.handleAdminSignOut` no longer calls it either: session creation has exactly one owner.

### 🆕 The UI context is split by volatility, and that split is load-bearing

Any component consuming a context re-renders when the context **value** changes — not when the slice it reads changes — and `memo()` does not help, because context consumption bypasses it.

`expenseForm` used to live in the same context value as the action handlers. So **every keystroke** in the expense form re-rendered every visible expense row and traveler card, even though all those components read from it were two stable callbacks. `src/context/UIContext.ts` now separates:

- `UIActionsContext` — functions only; identity changes only when the active traveler list does (rare)
- `UIFormContext` — the volatile form state and the handlers bound to it, consumed only by `ExpenseForm` (a single instance that *should* re-render per keystroke)

⚠️ **When adding a field, place it by how often it changes, not by what it relates to.** One changing value in the actions context silently restores the old behaviour with no visible symptom.

While splitting, six fields were deleted outright (`newTravelerName` and friends, `openExpenseForm`, `isAddingTraveler`, `startAddTraveler`, `submitTraveler`): no component ever read them through context — they are passed as props from `App.tsx` — so they were pure churn.

**This is also why Zustand was not adopted.** Its selling point here would be selective subscription, which the split already provides. The hooks are independent of context already (they take data as parameters), so a state-library migration would rewrite plumbing for a benefit near zero.

### 🆕 `createdByUid` is enforced at creation and immutable afterwards

The rules used to check expense ownership only on **update**. Creation accepted whatever `createdByUid` the client sent, so a member could record an expense attributed to someone else — handing that person the right to edit it, removing their own, and corrupting the only record of who entered it. For a tool whose output is "who owes whom", that record is the thing people fall back on when a settlement is questioned.

Three rules now hold, with no exception for admins:

1. **Creation must be self-attributed** — `isOwnCreation` requires the field to be present *and* equal to `request.auth.uid`. Requiring presence is what makes every new expense attributable; the client already sent it on both the form and quick-add paths, so nothing had to change there.
2. **`createdByUid` never changes** — `preservesCreator` applies to the admin path too. It used to be checked only inside the owner branch, so an admin could rewrite it. A field that records "who created this" and accepts later edits records nothing.
3. **Legacy expenses stay editable** — expenses written before the field existed have no owner. The client sends `editingExpense?.createdByUid ?? user?.uid`, which stamps the *editor* on such a document. Rejecting that would have broken admin edits of every old expense, so `preservesCreator` permits stamping an unowned document — but only with the caller's own uid, and never overwriting an owner that already exists.

**Why not exempt admins from rule 1:** if "record on behalf of someone else" is ever wanted, the honest shape is a separate field (`paidBy`) rather than lying in the field that documents the writer. Same reasoning that keeps `changedByUid` bound to `request.auth.uid` in deposit logs.

**If you ever want an audit trail of edits**, add `updatedByUid` as a new field rather than loosening `createdByUid` — creator and last-editor are different facts and conflating them loses both.

### 🆕 Trip lifecycle is enforced in the rules, and absence means `active`

`trips/{tripId}.status` is `active` | `completed` | `archived`, checked by `tripAcceptsExpenses` / `tripAcceptsWrites` in `firestore.rules`. `utils/tripStatus.ts` mirrors the same logic for the UI **and protects nothing** — it exists so a closed trip explains itself instead of presenting buttons the server will reject.

Two decisions worth keeping:

**`completed` still allows traveler and deposit writes.** Only expenses are blocked. If it blocked everything it would be indistinguishable from `archived` except for list visibility, and the state would not earn its place. The real-world need it serves is settling up after the spending stops.

**A missing `status` is `active` — in the rules and in the client.** This is not leniency, it is the migration strategy: every pre-existing trip lacks the field, and any stricter reading would have frozen all of them the moment the rules were deployed. The same principle already governs `createdByUid` on legacy expenses.

🆕 **But that was only half true until 2026-08-11.** `manageTrip`'s `create` wrote `name`, `bankDetails` and `itinerary` and **no `status`** — so every *newly created* trip lacked the field too. The fallback was therefore not accommodating legacy data, it was the permanent behaviour for all data, and the legacy population could never close. `create` now writes `status: 'active'` explicitly. Nothing changes at runtime; what changes is that the count of trips without the field is now **fixed and can only shrink**, exactly as `isOwnCreation` did for `createdByUid`. See `scripts/audit-legacy-docs.mjs`.

⚠️ When changing the meaning of a state, change `firestore.rules` and `utils/tripStatus.ts` **together**. If they disagree the UI either promises something the server refuses, or hides something it would have allowed — and both look like random breakage. `src/utils/tripStatus.test.ts` pins the shared semantics.

### 🆕 Lazy chunks are preloaded once the app is idle

`React.lazy` chunks are fetched on first need. If that moment arrives while offline, the dynamic import fails, throws during render, and the whole tree falls to `ErrorBoundary`. The sharpest case: `ChartsSection` is only requested when `activeExpenses.length > 0`, so **logging the very first expense of a trip while offline crashed the entire app**.

`utils/preload.ts` fetches them quietly on `requestIdleCallback` (with a `setTimeout` fallback for older Safari) once the user has access. Failure is swallowed on purpose — this is opportunistic; if it fails, behaviour is exactly what it was before.

In production the service worker precaches all chunks and covers this, but a real window remains: a first visit that loses connectivity before the SW finishes activating.

### 🆕 `NaN` is blocked in two layers, and a non-finite value is treated as zero rather than thrown

Financial invariant tests found a live path that put `NaN` into every displayed number. `handleAddExpense` checked that the amount *string* was non-empty, not that it was a valid number, and never checked `exchangeRate` at all. So clearing the exchange-rate field — or typing a lone `.` in the amount, which survives sanitising because `ExpenseSection` only strips non-`[0-9.]` and `'.'` is a truthy string — produced `parseFloat(…) === NaN`.

The damage was not an error message but silent corruption: the optimistic write put `NaN` in the local cache immediately, so **every balance and settlement became `NaN`**, then `firestore.rules` rejected the write (`amount >= 0` is false for `NaN`) and the user got a permissions message unrelated to the cause. **Offline it was not rejected at all** — the write sat pending in IndexedDB and the numbers stayed `NaN` until connectivity returned.

Both layers are needed and neither is redundant:

1. **Input boundary** (`useExpenseActions.handleAddExpense`) — `Number.isFinite` on the amount and the rate, before the submit lock closes, so a rejected value leaves the form open and re-submittable. This stops `NaN` from ever being written.
2. **Pure functions** (`splitEven`, `splitByShares`, `calculateTotalSpent`, `calculateTotalDeposited`) — a non-finite input is treated as `0`. This protects against documents already corrupt in Firestore, which the boundary guard cannot reach.

**Why zero and not a thrown error:** the pure functions run on every expense on every render. Throwing takes the whole tree down to `ErrorBoundary` because of one bad document — the same failure mode as the offline lazy-chunk crash. Returning zeros also preserves array length, which `calculateBalances` depends on when it pairs `shares[i]` with `participants[i]`.

Two subtleties in the weight guard that are easy to reintroduce:

- The old test was `typeof w === 'number' && w > 0`, which **accepts `Infinity`** — it is a number and it is greater than zero. `totalWeight` then became `Infinity` and `(totalHalalas × Infinity) / Infinity` is `NaN`. It must be `Number.isFinite(w)`. (`NaN` was excluded only by accident, because every comparison against `NaN` is false.)
- The overflow check belongs on **`totalWeight`, not on each weight**: two weights of `1e308` are each perfectly finite and their sum is not.

**The lesson worth keeping:** `handleQuickAddExpense` had guarded with `!Number.isFinite(amount)` since the beginning while `handleAddExpense` did not — the same file contradicted itself. When one of two paths through the same operation has a guard, go look at the other path.

### 🆕 `App.tsx` was split by *kind of work*, and the characterization test came first

639 lines became 260. The split is not by topic but by what the code *is*:

| Kind of work | Where it lives now |
|---|---|
| Hook wiring + derived values | `hooks/useAppCoordinator.ts` |
| The three context values | `components/AppProviders.tsx` |
| Layout | `components/{Travelers,Charts,Expenses}Panel.tsx`, `StatusBanners`, `AppErrorFallback` |
| Routing + composition | `App.tsx` — all that remains |

**The test was written first, against the 639-line version, and never edited afterwards.** That ordering is the whole safety argument: a characterization test proven green on the old code distinguishes "my test is wrong" from "the refactor broke something". Written after the fact it proves only that the new code matches itself. `src/App.test.tsx` still passes unmodified — that, not the line count, is what says behaviour was preserved.

Three decisions worth keeping:

**Routing stayed in `App.tsx`.** Extracting an `<AppGate>` was considered and rejected: `App` without the routing decision is a wrapper with no responsibility, and "which screen shows" is exactly what a root file should say. What *did* move is the visibility computation (`picker.isVisible`), which is logic.

**The preload `useEffect` moved into the coordinator.** It must run before any conditional `return` (Rules of Hooks); in `App.tsx` that was guarded by a warning comment, in the coordinator it is guaranteed by structure.

**`LAZY_IMPORTERS` is assembled from per-owner exports.** `chartsImporters` now sits beside its `lazy()` in `ChartsPanel.tsx`, matching `modalImporters` and `authImporters`. Adding a lazy chunk means exporting its importer from its own file — `App.tsx` no longer needs to know any of them exist.

⚠️ **One real cost of the pattern:** grouping the return into objects loses TypeScript narrowing. `expense.expenseToDelete !== null` does not narrow `expense.expenseToDelete` across a JSX boundary, so it needs a local binding (`const { expenseToDelete } = expense`). Prefer that over `!` — the assertion would survive a later change that makes the value genuinely nullable.

### 🆕 Legacy-data fallbacks: closed populations, and why there is no `schemaVersion`

Three places accept documents written before a field existed. The question that matters is not whether they should exist, but **whether their population can still grow** — because a fallback whose population is frozen shrinks into irrelevance on its own, while one that keeps growing is permanent behaviour wearing a migration costume.

| Fallback | Guard lives in | Can the population still grow? |
|---|---|---|
| `createdByUid` absent | `preservesCreator` in `firestore.rules` | **No** — `isOwnCreation` requires the field on every create |
| `participants` holding strings | `utils/participants.ts`, `Array<number \| string>` in `types.ts` | **No** — the client writes numeric ids only (`toIds`) |
| `status` absent | `firestore.rules`, `utils/tripStatus.ts` | **No, since 2026-08-11** — `manageTrip` now writes it; before that, every new trip lacked it |
| `bankDetails` absent | `useTripConfig.ts` → `BANK_DETAILS` | **No** — `create` writes empty strings, and `??` does not fire on `''` |

All four are now closed. Their share of the data therefore falls toward zero as new records accumulate — the opposite of the usual "legacy debt compounds" trajectory.

**Why no `schemaVersion` field.** The real debt was never the guards; it was having **no way to prove a guard is no longer needed**, so it stays forever out of uncertainty rather than necessity. `schemaVersion` solves that by taxing every write and every rule forever. `scripts/audit-legacy-docs.mjs` answers the same question — for each guard, how many documents still need it — at zero cost on the write path, because the question is asked once every few months, not on every read.

⚠️ **Before deleting a guard whose counter reads zero:** an offline write can arrive days later (`persistentLocalCache`), and any device on an old bundle still writes the old shape. Run the audit on **every** environment, wait, run it again, then delete.

**Measured baseline — production, 2026-08-11** (1 trip, 114 expenses):

| Guard | Documents still needing it |
|---|---|
| `createdByUid` absent | **2 of 114 expenses (1.75%)** |
| `participants` holding strings | 0 |
| `bankDetails` absent | 0 — so the personal fallback in `constants.ts` is currently reachable by nobody |
| `status` absent | 1 of 1 trip — the original trip, which predates the field |

This is the number to compare future runs against. The point is not that 1.75% is small; it is that **the count of 2 cannot grow while the denominator does**, so the guard's relevance decays on its own. That is what "closed population" buys, and it is why no migration was run: rewriting live documents with no database backup (see `RECOVERY.md` §4) costs more than the branch it would let us delete.

### 🆕 Account linking preserves the `uid`, which is why it costs almost nothing

An anonymous `uid` is the **only** key to trip membership: `verifyTripPin` writes it into the custom claims and `isMember()` reads it from the token. Clearing browser data therefore loses every trip — and PINs are stored hashed and never shown again, so a member who does not remember the PIN loses access permanently.

`linkWithPopup` keeps the same `uid`. So `createdByUid` on every expense stays correct, the `trips` claim survives untouched, and **`firestore.rules` does not change by a single character**. That last point is the design-health signal: a feature that touches identity without touching the rules is a feature added at the edge.

**Google, not Email/Password** — even though Email/Password is already enabled for admin sign-in. Google is one button; email drags in a registration form, verification and a reset flow, which is several times the UI for the same result.

**⚠️ The conflict path is the part that gets skipped.** If the chosen Google account already has a session (exactly the second-device case), `linkWithPopup` fails with `auth/credential-already-in-use`, the client signs in to the existing account — and **the `uid` changes**, orphaning the anonymous session's memberships. `mergeAnonymousTrips` recovers them.

The proof of ownership needs no new mechanism: the anonymous session's **ID token is itself the proof** — signed by Firebase, unforgeable, and `verifyIdToken` checks signature and expiry together. The client captures it *before* the switch and holds it in a local variable for seconds. ⚠️ Never persist it: storing it turns a short-lived proof into a stealable secret for no gain.

Two things the merge deliberately does not do:

1. **It does not move `createdByUid`.** The user cannot edit expenses recorded under the old session (an admin can). The alternative is rewriting live financial documents with no database backup — see `RECOVERY.md` §4.
2. **It does not delete the old anonymous account.** Keeping it preserves the ability to diagnose a bad merge, and anonymous accounts cost effectively nothing.

**The banner is an offer, not a gate.** PIN entry remains the full default path. Forcing registration would kill the product's core property — joining a trip in seconds.

⚠️ **It renders on the main screen *and* in `TripPicker`, and that is not duplication.** It was placed in `TripPicker` alone at first — and `TripPicker` only appears automatically when the app is opened with no `?trip=`, while the header's "my trips" button requires more than one trip. So a member who opens a trip link and belongs to one trip — most members — never saw it. The offer was gated behind a condition that excluded the people it was built for, which is guideline 17 violated inside the feature that documents it. `App.test.tsx` now pins that it reaches the main screen.

### `useExpenses` listens to the whole collection on purpose — do not paginate it

`useExpenses.ts` opens an `onSnapshot` on the entire expenses collection rather than loading pages. Paginating it (cursor + Virtuoso `endReached`) looks like an obvious win and is not:

1. **Expenses are not a display list, they are the input to every financial number.** `activeExpenses` feeds `useBalances`, `calculateSettlements`, `calculateCategoryTotals`, `calculateSpendingTrend`, `exportTripToExcel`, every traveler's account statement, and the trash bin. Compute those from a partial set and the app shows wrong balances *with no error* — the worst possible failure for an expense-splitting tool, because nobody notices until a settlement is disputed.

2. **Search would silently narrow.** `useFilteredExpenses` matches substrings in the description and participant names. Firestore has no substring query, so search must stay client-side over the full array. With pages loaded on demand, searching an old expense returns "no results" for a record that exists.

3. **The collection does not grow without bound.** The path is `artifacts/{tripId}/public/data/expenses` — per trip. A new trip is a new path, so the size is bounded by one trip's duration, not by the app's lifetime. A heavy trip of 500 expenses is roughly 150 KB, fetched once per device; after that `onSnapshot` plus `persistentLocalCache` syncs only deltas.

**When to revisit:** if a single trip approaches ~2000 expenses, or first paint on a real device becomes visibly slow. The fix then is *not* pagination first — it is a summary document (balances and totals) maintained by a Cloud Function on expense writes. Once the math no longer needs every document, paginating the list becomes safe. In that order.

Rendering is already virtualized by React Virtuoso, so a long list costs memory and network, not DOM.

### 🆕 Every change to `deposited` is an audited movement — including the first one

`deposited` is the **only credit side of the ledger**: expenses subtract, and nothing adds but this field. So every write to it is a financial movement.

Until 2026-08-14 the same movement had two paths with completely different guarantees:

| | Create with an initial balance | Edit via the deposit modal |
|---|---|---|
| Who can | **any member** (`isMember` in the rules) | admin only |
| Audit row | **none** | immutable `depositLogs` entry |
| Who did it | **unrecorded** — `travelers` has no `createdByUid` | `changedByUid`, pinned to the caller |
| Why | — | `reason` |

So anyone wanting to add money without a trace didn't open the deposit modal — they created a traveler. And because `depositLogs` is admin-only-readable, not even the admin could see that an initial balance had ever existed.

**The fix does not remove the feature.** `firestore.rules` now requires `deposited == 0` on create, and the client writes the initial balance as a real deposit movement — traveler at 0, then a `depositLogs` row plus the balance update. Same form, same field, same result; an audit row is added.

⚠️ **Two batches, not one — this is a Firestore constraint, not a choice.** The obvious design is a single batch that creates the doc at 0 and then updates it. Firestore **collapses both operations on the same document and evaluates them as one `create` carrying the final value**, which then fails `deposited == 0`. The rejection message says so literally: `false for 'create'`, not `for 'update'`. A rules test pins this so nobody "simplifies" it back and silently breaks adding a traveler with a balance.

**The guarantee that matters survives the split:** the log row and the balance update are in *one* batch, so a balance can never exist without a row explaining it. The worst possible failure is a traveler at 0 with no row — an honest, safe state (no money appeared without a trace), which the admin fixes from the deposit modal. The reverse — a row with no balance — is impossible.

⚠️ **No exception for admins.** Not because they are untrusted — the audit log is *for* them: it is what they point at when asked about a number a month later. Same reasoning that keeps `isOwnCreation` binding on admins.

**Why `createdByUid` on `travelers` was rejected as the fix:** it answers "who created this traveler", not "how much appeared and why". The question asked during a dispute is the second one.

**What made the invariant testable at all:** `utils/deposits.ts` extracts `applyDepositMode` and `replayDepositLogs` as pure functions, shared by both write paths. Before that, the mode arithmetic lived inside a form handler, so "current balance = sum of logged movements" could not be asserted anywhere. It now is, over random operation sequences.

⚠️ **`subtract` clamps at zero**, so `delta` is not always `-amount`. The log therefore derives `delta` from the two balances, never from the input — deriving it from the input breaks the consistency rule on the first over-subtraction.

⚠️ **Transition cost, accepted deliberately.** A device holding an old bundle that queues an offline traveler-create with `deposited > 0` will have that write **refused** when it syncs. Per the optimistic-write design above, the SDK reverts the local mutation rather than getting stuck — the row disappears rather than hanging as `_pending`. The window is one reload wide. **Historical documents are untouched**: rules apply to new writes only, and existing travelers keep balances with no matching log row, exactly as `createdByUid` treated legacy expenses.

### 🆕 The membership roster is an index, not a source of access

`trips/{tripId}/members/{uid}` was added on 2026-08-14 because the token-claims design has a second cost that was never priced. This file documented the trade honestly — membership in the token is a *free* read in `isMember()`, versus a billed `get()` in nearly every rule — and it computed the ceiling (38 trips). What it did not say is that the same decision makes membership **unenumerable, and therefore unmanageable**.

Firebase Auth accepts no query over custom claims. So before this roster existed, the question "who is in this trip?" had no answer at all — not for the app, not for the admin. Enumerating meant paging `listUsers()` over every user in the project and reading each one's claims. The practical consequence: the only way to remove one person from a trip was to reset the PIN, which ejects **everyone**.

**The claim remains the source of truth for access.** The roster is written *after* `setCustomUserClaims` succeeds, and nothing reads it to decide permission. This is load-bearing: `isMember()` still reads the token, so the hot path costs exactly what it did before — zero extra reads on any read or write.

⚠️ **Never add a rule that derives access from this path.** Doing so reintroduces the billed `get()` the whole design exists to avoid, against a 10-read budget that expense creation already spends two of.

Four details that are easy to get wrong:

1. **`joinedAt` is written once and never overwritten.** Re-entering a PIN is not rare — every PIN reset forces every member to re-enter. Writing it on each verification would erase every join date at the first reset, i.e. destroy the field's meaning exactly when it becomes useful.
2. **A failed roster write does not fail the join.** The claim was already set, so the person *is* a member; dropping their join because an index write failed would punish them for something unrelated. The error goes to Cloud Logging and `scripts/backfill-member-roster.mjs` repairs the gap.
3. **Trip deletion must delete the subcollection explicitly.** Firestore does not cascade. And this is reachable, not theoretical: deletion requires the trip to be empty of *travelers and expenses*, and joining requires neither — so a trip ten people joined and nobody spent in is "empty" and deletable.
4. **`mergeAnonymousTrips` writes roster rows too, and leaves the old anonymous ones alone.** The merge does not clear the old account's claims, so that uid still has real access; deleting its row would make the roster lie. `mergedFrom` links the two so the admin sees one person, not two.

**Backfill deliberately leaves `joinedAt` absent** rather than approximating it from `metadata.creationTime` — account creation is not trip join, and they differ for anyone in more than one trip. An invented-but-plausible timestamp is worse than a missing one, because nothing downstream can tell it was invented.

### 🆕 Removing a member is eventually-consistent, and the UI says so

`manageMember` (mode `remove`) deletes **one** trip key from the target's claims and deletes their roster row. It must be a function: claims live on the *target's* account, so no client rule can reach them.

**The removed member keeps access for up to an hour.** Firebase ID tokens last 60 minutes and `isMember()` reads the token, so revocation cannot be instant. This is the exact flip side of that read being free — the same trade documented above, showing its cost on the other end.

`revokeRefreshTokens` would make it immediate and was rejected: it acts on the whole **account**, ejecting the person from every trip they belong to, not the one they were removed from. A side effect on unrelated trips is a bigger wrong than an hour of stale access.

⚠️ **The admin panel states the delay in the tab itself**, and points at PIN reset as the immediate-but-blunt alternative. Hiding it would be the worst option: an admin removing someone after a PIN leak needs to know the door is not yet shut. Same principle as `utils/tripStatus.ts` — the UI explains what the server will actually do.

Three results the caller must distinguish, and the toast does:

| Server returns | Meaning | Why it can't just say "removed" |
|---|---|---|
| `claimRemoved: true` | Real removal | Must mention the up-to-an-hour delay |
| `stillHasAccess: true` | Target is an admin | `admin: true` is global and bypasses trip membership entirely — removing them from the trip changes nothing about their access |
| `claimRemoved: false` | Roster row with no matching claim | Nothing was revoked; a stale index row was cleaned up |

**Removal does not touch their expenses, their traveler, or `createdByUid`.** Taking someone out of a trip is not erasing their financial trace from it — whoever paid, paid. Same principle that makes `createdByUid` immutable and deposit logs append-only.

⚠️ **The negative case that matters (guideline 18): removal must not touch the target's *other* trips.** The claim map is rebuilt by deleting one key from a copy, never reassembled from another source. Getting this wrong wipes memberships unrelated to the decision, and it fails silently — no error, no symptom, until that person opens a different trip days later and is asked for a PIN.

### 🆕 A modal is four keyboard behaviours, not one attribute

`Modal.tsx` had `onClick={onClose}` on the backdrop and a drag-to-dismiss gesture. Both need a pointer. Someone on a keyboard could **open a modal and have no way out of it** — and every modal in the app inherits from this one file: deposit, trash bin, traveler profile, admin sign-in, and both delete confirmations.

Adding `role="dialog"` alone would have been worse than nothing: it announces a dialog to a screen reader while the dialog still cannot be left. The four behaviours in `hooks/useDialogA11y.ts` each fix a separate failure:

| | Without it |
|---|---|
| **Escape closes** | No pointer-free exit exists at all |
| **Focus trap** | Tab walks out to elements that are visually covered and look disabled |
| **Focus enters on open** | Focus stays on the button behind the modal, so the first Tab lands somewhere arbitrary |
| **Focus returns on close** | Focus drops to `<body>`; the user restarts from the top of the page after every modal |

⚠️ **`aria-modal="true"` is separate from the focus trap and both are needed.** The trap stops the Tab key; `aria-modal` is what stops a screen reader from browsing the covered page in its own reading mode, which does not use Tab at all.

⚠️ **Capture the previously-focused element *before* moving focus.** Afterwards `document.activeElement` is the dialog itself, and the reference to whatever opened it is gone.

⚠️ **Check `isConnected` before restoring focus.** The opener may have been removed while the modal was open — a delete-confirmation opened from a traveler card, then the card disappears. Calling `focus()` on an orphaned node throws in some browsers.

**`label` is a required prop, deliberately.** Each modal renders its own heading in its own shape, so deriving `aria-labelledby` automatically would force every modal to know about an id this component generates. Making it required is what stops a *future* modal from shipping unnamed — the case where a screen reader announces "dialog" and nothing else.

**The tests assert behaviour, not attributes** (`Modal.test.tsx`): that Escape actually closes, that Tab actually wraps, that focus actually returns. An attribute written without the behaviour behind it passes code review and fails the first user.

⚠️ **And they immediately earned it.** The first draft filtered the focusable list with `el.offsetParent !== null` to skip hidden elements. That is wrong twice over: `offsetParent` is `null` for **any `position: fixed` element**, and the modal lives inside a `fixed inset-0` overlay — so depending on the DOM shape the filter could empty the list in a real browser and disable the trap **with no visible symptom**. It is also always `null` in jsdom, which has no layout, so the trap could not be tested at all. Visibility is now checked with `hidden` / `aria-hidden`, which behave identically in both. A test that could not run would have hidden a bug that could not be seen.

### 🆕 The QR code is a dependency, and that is consistent with guidelines 1–2

Guidelines 1 and 2 are not a blanket ban on dependencies. `recharts` was rejected because HTML/CSS bars do the job; SheetJS was rejected because the OOXML we need is one page of code. Both replacements are *verifiable by looking at them*.

QR encoding is not that. It is Reed–Solomon error correction over GF(256), automatic version/capacity selection, and mask evaluation — and **its correctness cannot be proven without a scanner**. A code that is wrong by one module looks completely normal and simply never reads. Hand-rolling it would be exactly the situation guideline 18 warns about: a thing that reports success while being broken.

`qrcode-generator` is ~15KB, has no dependencies of its own, and ships TypeScript declarations. What the dependency buys is verification we do not otherwise have.

Two implementation details worth keeping:

- **One `<path>`, not one `<rect>` per module.** A typical trip URL yields a 33×33 grid; a rect each is over a thousand DOM nodes for a static image. `components/admin/QrCode.tsx` emits a single path.
- **`QrCode.test.tsx` tests structure, not readability**, and says so at the top. It pins the quiet margin (4 modules — scanners fail without it), the light/dark contrast, the `xmlns` needed for the exported file to open outside a browser, and that the path scales with input length. Whether the code actually *scans* is settled by a phone, once.

⚠️ **The PIN is deliberately not encoded in the QR.** The server cannot supply it — it is stored hashed and never retrievable — so including it would mean the admin typing the secret into a form to bury it in a shareable image. That collapses the link and the PIN from two separate factors into one artifact that survives a screenshot. The QR carries `?trip=X` and nothing else.

**Still missing on purpose:** no invite records, no per-trip organizer role. That is phase 3 of `docs/PLAN-member-management.md`.

---

## Deployment

Three independent systems that must be deployed separately:

| System | Deployment Command | Purpose |
|---|---|---|
| Frontend | `vercel --prod` | SPA hosted on Vercel |
| Firestore Rules | `firebase deploy --only firestore:rules` | Security rules |
| Cloud Functions | `firebase deploy --only functions` | `verifyTripPin`, `manageTrip`, `mergeAnonymousTrips`, `manageMember`, 🆕 `restoreTrip` |

**Important:** After updating `firestore.rules` or `functions/index.js`, existing users may need to re-enter their trip PIN (custom claim format changed). Always create the trip via `scripts/create-trip.mjs` before deploying new rules.

**Functions runtime:** Node 22. The version is pinned in **two** places and both must agree — `firebase.json` (`runtime: "nodejs22"`, which is what the deploy actually reads) and `functions/package.json` (`engines.node`). Changing only the latter does nothing. CI uses Node 22 as well, so the frontend is built on the same major the functions run on.

🆕 **`vercel.json` holds no rewrites** — it is a `$schema` line and nothing else. Functions are reached through `httpsCallable`, which derives the URL from `projectId` and handles CORS itself. **Adding a Cloud Function therefore needs no frontend deployment config at all**; deploy the function and call it. (Historically both were proxied through `/api/*` rewrites pointing at literal function URLs, which silently pinned every build to one Firebase project — see *Environment Variables*.)

🆕 **Two firebase-tools versions may exist on one machine** (a global install and the project's devDependency). `npm run` puts `node_modules/.bin` first, but a bare `firebase …` typed in a terminal may not resolve there. Use `npx firebase deploy …` so deploys use the pinned version. `scripts/run-with-emulators.mjs` resolves the local binary explicitly for the same reason — a newer global CLI wants a newer emulator jar and will try to download it.

🆕 **Order matters when a change touches both.** Deploy functions *before* pushing frontend code that calls them, or the new UI will hit an old function and fail with a confusing error.

---

## Troubleshooting

| Issue | Likely Cause | Solution |
|---|---|---|
| "خطأ في الصلاحيات" | User not a member of this trip, or trip not created in Firestore | Run `scripts/create-trip.mjs` for this tripId; user must re-enter PIN |
| PIN entry stuck in loop | Custom claims format mismatch | User logs out and back in (or `getIdToken(true)`) |
| Expenses not syncing | Network offline; Firestore SDK queues writes | Check `isOnline` banner; writes sync when connection returns |
| An expense appeared then vanished | The server rejected the write and Firestore reverted the local copy. A toast now names the cause | Read the toast — usually permissions or the one-expense-per-second limit |
| `recharts` not found (build error) | Old dependency referenced somewhere | Run `npm install` (package.json no longer lists recharts) |
| iOS date picker issues | Safari's native date/select styling | Fixes in `index.css` (`.safari-date-fix`, `.safari-select-fix`) |
| Blank screen after deploy | Trip ID mismatch or missing trip config | Ensure `scripts/create-trip.mjs` was run for the tripId in use |
| "إعداد Firebase ناقص" on startup | `VITE_FIREBASE_*` vars were absent from the **build** environment | Locally: create `.env.local` from `.env.example`. On Vercel: add them in Project Settings, then **redeploy** — Vite inlines them at build time, so adding them alone changes nothing |
| "يوجد مسافر بنفس الاسم" | Duplicate shortName (first word of name) — caught locally before any write | Use a different name or rename the existing traveler |
| "الاسم المختصر ... أصبح مستخدماً للتو من جهاز آخر" | The name-claim write lost the race: another device registered that shortName between the local check and the commit. This is the server-side guarantee working | Pick a different name |
| Restoring from the trash fails | Soft-deleting frees the name, so someone may have taken it while the traveler sat in the trash | Rename the other traveler, or rename this one before restoring |
| Itinerary widget not showing | No `itinerary` on the trip doc, or every segment's `departure.time` is in the past | Add a future segment via **إدارة الرحلة** → مسار الرحلة |
| A saved segment vanished from the list | `normalizeItinerary` drops malformed segments on read — `firestore.rules` cannot validate list items, so a segment written directly via the SDK with a missing field is filtered out instead of crashing the UI | Re-add it through the admin panel, which validates before writing |
| Itinerary disappeared after running `create-trip.mjs` | Fixed — the script now merges. Only data written before that fix can be affected | Re-add via the admin panel |
| Trips list empty / "تعذّر جلب قائمة الرحلات" for an admin | A `list` query on `trips/` is only satisfiable by `isAdmin()`; the admin claim may not be on the current token yet | Sign out and back in, or force `getIdToken(true)` — the claim is only refreshed on a new token |
| "إنشاء الرحلة" fails with `functions/not-found` | 🆕 `manageTrip` is not deployed to the project this build points at (check `VITE_FIREBASE_PROJECT_ID`) | `npx firebase deploy --only functions --project <that project>`. No `vercel.json` change is involved any more |
| "هذا الإجراء متاح للمسؤول فقط" when creating a trip | `manageTrip` re-checks `request.auth.token.admin` server-side and does not trust the client | Run `scripts/set-admin.mjs grant <email>`, then re-login |
| 🆕 "بلغت الحد الأقصى لعدد الرحلات على هذا الحساب" | The account's custom claims hit the 900-byte budget — 38 trips with typical ids. Expected, not a bug | Existing trips keep working and auth is unaffected; only *joining a new one* is refused. Free a slot, or implement `users/{uid}` — see `docs/PLAN-account-linking.md` |
| 🆕 "رمز الرحلة غير صحيح" with a correct PIN, on **one machine only** | An ad blocker or privacy extension is stripping the `Authorization` header from the cross-origin call. DevTools "Copy as cURL" still shows the header — it reflects intent, not what left the browser | Disable the extension, or allowlist the app's domain. **Ask "does it work on another device?" before investigating anything else** — see *Diagnosing a failing Cloud Function call* |
| 🆕 "رمز الرحلة غير صحيح" on `localhost` with a correct PIN | Was caused by the old `/api/verifyTripPin` rewrite not existing under `npm run dev`, so the dev server returned HTML | No longer possible — `httpsCallable` needs no proxy. If it recurs, the PIN really is wrong, or `.env.local` points at a project where this trip has no `tripSecrets` doc |
| 🆕 Admin mode lost after switching trips | Trip switching is a full page reload, and `signInAnonymously` used to run unconditionally on every load, replacing the admin session | Fixed in `useAuth`. If it recurs, verify the deployed build actually contains the fix (`git log origin/main..main`) |
| 🆕 Nothing happens when adding a second expense offline | The submit lock waited for a server confirmation that never comes while offline | Fixed in `useExpenseActions` — released when the write is issued |
| 🆕 App shows "حدث خطأ غير متوقع" right after the first expense of a trip, offline | A `React.lazy` chunk (`ChartsSection`) was requested for the first time with no connectivity | Mitigated by `utils/preload.ts`; the service worker covers it in production |
| 🆕 "لا يمكن حذف ... لأنها تحوي مسافرين أو مصاريف" | Deletion is restricted to empty trips by design — deposit logs are immutable and must not be orphaned | Expected. Archive the trip instead (see *Close or archive a trip*) |
| 🆕 The expense form and bottom input bar have disappeared | The trip's `status` is `completed` or `archived` | Expected — a banner at the top of the page says which. Set it back to `active` from the admin panel if it was a mistake |
| 🆕 A trip vanished from "my trips" | It was archived; archived trips are hidden unless you have that trip open | Open it directly via `?trip=X`, or set it back to `active`/`completed` |
| 🆕 Writes fail with a permission error right after changing a trip's status | Expected: the rules read `trips/{tripId}.status` on every write, so the change takes effect immediately for everyone | Not a bug. Check the status in the admin panel |
| 🆕 «أدخل مبلغاً صحيحاً» / «سعر الصرف غير صالح» on submit | The amount or rate field holds something that is not a number — most often a lone `.`, or an emptied rate field | Expected. Fix the field; the form stays open with your values. Before this guard the expense was written with `amount: NaN` and every balance showed `NaN` |
| 🆕 All balances suddenly show `NaN` | A pre-existing expense document holds a non-finite `amount` (written before the guard) | The calculations now treat it as `0`, so the rest of the ledger is correct. Find the document and fix or soft-delete it |
| 🆕 `npm test` fails with "Cannot find module 'fast-check'" | The invariants suite added a devDependency | `npm install` |
| 🆕 `npm run test:rules` / `test:e2e` fail with "Unable to locate a Java Runtime" | The Firestore emulator is a JVM process | Install a JDK (`brew install openjdk` + link it), then re-run |
| 🆕 Emulator fails downloading `cloud-firestore-emulator-*.jar` | A newer firebase-tools (often a *global* install) wants a newer jar and cannot reach `storage.googleapis.com` | Run through `npm run …` so the pinned local version is used; it reuses the cached jar |
| 🆕 E2E fails with "Port 5173 is already in use" | A leftover `vite`/`npm run dev` from another terminal | `lsof -i :5173` then kill it; do not run a dev server alongside `npm run test:e2e` |
| 🆕 `wrong-pin` E2E test fails with a rate-limit message | Too many PIN attempts accumulated on that trip's counter within 15 minutes | The test clears counters via `clearPinRateLimits()`; if changed, keep that call |
| 🆕 A removed member can still open the trip | Expected for up to 60 minutes — `isMember()` reads the ID token, and tokens live an hour | Wait it out, or reset the PIN for an immediate cut (which ejects everyone). The members tab says this before you click |
| 🆕 The members tab is empty although people have joined | They joined before the roster existed (2026-08-14). Membership lived only in their claims, which cannot be queried | `node scripts/backfill-member-roster.mjs --apply`. Those rows show "تاريخ الانضمام غير معروف" — the date was never stored anywhere |
| 🆕 "تعذّر جلب قائمة الأعضاء" for an admin | The roster is `read: if isAdmin()`, and the admin claim may not be on the current token yet | Sign out and back in — the claim only refreshes on a new token. Same cause as the empty trips list |
| 🆕 Removing an admin from a trip appears to do nothing | Correct: `admin: true` is global and bypasses trip membership, so there was no trip-scoped access to revoke | Expected — the toast says so. Revoke admin with `scripts/set-admin.mjs revoke <email>` instead |
| 🆕 «الرصيد الابتدائي غير صالح» when adding a traveler | The field holds something non-finite — most often a stray `Infinity`, a lone `.`, or a negative | Expected. Fix it or leave it empty (empty means zero). Before this guard the traveler was written with a non-finite balance and every derived total showed it |
| 🆕 A traveler added while offline on an old tab vanished after reconnecting | Its create carried `deposited > 0`, which the rules now refuse; the SDK reverted the local copy | Expected for one reload after the 2026-08-14 deploy. Reload the tab and re-add — the balance now goes through the audited path |
| 🆕 An old traveler's balance has no matching row in the deposit history | Their balance predates the audited-initial-balance change | Expected and not repaired: historical documents are never rewritten. Only balances changed after that date are fully reconstructable |

---

## Contributing Guidelines

1. **No direct `lucide-react` imports in components** — use `src/icons.ts` re-exports only.
2. **No `recharts`** — charts are pure HTML/CSS in `ChartsSection.tsx`.
3. **No `enableIndexedDbPersistence`** — use `persistentLocalCache` (modern API).
4. 🆕 **No hand-rolled `fetch` to a Cloud Function, and no literal function URL** — always `httpsCallable(functions, 'name')`. A hardcoded URL (or a rewrite pointing at one) pins the build to one Firebase project and silently breaks staging; that is exactly the bug that forced this change.
5. **Soft delete only** — `deletedAt` timestamps, never permanent deletion (`allow delete: if false` in rules). Two exceptions, both deliberate: `travelerNames/{shortName}` is a claim rather than data (soft-deleting a traveler frees the name for reuse), and 🆕 an **empty** trip may be deleted through `manageTrip` server-side — never from the client, and never when it holds any traveler or expense.
6. **Traveler writes are batched with their name claim** — adding, trashing or restoring a traveler must write `travelers/{id}` and `travelerNames/{shortName}` in one `writeBatch`. A traveler without a claim is a traveler whose name nobody else is prevented from taking.
7. **Modals go in `src/components/modals/`**, are registered in `useModals.ts` (`ModalState` union) and rendered lazily by `ModalManager.tsx` — not directly in App.tsx.
8. **Pure logic in `utils/`** — testable without React/DOM.
9. **Arabic-first** — all UI text in Arabic, RTL layout, Arabic numeral conversion.
10. **Optimistic updates** — close form immediately on submit, show `_pending` flag until server confirms. Rollback is Firestore's job, not ours (see Design Decisions). Report write failures with `describeWriteError` and never blame the network: an offline write does not reject.
11. **Haptic feedback** — use `haptic` from `utils/haptics.ts` for all important interactions.
12. **Run scripts with Admin SDK** — `serviceAccountKey.json` required, never expose admin operations to clients.
13. **Never write `trips/{tripId}` without merge** — the doc holds independent sections (name, bankDetails, itinerary). Use `useTripAdminActions`, which always merges; a full `set()` silently drops whatever it omits.
14. **Secrets stay server-side** — `tripSecrets/{tripId}` is `read, write: if false` and must remain so. PIN handling belongs in `functions/index.js` or an Admin SDK script, never in the client.
15. **CI pipeline** — all PRs must pass: lint → typecheck → test → rules → e2e → build. ESLint bans `any` (`no-explicit-any`) and empty `catch {}` blocks (`no-empty`), which are easy to introduce accidentally. 🆕 You no longer need to remember to run anything: `.githooks/pre-push` runs lint/typecheck/test before every push. **Do not reach for `--no-verify` as a habit** — the one commit that skipped this discipline (`c51e9f8`) left `main` red for two days. 🆕 And it no longer helps: a ruleset on `main` refuses direct pushes outright, so **all work goes through a PR**. This guideline finally describes what actually happens. See *The push gate* under *Testing*.

    🆕 **`npm run lint` runs with `--max-warnings=0`** (2026-08-15). Before this, ESLint's own exit code only reflects *errors* — a rule at `warn` severity (`react-refresh/only-export-components`, anything from `plugin:storybook/recommended`) could accumulate silently forever: not in the terminal you'd notice, not in `.githooks/pre-push`, not in CI's `lint` job. The repo had zero warnings when this was added, so nothing changed today — the fix is preventive, closing the exact gap a Final Release Audit flagged (H4) before anything used it. No other file needed changing: both the hook and CI already call `npm run lint`, so the flag closes both at once.
16. 🆕 **Context fields go where their volatility says**, not where their topic says — see `src/context/UIContext.ts`. A changing value placed in `UIActionsContext` reintroduces the per-keystroke re-render with no visible symptom.
17. 🆕 **Never gate a screen on a condition that excludes the person who uses it.** The "my trips" picker originally required `needsTripPin && !isAdmin`, which hid it from every member of the default trip *and* from admins entirely — i.e. from everyone who would ever open it. Ask "who does this condition exclude?" before shipping visibility logic.
18. 🆕 **Verify the negative case for anything that reports success/failure.** The emulator wrapper (`scripts/run-with-emulators.mjs`) had three separate bugs — including one where failing tests reported success — and none would have surfaced by only checking that a passing run exits 0.
19. 🆕 **Money never enters the app unvalidated, and never leaves the pure functions non-finite.** Any new numeric input path needs `Number.isFinite` at the boundary; any new calculation must hold the four rules in `utils/calculations.invariants.test.ts`. Add the rule there before the code, and never weaken a rule to make it pass — either the behaviour is wrong, or the rule is worded wrong and needs a comment explaining the correct wording.
20. 🆕 **Keep `App.tsx` to routing and composition.** New hook wiring or derived state goes in `hooks/useAppCoordinator.ts`; new context fields go in `components/AppProviders.tsx` (placed by volatility, per guideline 16); new layout goes in a `*Panel.tsx` component. If `App.tsx` starts growing again, something was put in the wrong place.
21. 🆕 **Before refactoring anything untested, pin it first.** Write the characterization test against the *current* code and prove it green **before** moving a line — see `src/App.test.tsx`. A test written after the move only proves the new code agrees with itself.
22. 🆕 **Scope a bug before explaining it.** For anything failing in production, first establish *where* it fails: another device, another browser, another network. A theory explains one observation; a scope test eliminates whole families of them at once. Skipping this cost two hours and five wrong theories on 2026-08-13 — see *Diagnosing a failing Cloud Function call*.
23. 🆕 **Before debugging production behaviour, confirm the fix is actually deployed** (`git log origin/main..main`). A meaningful amount of time was lost diagnosing a bug that was already fixed locally but never pushed.

</div>

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
