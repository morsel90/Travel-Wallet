# المهام الشائعة وحل المشاكل — Travel Wallet

<div dir="rtl" style="text-align: right">

للسياق العام راجع [CLAUDE.md](../CLAUDE.md)؛ للمرجع التقني (API، النماذج، الاختبارات، النشر) راجع [docs/REFERENCE.md](REFERENCE.md).

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
Sign in as admin → **إدارة الرحلات** → «إنشاء رحلة جديدة». Enter a trip id and a name; the app calls `manageTrip` which writes `trips/{tripId}`. 🆕 No PIN — invite members from the same panel's "الأعضاء" tab (generates a one-click `?invite=TOKEN` link) once the trip exists.

`scripts/create-trip.mjs` still works and is the fallback if functions are not deployed — it also no longer prompts for a PIN.

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
Admin panel → select the trip → **إعدادات الرحلة** tab (scroll to the "حذف الرحلة نهائياً" section — 🆕 merged into this tab from a separate one, alongside the backup download). You must type the trip id to confirm, because the action is irreversible and trip names in a list look alike.

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

`scripts/create-trip.mjs` writes with `{ merge: true }`, so re-running it to change bank details no longer wipes an existing itinerary. 🆕 It no longer touches a PIN at all (removed entirely) or signs anyone out.

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

## Troubleshooting

| Issue | Likely Cause | Solution |
|---|---|---|
| "خطأ في الصلاحيات" | User not a member of this trip, or trip not created in Firestore | Run `scripts/create-trip.mjs` for this tripId; user must join again via an invite link |
| 🆕 Signed-in user stuck on "لست عضواً في هذه الرحلة" | They are authenticated but have no `trips` claim for this `TRIP_ID` — no self-service join exists anymore | Get a fresh invite link from the trip's admin panel ("الأعضاء" tab) |
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
| "رابط الدعوة غير صالح أو أُبطل" on **one machine only** | An ad blocker or privacy extension is stripping the `Authorization` header from the cross-origin call. DevTools "Copy as cURL" still shows the header — it reflects intent, not what left the browser. (🆕 Historical note: this exact symptom used to read "رمز الرحلة غير صحيح" back when the mechanism was `verifyTripPin`, deleted along with the PIN — the underlying cause and fix are unchanged) | Disable the extension, or allowlist the app's domain. **Ask "does it work on another device?" before investigating anything else** — see *Diagnosing a failing Cloud Function call* |
| 🆕 Admin mode lost after switching trips | Historical (pre-2026-08-20): trip switching is a full page reload, and `signInAnonymously` used to run unconditionally on every load, replacing the admin session | No longer reachable at all — `signInAnonymously` was deleted entirely, not just fixed. If something like this recurs, it is a new bug, not this one |
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
| 🆕 A removed member can still open the trip | Expected for up to 60 minutes — `isMember()` reads the ID token, and tokens live an hour | Wait it out — there is no immediate-cut alternative (no PIN to reset anymore). The members tab says this before you click |
| 🆕 The members tab is empty although people have joined | They joined before the roster existed (2026-08-14). Membership lived only in their claims, which cannot be queried | `node scripts/backfill-member-roster.mjs --apply`. Those rows show "تاريخ الانضمام غير معروف" — the date was never stored anywhere |
| 🆕 "تعذّر جلب قائمة الأعضاء" for an admin | The roster is `read: if isAdmin()`, and the admin claim may not be on the current token yet | Sign out and back in — the claim only refreshes on a new token. Same cause as the empty trips list |
| 🆕 Removing an admin from a trip appears to do nothing | Correct: `admin: true` is global and bypasses trip membership, so there was no trip-scoped access to revoke | Expected — the toast says so. Revoke admin with `scripts/set-admin.mjs revoke <email>` instead |
| 🆕 «الرصيد الابتدائي غير صالح» when adding a traveler | The field holds something non-finite — most often a stray `Infinity`, a lone `.`, or a negative | Expected. Fix it or leave it empty (empty means zero). Before this guard the traveler was written with a non-finite balance and every derived total showed it |
| 🆕 A traveler added while offline on an old tab vanished after reconnecting | Its create carried `deposited > 0`, which the rules now refuse; the SDK reverted the local copy | Expected for one reload after the 2026-08-14 deploy. Reload the tab and re-add — the balance now goes through the audited path |
| 🆕 An old traveler's balance has no matching row in the deposit history | Their balance predates the audited-initial-balance change | Expected and not repaired: historical documents are never rewritten. Only balances changed after that date are fully reconstructable |

</div>
