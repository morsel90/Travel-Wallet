# مرجع تقني — Travel Wallet

<div dir="rtl" style="text-align: right">

هيكلية الملفات، نماذج البيانات، واجهة الدوال السحابية، الاختبارات، والنشر. للسياق العام راجع [CLAUDE.md](../CLAUDE.md)؛ للمهام الشائعة وحل المشاكل راجع [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md).

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
│   │   ├── useAuth.ts            # 🆕 Auth state, admin claims, Google/Email sign-in — no PIN, no anonymous sessions
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
│   │   ├── useTripAdminActions.ts # Admin **or trip organizer** writes to trips/{tripId} (merge-only) + manageTrip/manageMember calls
│   │   ├── useAllTrips.ts        # Live list of every trip (admin-only query)
│   │   ├── useMyTrips.ts         # 🆕 Trips this user joined — one getDoc each (a list query is admin-only)
│   │   ├── useMyTripRole.ts      # 🆕 "Am I this trip's organizer?" — one self-read; permission-denied just means no
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
│   │   ├── AuthGate.tsx          # 🆕 Mandatory Google/Email sign-in screen — no PIN, no anonymous sessions
│   │   ├── NotAMemberScreen.tsx  # 🆕 Signed in but not a member of this trip (+ escape link to "my trips")
│   │   ├── TripPicker.tsx        # 🆕 "My trips" list — shown when the URL names no trip
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
│   │   ├── admin/TripAdminView.tsx   # 🆕 Trips list ↔ trip detail (full-screen). viewerRole='organizer': one trip, no create/restore
│   │   ├── admin/TripDetailPanel.tsx # One trip: name + bank, itinerary editor, delete (empty only), JSON backup download, invite link, 🆕 members tab role toggle. viewerRole hides admin-only tabs
│   │   ├── admin/NewTripForm.tsx     # Create a trip (id + name) via manageTrip
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
│       ├── callableErrors.ts    # 🆕 Pure: Cloud Function error code → real cause (ad blocker, network, invalid invite)
│       ├── haptics.ts           # Vibration API + visual flash overlay
│       ├── preload.ts           # 🆕 Idle-time preloading of lazy chunks (onIdle + preloadAll)
│       ├── cn.ts                # Tailwind class merge (clsx alternative)
│       └── tripId.ts           # TRIP_ID + HAS_EXPLICIT_TRIP_ID from ?trip= query param
│
├── functions/
│   └── index.js                 # Cloud Functions: manageTrip (create/delete) + manageInvite + joinViaInvite (rejects anonymous sessions) + updateMyTravelerName + linkTravelerAccount + manageMember (remove + 🆕 setRole, both organizer-aware) + restoreTrip
│
├── scripts/
│   ├── audit-legacy-docs.mjs    # 🆕 Read-only: counts documents still needing each legacy fallback
│   ├── create-trip.mjs          # Admin SDK script: create/update trip
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
│   ├── critical-flow.spec.ts            # Sign in → admin → travelers → expense → edit → balances → report → export
│   ├── balances-math.spec.ts            # Exact settlement arithmetic through the real UI
│   ├── soft-delete-trash.spec.ts        # Delete → undo toast → delete again → restore from trash
│   ├── offline-optimistic-write.spec.ts # Offline write shows _pending, then syncs on reconnect
│   ├── trip-picker.spec.ts              # Bare URL shows "my trips"; clicking one opens it
│   ├── admin-persists-across-trips.spec.ts # Admin survives reload and trip switching
│   ├── organizer-role.spec.ts           # 🆕 Two real sessions: admin promotes a member, member's UI updates after reload
│   ├── auth-gate.spec.ts                # 🆕 AuthGate: invalid invite link, email sign-up/sign-in, not-a-member screen
│   ├── utils/{seed,flows}.ts            # Emulator seeding (mints authenticated users via Admin SDK) + shared UI steps
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
| `src/App.tsx` | 🆕 Two jobs only: **routing** (auth gate → invite screen → picker → membership check → app, in that order) and **composition**. No hook wiring, no context values, no layout. |
| `src/hooks/useAppCoordinator.ts` | 🆕 Every hook call and derived value, returned as named groups (`session`, `ledger`, `trip`, `rates`, `status`, `picker`, …). Order inside is load-bearing — later hooks consume earlier results. |
| `src/components/AppProviders.tsx` | 🆕 Builds and provides the three context values. Read `context/UIContext.ts` before touching it — the volatility split is a performance guarantee whose breakage is silent. |
| `src/types.ts` | All interfaces: `Traveler`, `Expense`, `ExpenseFormData`, `Settlement`, `ToastMessage`, etc. |
| `src/hooks/useExpenseActions.ts` | All expense CRUD: form submission, quick add, optimistic updates, retry logic, rate limiting. |
| `src/hooks/useAuth.ts` | 🆕 Auth state machine: session restore, admin claim detection, `joinedTripIds` from the `trips` claim, `signInWithGoogle` (popup with redirect fallback) + `signInWithEmail`. No anonymous sign-in. |
| `src/hooks/useModals.ts` | `ModalState` discriminated union + reducer — the single source of truth for which modal is open. |
| `src/components/ModalManager.tsx` | Renders those modals (all `React.lazy`). Purely presentational; data/handlers passed from `App.tsx`. |
| `src/hooks/useTripConfig.ts` | Live `onSnapshot` on `trips/{TRIP_ID}`: trip name, bank details, itinerary — with `constants.ts` fallbacks. |
| `src/hooks/useTripAdminActions.ts` | The only client write path to `trips/{TRIP_ID}`. Always `setDoc(..., { merge: true })` — never a full overwrite. 🆕 `organizerTripId` param: an organizer may act on their own trip, same as `isAdmin`. |
| `src/components/admin/TripAdminView.tsx` | Admin panel. Itinerary is edited locally then saved in one explicit write. 🆕 `viewerRole='organizer'` skips the trip list entirely (one trip, opened directly) and hides create/restore. |
| `src/hooks/useMyTripRole.ts` | 🆕 Self-read of `trips/{tripId}/members/{uid}` to answer "am I this trip's organizer?" — a `permission-denied` here *is* "no," not an error. |
| `src/utils/itinerary.ts` | Pure itinerary helpers: draft validation, defensive `normalizeItinerary`, `findNextSegment`. Fully tested. |
| `src/firestore.ts` | Single source of truth for Firestore paths: `expensesCol`, `travelerDoc`, `depositLogsCol`, `rateLimitDoc`, `tripConfigDoc`. |
| `src/constants.ts` | `CURRENCY_LABELS` (160 currencies), `FALLBACK_RATES`, `EXPENSE_CATEGORIES`, `BANK_DETAILS`. |
| `src/utils/calculations.ts` | Pure functions for balances, settlements, category totals, spending trend. Fully tested. |
| `src/utils/xlsx.ts` | Pure-JS OOXML XLSX generator — no dependencies. |
| `functions/index.js` | `manageTrip` (create / delete, no PIN) + `manageInvite` (create/revoke invite token) + `joinViaInvite` (grants the `trips` claim; rejects anonymous callers with `failed-precondition`) + `updateMyTravelerName` (self-service rename on first join) + `linkTravelerAccount` (organizer links a ghost traveler to a joined account) + `manageMember` (`mode: 'remove'` — removes one trip from another user's claims, callable by a trip's organizer too but never against an admin or another organizer; 🆕 `mode: 'setRole'` — grants/revokes the organizer role, global admin only) + `restoreTrip` (rebuilds a trip from a Stage-1 JSON backup — empty-or-nonexistent trips only, re-validates every document since Admin SDK bypasses the rules). |
| `firestore.rules` | Security rules: `isAdmin()`, `isMember(tripId)` (🆕 folds in `isNotAnonymous()` — no anonymous session ever satisfies it), 🆕 `isOrganizer(tripId)` (reads `trips/{tripId}/members/{uid}.role`), `withinExpenseRateLimit`, immutable deposit logs. |
| `src/context/UIContext.ts` | 🆕 Two contexts split by volatility. Read the comment there before adding a field — putting a changing value in the actions context silently undoes the split. |
| `src/hooks/useMyTrips.ts` | 🆕 The user's own trips. Reads each `trips/{id}` with its own `getDoc` — a `list` query is admin-only and would fail for members. |
| `src/utils/preload.ts` | 🆕 Idle-time preloading of lazy chunks so they exist before connectivity is lost. |
| `scripts/create-trip.mjs` | Admin SDK script to create/update a trip (name, bank details, itinerary). No PIN — invite it from the app's admin panel afterward. |
| `scripts/set-admin.mjs` | Admin SDK script to grant/revoke `admin: true` custom claim. |
| `scripts/run-with-emulators.mjs` | 🆕 Wrapper giving emulator-backed test runs a trustworthy exit code. See its header comment — three separate bugs lived here. |

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
  identifier?: string           // Flight no. ("QR 1155") or vehicle description — legacy data only, SegmentForm.tsx no longer collects it
  reference?: string            // PNR / rental booking ref — legacy data only, same as above
  notes?: string                 // Free-text field SegmentForm.tsx does collect, replacing identifier/reference for new segments
  departure: { location: string; time: string }  // time = ISO timestamp
  arrival:   { location: string; time?: string }  // time is optional — the simplified form only collects departure time
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

trips/{tripId}                    — Trip config (name, organizerUid, itinerary[])
                                    Admin-writable from the app (validated by isValidTripConfig);
                                    delete stays forbidden — it would orphan artifacts/{tripId}
                                    🆕 No bankDetails field — bank details are read live from
                                    users/{organizerUid} instead. See Design Decisions.
users/{uid}                       — 🆕 User profile { displayName?, bankDetails?, organizesTripIds?,
                                    lastTripCreatedAt? }. Owner-only write; read by the owner or by
                                    any member of a trip this account organizes (organizesSharedTrip).
trips/{tripId}/members/{uid}      — 🆕 Membership roster. Written ONLY by the functions
                                    (joinViaInvite on join);
                                    `allow write: if false`, read admin-only.
                                    { joinedAt, lastVerifiedAt, email?, displayName?,
                                      mergedFrom?, backfilledAt? }
                                    ⚠️ An index, NOT a source of access — see Design Decisions
tripInvites/{token}               — 🆕 Invite link record { tripId, createdAt, createdByUid }
                                    (no client access, function only — manageInvite writes,
                                    joinViaInvite consumes)
```

🆕 No `tripSecrets/{tripId}` and no PIN-verification `rateLimits/verify_{key}` — both
deleted along with the PIN itself. See *Design Decisions* in `docs/DECISIONS.md`.

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

// 🆕 hooks/useInviteJoin.ts — requires a real (non-anonymous) sign-in first;
// rejected with failed-precondition otherwise
await httpsCallable<{ inviteToken: string }, { success: boolean; tripId: string; needsName?: boolean }>(
  functions, 'joinViaInvite',
)({ inviteToken })

// 🆕 hooks/useInviteJoin.ts — only when needsName was true above
await httpsCallable<{ tripId: string; name: string }, { success: boolean }>(
  functions, 'updateMyTravelerName',
)({ tripId, name })

// hooks/useTripAdminActions.ts — 🆕 create: any signed-in non-anonymous account
// (self-serve, becomes organizer); delete: admin claim required, re-checked server-side
await httpsCallable<
  { mode: 'create' | 'delete'; tripId: string; name?: string },
  { success: boolean; tripId: string }
>(functions, 'manageTrip')({ mode, tripId, name })
```

```ts
// 🆕 hooks/useTripAdminActions.ts — restore a trip from a Stage-1 JSON backup
// (docs/PLAN-backup-recovery.md). backup: unknown deliberately — the real shape
// is re-validated entirely server-side, since Admin SDK bypasses firestore.rules.
await httpsCallable<
  { tripId: string; backup: unknown },
  { success: boolean; tripId: string; restored: { travelers: number; expenses: number; depositLogs: number } }
>(functions, 'restoreTrip')({ tripId, backup })
```

Failures arrive as `FirebaseError` with a `functions/…` code (`unauthenticated`,
`permission-denied`, `failed-precondition` for an anonymous caller), not as an HTTP status.

`manageTrip` still exists as a function purely for `mode: 'delete'`'s multi-collection
emptiness check (see below) — `mode: 'create'` no longer touches any secret and could,
in principle, move to a direct `firestore.rules`-validated write like the rest of trip
config; it stays bundled with `delete` for one endpoint instead of two.

`mode: 'create'` refuses to overwrite an existing trip.

🆕 `mode: 'delete'` needs no `name`, and **refuses any trip that has a
single traveler or expense** (checked server-side with `limit(1)` queries — the
question is "is there data?", not "how much"). This is what keeps the deletion
safe, and why `allow delete: if false` stays in `firestore.rules`: if the client
could delete directly, that emptiness check could simply be bypassed, orphaning
`artifacts/{tripId}` and destroying deposit logs that are immutable by design.
It also frees the trip id for reuse — the actual need behind it (a trip created with
a typo'd id). Archiving would not free the id, which is why it wasn't chosen.

🆕 **Trip membership lives in the token, and that has a ceiling.** `joinViaInvite` writes `trips: { [tripId]: true }` into the custom claims, and `isMember()` in `firestore.rules` reads it straight from the token — a **free** read. Storing membership in Firestore instead would force a billed `get()` into nearly every rule, on every read and every write, against a 10-read-per-request budget that expense creation already spends two of. The trade is deliberate.

Its cost is a hard limit: Firebase caps custom claims at **1000 bytes**. With a 16-character trip id each membership costs ~25 bytes, so `assertClaimsFitTokenLimit` refuses at **38 trips** (913 bytes), leaving 111 bytes of headroom. The budget is 900 rather than 1000 so that adding `admin: true` — or any future claim — does not turn a near-limit account into a broken one.

⚠️ **Without that guard the failure is actively misleading:** authentication does *not* break and existing tokens keep working. What fails is the *join* — `setCustomUserClaims` throws, and the user sees an opaque `internal` error naming nothing. Now they get `resource-exhausted` with a sentence that says what happened.

**When a real user approaches 38 trips**, the fix is `users/{uid}.joinedTrips` in Firestore — deliberately not built before it is needed.

🆕 **No rate limit on `joinViaInvite`.** The old per-trip PIN limiter is gone along with the PIN — an invite token is 192 bits of entropy (`crypto.randomBytes(24)`), unguessable by any realistic brute force, so a rate limit there would have protected against nothing. See the `joinViaInvite` doc comment in `functions/index.js`.

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
- `hooks/`: `useAuth`, `useExpenseActions`, `useTravelerActions`, `useDepositActions`, `useMyTrips`, `useModals`, `useBalances`, `useFilteredExpenses`, `useDebounce`, `useCountdown`, `useOnlineStatus`, `useHeaderCollapse`, 🆕 `useInviteJoin`
- `components/EmptyState.test.tsx`
- 🆕 `App.test.tsx` — a **characterization test**: it describes behaviour as it is, not as it should be, and exists to make refactors of `App.tsx` safe. Pins gate ordering, the status banners, the closed-trip hiding of both expense inputs, the empty states, and that empty states stay hidden while loading. ⚠️ If it fails during a refactor, the refactor changed behaviour — changing the expectation to make it pass destroys the only reason it exists.

🆕 **Financial invariants (`utils/calculations.invariants.test.ts`)** — a fourth kind of test inside layer 1, using **fast-check** for property-based generation. A unit test says "this input gives this output"; an invariant says "whatever the input, this must hold" — so it covers what you did *not* think of, which is what breaks an arithmetic app. Four rules: sum of shares equals the expense amount; the ledger equation (`remaining = deposited − attributed`, and nothing created or lost); settlements equal `min(debt, credit)`; and no `NaN`/`Infinity`/impossible share anywhere. On failure fast-check shrinks to the smallest reproducing case.

Two things worth knowing before editing that file:

- **Compare in halalas, never in riyals.** Every calculation rounds to `Math.round(total * 100)`; comparing floats directly (`0.1 + 0.2 !== 0.3`) fails a correct rule for a reason unrelated to money. Rule 1 therefore guarantees conservation *of the amount rounded to the halala* — the strongest claim that is actually true.
- **Rule 3 is `min(debt, credit)`, not "total debt".** `remaining = deposited − share`, so the balances sum to the fund's surplus or deficit and reach zero only by coincidence; a surplus leaves creditors unmatched. Stating it as "= total debt" fails on a perfectly healthy ledger. A separate test covers the balanced case where the stronger claim does hold. Measured deviation is exactly one halala, bounded by `EPSILON` and *not* by group size.

#### 2. Rules tests (`tests/firestore-rules/`)
Run against the emulator with `@firebase/rules-unit-testing` — they test `firestore.rules` itself, not app code. Cover: non-member denial, 🆕 an authenticated session with a *valid* `trips` claim but `sign_in_provider: 'anonymous'` still denied everywhere `isMember()` gates (the actual mechanism behind the PIN/anonymous removal — see *Design Decisions*), cross-trip isolation, expense ownership on update, hard-delete blocked everywhere, admin-only trip writes, `tripInvites` unreachable even by admin, the expense rate limit including clock tampering, deposit-log immutability, and `travelerNames` uniqueness.

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

`utils/callableErrors.ts` now translates the code into its real cause, and `unauthenticated` names the ad blocker explicitly — the one cause a user can fix unaided. ⚠️ **"Wrong PIN" and "no such trip" stayed merged on purpose** back when `verifyTripPin` existed: the server returned one `permission-denied` for both so that trip existence could not be probed by guessing `?trip=`. 🆕 That principle carried over unchanged to invite links after PIN removal — `describeInviteError` merges "invalid token" and "revoked token" the same way, for the same reason. That merge is security; the rest was noise. `callableErrors.test.ts` pins it.

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

## Deployment

Three independent systems that must be deployed separately:

| System | Deployment Command | Purpose |
|---|---|---|
| Frontend | `vercel --prod` | SPA hosted on Vercel |
| Firestore Rules | `firebase deploy --only firestore:rules` | Security rules |
| Cloud Functions | `firebase deploy --only functions` | `manageTrip`, `manageInvite`, `joinViaInvite`, `updateMyTravelerName`, `linkTravelerAccount`, `manageMember`, 🆕 `restoreTrip` |

**Important:** Always create the trip via `scripts/create-trip.mjs` before deploying rules that depend on it existing.

⚠️ **Deploying `firestore.rules` with `isNotAnonymous()` folded into `isMember()` (see *Design Decisions*) is a one-way, breaking deploy on production data.** Any member still on an anonymous session loses access the instant this lands — no re-entry flow exists to recover it, because there is no PIN anymore. This is not a routine deploy footnote; confirm intent before running it against a live project with real members.

**Functions runtime:** Node 22. The version is pinned in **two** places and both must agree — `firebase.json` (`runtime: "nodejs22"`, which is what the deploy actually reads) and `functions/package.json` (`engines.node`). Changing only the latter does nothing. CI uses Node 22 as well, so the frontend is built on the same major the functions run on.

🆕 **`vercel.json` holds no rewrites** — it is a `$schema` line and nothing else. Functions are reached through `httpsCallable`, which derives the URL from `projectId` and handles CORS itself. **Adding a Cloud Function therefore needs no frontend deployment config at all**; deploy the function and call it. (Historically both were proxied through `/api/*` rewrites pointing at literal function URLs, which silently pinned every build to one Firebase project — see *Environment Variables*.)

🆕 **Two firebase-tools versions may exist on one machine** (a global install and the project's devDependency). `npm run` puts `node_modules/.bin` first, but a bare `firebase …` typed in a terminal may not resolve there. Use `npx firebase deploy …` so deploys use the pinned version. `scripts/run-with-emulators.mjs` resolves the local binary explicitly for the same reason — a newer global CLI wants a newer emulator jar and will try to download it.

🆕 **Order matters when a change touches both.** Deploy functions *before* pushing frontend code that calls them, or the new UI will hit an old function and fail with a confusing error.

</div>
