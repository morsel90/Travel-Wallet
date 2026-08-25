# سجل القرارات المعمارية — Travel Wallet

<div dir="rtl" style="text-align: right">

قرارات تبدو كأخطاء لكنها ليست كذلك. راجع هذا الملف قبل «إصلاح» أي منها. للسياق العام راجع [CLAUDE.md](../CLAUDE.md)؛ لتاريخ التغييرات راجع [CHANGELOG.md](../CHANGELOG.md).

## Design Decisions

Decisions that look like oversights but are not. Read this before "fixing" them.

### 🆕 قائمة الحساب = «من أنا»، وعنوان الهيدر = «أين أنا»

عنوان الهيدر يعرض **اسم الرحلة المفتوحة**، والضغط عليه يفتح «ورقة الرحلة» (`TripSheetModal`). القاعدة التي يقوم عليها هذا التقسيم: `AccountMenu` مستوى *الحساب* (بروفايلي، تسجيل الخروج، وضع المسؤول)، وعنوان الهيدر مستوى *الرحلة* (تقاريرها، إدارتها، تبديلها).

وبهذا المقياس، موضع «إدارة الرحلة» داخل قائمة الحساب خطأ تصنيفي: من يبحث عن إعدادات رحلته لا يفتح قائمة صورته الشخصية. وكذلك «التقارير» داخل شريط أدوات `ExpensesPanel` — التقارير تخصّ الرحلة كلها لا قائمة المصاريف وحدها.

**ومع ذلك لم يُنقل أي منهما بعد، وهذا مقصود.** نقل زرّ ظاهر إلى داخل ورقة تُفتح بنقرة يربح الترتيب ويخسر قابلية العثور، والمقايضة تُحسم بتكرار الاستخدام لا بصفاء التصنيف: الفعل النادر (تصدير، سلة المهملات) يربح بالإخفاء، والفعل المتكرّر قد يخسر. فشُحنت الورقة **إضافةً محضة** بلا حذف أي مدخل قائم، ليقرّر الاستخدام الفعلي ما يستحق النقل. تكرار *فعل واحد* عالي التكرار بين شريط وقائمة ليس عيباً — تكرار *كلّ شيء* هو العيب.

⚠️ ولهذا فإن وجود «التقارير» في مكانين الآن حالة مقصودة مؤقتة، لا سهو ينتظر التنظيف.

**و«سلة المهملات» نزلت إلى نهاية سجلّ المصاريف، ولم تنتقل إلى إعدادات الرحلة.** طُرح نقلها إلى لوحة إدارة الرحلة فرُفض: السلة **مسار تعافٍ من خطأ لا إعداد**، ومسارات التعافي تسكن حيث يقع الخطأ — من حذف مصروفاً بالخطأ يكتشف ذلك وهو ينظر إلى السجلّ. وقاعدة «النادر يربح بالإخفاء» لا تنطبق: التصدير نادر *ومخطَّط له*، والاستعادة نادرة *وطارئة*. ولها في المكان نفسه طبقتا تعافٍ متدرّجتان — «تراجع» الفوري في التنبيه، ثم السلة لمن فاته وقته — وفصلهما يكسر تدرّجاً يعمل.

ولو نُقلت إلى `TripDetailPanel` لاصطدمت باثنين إضافيين: تلك اللوحة إعدادات **رحلة مختارة من قائمة** (قد تكون غير المفتوحة لدى المسؤول) بينما بيانات السلة مربوطة بـ`TRIP_ID` وحده — فكانت ستُعرض سلة رحلة تحت إعدادات رحلة أخرى؛ ونطاق الصلاحية مختلف — اللوحة للمنظّم والمسؤول، والاستعادة محكومة بـ`isAdmin()` في القواعد (`travelers` تقبل `update` بـ`isAdmin()` حصراً).

⚠️ وموضعها في الشيفرة **شقيق لكتلة العرض لا داخل أي فرع منها**: في تذييل `Virtuoso` (أو داخل فرع القائمة) كانت تختفي حين يحذف المسؤول *آخر* مصروف فتحلّ شاشة الفراغ محلّ القائمة — أي أن طريق التراجع يختفي في اللحظة التي وقع فيها الخطأ. `ExpensesPanel.test.tsx` يثبّت هذه الحالة بعينها.

**و«تصدير Excel» حُذف من شريط سجل المصاريف بلا بديل — ولم يُنقل إلى الورقة.** لم يكن نقطة دخول ثانية لميزة، بل **الزرّ ذاته مرتين**: استدعاء حرفي لـ`exportTripToExcel` بنفس الوسائط الأربع التي يستدعيها الزرّ داخل `ReportsView`. مكانه الطبيعي داخل التقارير حيث يُنظَر إلى ما يُصدَّر، والتصدير فعل نادر لا يخسر شيئاً بعمق نقرة. (`e2e/critical-flow.spec.ts` كان يختبر زرّ التقارير أصلاً لا زرّ الشريط.)

**وأول ما حُسم بهذه الطريقة: «تبديل الرحلة» ليست في الورقة.** «رحلاتي» مجموعة *المستخدم* لا خاصية من خصائص الرحلة المفتوحة — تعمل حتى بلا رحلة مفتوحة إطلاقاً (شاشة `TripPicker` لعضو بلا أي رحلة بعد)، فمكانها `AccountMenu` وحده. وقد كان هذا ظاهراً في الكود قبل أن يظهر في الاستخدام: كل فعل آخر في الورقة يستبدله اتحاد `ModalState` بنيوياً بمجرد فتحه، ووحده «تبديل الرحلة» احتاج `closeModal()` ملفوفاً حوله لأنه يغادر طبقة المودالات إلى شاشة أخرى. النشاز في الكود كان انعكاساً لنشاز في التصنيف: بقية الورقة أفعال *على* هذه الرحلة، وهذا فعل *مغادرة* لها.

### 🆕 Monthly rollover is a Cloud Function because the client *cannot* do it — not because a server is tidier

The feature was specified as a client-side `writeBatch`. That batch cannot commit under this project's own rules, and three independent reasons each kill it on their own:

1. `travelers` allows `update: if isAdmin()`. The trip **organizer** — precisely the person who closes the month — cannot write `deposited` from a browser at all.
2. `depositLogs` allows `create: if isAdmin()` too, and `utils/deposits.ts` establishes that every change to `deposited` must leave an audit line. No client path satisfies both.
3. `withinExpenseRateLimit` caps non-admins at one expense per second. Rolling over twenty members means twenty expenses in one batch.

Admin SDK bypasses all three. The transaction adds the fourth thing a batch could not guarantee anyway: **atomicity across "zero out" and "reopen."** A browser tab closed mid-batch leaves members zeroed with no opening balance — money missing from the ledger, silently.

**No client rule was weakened to make this work.** That was the alternative on the table, and it would have traded a permanent hole (any member writing `deposited` directly) for a feature used once a month.

### 🆕 Rollover deliberately changes nobody's net balance — that is the whole design, not a limitation

The ledger is cumulative and has no concept of months: `remaining = deposited + paid-out-of-pocket − share of expenses`. So closing a month **must** be net-zero, and the two movements are built to cancel exactly:

| balance | closing (last day of month) | opening (first day of next) |
|---|---|---|
| credit (`+`) | expense consuming it → 0 | deposit of the same value |
| debt (`−`) | deposit clearing it → 0 | expense re-applying it |

What it buys is the **line between the months**: filter expenses by the closed month's dates and every member reads exactly zero; the new month opens with an explicit, dated carried figure. Both directions reuse only the two mechanisms that already exist — a normal expense and an audited deposit movement — which is why this shipped with **zero schema change** to expenses, travelers, or deposit logs, and zero rule changes to any of them.

Two consequences follow, and both are intentional:

- Expense rules forbid `amount < 0`, so the debt case **inverts the order** of the same two mechanisms rather than writing a negative expense or adding a field.
- Rollover expenses are identified by a reserved `category` value (`تسوية شهرية`), not a new boolean. A category costs nothing — the field already exists and is already optional.

### 🆕 The double-rollover guard is threefold because a second run doubles everyone's balance

This is the one failure in this feature with real financial consequence, so no single guard carries it:

1. `period > lastClosedPeriod` inside `closeMonth` — lexicographic comparison of `YYYY-MM` *is* chronological comparison, which is why the period key is a string and not a `Date` (see `utils/period.ts` for the timezone trap that motivated it).
2. The trip doc is re-read **inside** the transaction before writing, catching two simultaneous clicks from different tabs.
3. `firestore.rules` refuses any client write to `lastClosedPeriod` / `currentPeriod` / `lastClosedAt` — admin and organizer alike. Only `closeMonth` writes them.

Guard 3 was verified by deleting it and confirming exactly one test out of 119 failed (guideline 18), then restoring it.

⚠️ And all four rollover fields sit in `isValidTripConfig`'s `hasOnly` list even though the client writes only `tripType`. This is the same trap already documented for `createdByUid`, `organizerUid`, and `bankDetails`: a `merge: true` write is evaluated against the **complete resulting document**, so omitting them would not block rollover — it would block **every later edit** to any trip that has ever closed a month.

### 🆕 Exit blocking lives in the function; the client check is an optional parameter, not a condition

`exitTraveler` recomputes the balance server-side and refuses a non-settled exit, naming the amount and direction. The client's `describeExitBlockFor` is an **optional** parameter of `useTravelerActions` — passed only by long-term trips. Its absence *is* standard-trip behaviour, which is why all 25 pre-existing traveler tests pass unmodified.

This shape was chosen over an `if (tripType === 'long_term')` inside the hook on purpose: a condition inside mature code is a thing that can be evaluated wrongly; an argument that is never supplied cannot be.

The same reasoning drives the UI split — `LongTermPanel` is a separate component behind one condition in `App.tsx`, and `ModalManager` receives no long-term props at all in a standard trip, so those modals are structurally unreachable there rather than conditionally hidden.

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
| `participants` holding strings | ~~`utils/participants.ts`~~ | **N/A — removed 2026-08-18.** `Expense.participants` is `number[]`; the string branch is deleted, not just unreached |
| `status` absent | `firestore.rules`, `utils/tripStatus.ts` | **No, since 2026-08-18** — all three trip-creation paths (`manageTrip`, `restoreTrip`, `create-trip.mjs`) now write it. See below for why the fallback *code* stays anyway |
| ~~`bankDetails` absent~~ | ~~`useTripConfig.ts` → `BANK_DETAILS`~~ | **N/A — field removed from the trip document entirely, 2026-08-21.** Bank details are no longer stored per-trip at all; see "Bank details stopped being duplicated" below. `isValidTripConfig` still *tolerates* a leftover `bankDetails` key on old documents (guideline 18 — see that entry), but nothing reads it and no fallback exists for it any more |

All four are now closed (the last one by removal rather than by a closed population). Their share of the data therefore falls toward zero as new records accumulate — the opposite of the usual "legacy debt compounds" trajectory.

**"Closed population" and "safe to delete the guard" are not the same claim, and 2026-08-18 is what forced the distinction.** `participants` is the only one where closing the population meant deleting the code — nothing writes strings, nothing ever will, the type system now enforces it. `status` and `bankDetails` are closed the same way *statistically*, but their guards live partly in `firestore.rules`, which only governs *client* writes — `manageTrip`/`restoreTrip`/`create-trip.mjs` all write through the Admin SDK and bypass rules entirely, so "the rule requires it" and "every writer actually sends it" are two independent facts, and only re-auditing every writer (not just the live database) proves the second one. `create-trip.mjs` was the counterexample: it silently never wrote `status` until this date, so the population being closed in *production data* was accidental, not guaranteed. Removing the rules-side default now would trade a graceful "defaults to active" for an opaque permission error the moment any future script repeats that same mistake — a worse failure for a smaller win. Kept deliberately; see the 2026-08-18 changelog entry above for the full reasoning.

**Why no `schemaVersion` field.** The real debt was never the guards; it was having **no way to prove a guard is no longer needed**, so it stays forever out of uncertainty rather than necessity. `schemaVersion` solves that by taxing every write and every rule forever. `scripts/audit-legacy-docs.mjs` answers the same question — for each guard, how many documents still need it — at zero cost on the write path, because the question is asked once every few months, not on every read.

⚠️ **Before deleting a guard whose counter reads zero:** an offline write can arrive days later (`persistentLocalCache`), and any device on an old bundle still writes the old shape. Run the audit on **every** environment, wait, run it again, then delete. **And, per 2026-08-18: audit every *writer*, not just the live database** — a script that never got the memo can keep a population's count at zero for the wrong reason.

**Measured — production, 2026-08-11 → 2026-08-18** (1 trip, 114 expenses both times):

| Guard | 2026-08-11 | 2026-08-18 |
|---|---|---|
| `createdByUid` absent | **2 of 114 expenses (1.75%)** | **2 of 114 — unchanged, still needed** |
| `participants` holding strings | 0 | 0 (guard removed) |
| `status` absent | 1 of 1 trip — the original trip, which predates the field | 0 |

The point of the `createdByUid` row is not that 1.75% is small; it is that **the count of 2 cannot grow while the denominator does**, so the guard's relevance decays on its own. That is what "closed population" buys, and it is why no migration was run: rewriting live documents with no database backup (see `RECOVERY.md` §4) costs more than the branch it would let us delete.

### 🆕 Account linking preserves the `uid`, which is why it costs almost nothing

An anonymous `uid` is the **only** key to trip membership: `verifyTripPin` writes it into the custom claims and `isMember()` reads it from the token. Clearing browser data therefore loses every trip — and PINs are stored hashed and never shown again, so a member who does not remember the PIN loses access permanently.

`linkWithPopup` keeps the same `uid`. So `createdByUid` on every expense stays correct, the `trips` claim survives untouched, and **`firestore.rules` does not change by a single character**. That last point is the design-health signal: a feature that touches identity without touching the rules is a feature added at the edge.

**Google first, not Email/Password-only** — even though Email/Password is already enabled for admin sign-in. Google is one button; email drags in a registration form and a reset flow, several times the UI for the same result *for someone who already has a Google account*. 🆕 **That qualifier turned out to matter: Email/Password shipped 2026-08-17 as a second option, not a replacement.** Someone with no Google account (or who avoids OAuth) had zero safety net under the Google-only design — exactly the user most exposed to losing access. See *Email/Password as a second linking path* below.

**⚠️ The conflict path is the part that gets skipped.** If the chosen Google account already has a session (exactly the second-device case), `linkWithPopup` fails with `auth/credential-already-in-use`, the client signs in to the existing account — and **the `uid` changes**, orphaning the anonymous session's memberships. `mergeAnonymousTrips` recovers them.

The proof of ownership needs no new mechanism: the anonymous session's **ID token is itself the proof** — signed by Firebase, unforgeable, and `verifyIdToken` checks signature and expiry together. The client captures it *before* the switch and holds it in a local variable for seconds. ⚠️ Never persist it: storing it turns a short-lived proof into a stealable secret for no gain.

Two things the merge deliberately does not do:

1. **It does not move `createdByUid`.** The user cannot edit expenses recorded under the old session (an admin can). The alternative is rewriting live financial documents with no database backup — see `RECOVERY.md` §4.
2. **It does not delete the old anonymous account.** Keeping it preserves the ability to diagnose a bad merge, and anonymous accounts cost effectively nothing.

🆕 **That first point silently produced a UX gap until 2026-08-18: nothing ever told the user it happened.** `ExpenseListItem`'s ownership check (`src/components/ExpenseSection.tsx`) just hides the edit/delete controls for a non-owned row — no error, no explanation, indistinguishable from never having had permission. `src/utils/mergeNotice.ts` closes it: `markUidChanged()` fires the instant sign-in succeeds in the conflict path (before the immediate `window.location.reload()` in `onLinked` would otherwise erase the chance to show anything), and `useAppCoordinator.ts` consumes the flag once after the next boot to toast a plain-language explanation. `sessionStorage`, not React state, is what survives that reload.

**The banner is an offer, not a gate.** PIN entry remains the full default path. Forcing registration would kill the product's core property — joining a trip in seconds.

⚠️ **It renders on the main screen *and* in `TripPicker`, and that is not duplication.** It was placed in `TripPicker` alone at first — and `TripPicker` only appears automatically when the app is opened with no `?trip=`, while the header's "my trips" button requires more than one trip. So a member who opens a trip link and belongs to one trip — most members — never saw it. The offer was gated behind a condition that excluded the people it was built for, which is guideline 17 violated inside the feature that documents it. `App.test.tsx` now pins that it reaches the main screen.

### 🆕 Email/Password as a second linking path — same merge machinery, zero function changes

`docs/PLAN-account-linking.md` Stage 3. The gap: a user with no Google account had no linking option at all under the Google-only design, and that user is exactly the one anonymous auth exposes most — no saved email, no saved PIN outside the browser, so clearing browser data is a total, unrecoverable loss. `useAccountLink.ts` gained `linkWithEmail(email, password)` and `resetPassword(email)` alongside the existing `linkAccount`; `LinkWithEmailForm.tsx` is a collapsed-by-default secondary option in `SaveAccountBanner`, Google still shown first and still the one-click path for anyone who has it.

**`mergeAnonymousTrips` did not change by one character.** It was already provider-agnostic — it only checks that the `uid` changed, never which provider changed it — which is exactly the "feature added at the edge" signal from the section above, now proven a second time by a second provider needing zero server changes.

⚠️ **The conflict path *is* the recovery path here, and there's no separate "sign in" screen.** For Google, "you already have an account" is discovered implicitly — the popup itself knows if the browser has a Google session. Email/Password has no such side channel; the only way the server learns "this email is taken" is `linkWithCredential` throwing `auth/email-already-in-use`. So the exact same "save my account" form serves two purposes with no UI distinction at all: typing a fresh email+password links a new account (same `uid`, nothing moves); typing an email+password that's *already* saved — from any new anonymous session, i.e. after losing the old one — throws that error, and the hook responds by attempting `signInWithEmailAndPassword` with the same values the user just typed. Success proves ownership and triggers the identical `mergeAnonymousTrips` merge Google's conflict path uses; failure means either a typo or someone else's email, and the hook does **not** guess between those — it just says the password doesn't match and stops, no sign-in attempted, nothing merged.

**`completeMerge` was extracted as a shared helper** during this change — both providers' conflict paths now call the same function instead of duplicating the "call `mergeAnonymousTrips`, translate `resource-exhausted` specially, treat other merge failures as a completed-link-with-a-warning" logic inline. Google's existing conflict-path tests kept passing unmodified after the extraction, which is what confirmed the refactor was behavior-preserving.

**`resetPassword` exists for a reason Google structurally doesn't need:** Google recovers its own accounts entirely outside this app. An Email/Password account created by *this* app is this app's problem alone — without `sendPasswordResetEmail`, a user who forgets their password would have a feature indistinguishable from not having one. It needs no Cloud Function and no rule changes; Firebase sends the email and hosts the reset page itself. It's reachable from the same form with only an email typed in, deliberately not gated behind a failed link attempt first — a user who has fully forgotten their password should not have to fail at typing it before being offered a way out.

⚠️ **A wrong password for an already-linked email must not sign in and must not merge — verified as the actual negative case, not assumed** (guideline 18): a dedicated test asserts `mergeAnonymousTrips` is never called and `onLinked` is never invoked when `signInWithEmailAndPassword` rejects, distinct from the happy-path merge test.

**Manually click-tested by the owner, 2026-08-17** — linking with a real email/password succeeded cleanly, confirming the automated coverage above matches real behaviour rather than only mocked expectations.

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

### 🆕 The trip organizer role lives in the roster, not the token — deliberately, and it costs a `get()`

Stage 3 of `docs/PLAN-member-management.md`, shipped 2026-08-18. `trips/{tripId}/members/{uid}.role: 'organizer' | 'member'` lets the admin delegate trip-scoped management (name/bank/itinerary/status, invite/remove members) without handing over `admin: true` — which is global and would hand over every other trip in the project too.

**Two placements were possible, and the roster won on purpose — the opposite trade from `isMember()`.** Putting the role inside the custom claim (`trips: { [tripId]: 'organizer' }` instead of `true`) would make the read free, same as membership itself. But it also changes the shape `isMember()` parses on *every* request, touches the 900-byte claim budget, and — the deciding factor — an organizer's own writes (editing the trip, removing a member) are already rare, admin-panel actions, not a hot path like expense creation. `isOrganizer(tripId)` costs one `get()` on exactly those rare writes, and `isMember()` itself doesn't change by a character. Same reasoning as `tripStatus()` above, applied a second time.

**Who can grant the role is the question the original plan text didn't answer, and it landed conservative: the global admin only.** `manageMember` (`mode: 'setRole'`) rejects any caller without `admin: true`, no exception. Delegating a role that itself grants real write access isn't something an organizer should be able to hand to a peer — the same reasoning `set-admin.mjs` gives for keeping admin-granting a script, never a UI button.

**And an organizer removing a member now needed a check `mode: 'remove'` never had before: who is the target?** Opening removal to organizers without this would let any two organizers on the same trip eject each other with zero admin involvement — a horizontal-escalation hole. So when the caller isn't a global admin, `manageMember` reads the caller's own roster row (must be `'organizer'`) *and* the target's — refusing if the target is a global admin or another organizer. An organizer removing a global admin from the roster wouldn't even do anything real (same `stillHasAccess` fact as before), but "an action that changes nothing yet appears to succeed" is worse than refusing it outright.

⚠️ **Verified live, not assumed (guideline 18):** `manageMember.run()` invoked directly against real Auth+Firestore emulators (same technique as `restoreTrip`) covered ten cases including every rejection above — organizer removing a plain member (succeeds), removing another organizer (rejected), removing the admin (rejected), a plain member removing anyone (rejected), an organizer granting a role to someone (rejected), setRole on someone who never joined (rejected), and — the same guideline-18 case that matters for `remove` — a removal via an organizer never touches the target's *other* trip memberships either. All ten passed.

**The organizer's own admin panel is the existing `TripAdminView`/`TripDetailPanel`, not a new component.** A `viewerRole: 'admin' | 'organizer'` prop hides the tabs that stay admin-only (backup, PIN reset, delete trip) and the role-toggle button in the members list. The trickier part: `TripAdminView`'s trip list is normally `useAllTrips(isAdmin)`, a query only `isAdmin()` satisfies — an organizer can't run it. So for an organizer, `useAppCoordinator.ts` builds a **one-element** `trips` array from their own already-subscribed `useTripConfig` data instead. This isn't a filtered view of a bigger list; there structurally is no bigger list on that code path, which is what actually keeps an organizer from ever seeing another trip through this screen — not a check that could be forgotten.

**`useMyTripRole.ts` is the self-check, and its shape follows the same rule as `useTripMembers.ts`: a `permission-denied` reading your own roster row *is* the answer.** `isOrganizer(tripId)` in the rules only lets the read through when the role really is `'organizer'`; anything else — plain member, never joined, wrong trip — fails the read, and the hook treats that failure as `false`, not an error to log or surface.

**Confirmed across two genuinely separate browser sessions** (`e2e/organizer-role.spec.ts`), because this is exactly the class of bug a unit or rules test can't see: one Playwright context joins as a plain member, a second signs in as admin and promotes that member via the real UI, then the *first* context reloads and is checked for the "manage trip" button, the absence of admin-only tabs, and a real trip-name edit that persists. Writing it surfaced a genuine race unrelated to this feature's own logic: `openTripAsMember` in `e2e/utils/flows.ts` clicks "continue" but never waits for `verifyTripPin` to actually finish, so two sessions joining back-to-back have no guaranteed order — which mattered here because the test needed to know which roster row was "the real member" to promote the right one.

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

⚠️ 🆕 **`components/admin/QrCode.tsx` and its test were deleted** when the PIN was removed entirely (see the entry below) — the manual "scan + tell them the PIN separately" flow it served no longer has a PIN to pair with. The reasoning above is kept as history for the `qrcode-generator` dependency choice itself, which is otherwise unexplained if the component is ever reintroduced (e.g. for an invite link).

### 🆕 PIN access and anonymous sessions are removed entirely — mandatory Google/Email sign-in

**This reverses two decisions above on purpose**: "Never call `signInAnonymously` unconditionally on load" assumed anonymous sign-in stays, and "Account linking preserves the `uid`" (below) exists only because anonymous sessions existed to link *from*. Both are now dead premises, not just dead code.

**Why now:** the Hybrid Traveler Identity model (`Traveler.uid`, self-service personal statements, self-rename on join) all depend on a real, durable account. An anonymous `uid` that evaporates on cache-clear was always in tension with that — PINs also carry no audit trail (no record of *who* entered a code, only that *some* browser did). Once personal statements and self-rename shipped, the PIN/anonymous pair stopped being a viable long-term base rather than a convenience worth keeping alongside it.

**What changed:**
- `verifyTripPin`, `manageTrip`'s `resetPin` mode, `tripSecrets/{tripId}`, and the PIN-verification rate limiter are deleted from `functions/index.js` and `firestore.rules` outright — not deprecated, not left dark.
- `useAuth.ts` no longer calls `signInAnonymously` under any circumstance. `AuthGate.tsx` (replacing `TripGate.tsx`) is a mandatory Google/Email sign-in screen shown whenever `user === null`, before any other routing branch.
- `joinViaInvite` rejects `sign_in_provider === 'anonymous'` explicitly, and `isMember()` in `firestore.rules` folds in the same check (`isNotAnonymous()`) as its single choke point — see the comment there for why one function beats sprinkling the check across every `allow` block.
- The account-linking machinery (`useAccountLink.ts`, `SaveAccountBanner.tsx`, `LinkWithEmailForm.tsx`, `mergeAnonymousTrips`) is deleted, not left inert: every one of them existed solely to rescue an anonymous session's memberships from a linking conflict, and that scenario cannot occur once no anonymous session is ever created. `docs/PLAN-account-linking.md` is kept as an archived design record with a superseded notice at its top, not deleted — this entry is the current source of truth going forward.

⚠️ **This is an accepted breaking change with no migration path, by explicit product decision.** Every trip member who was still on an anonymous session (never linked a real account) loses access the instant `firestore.rules` is redeployed — their `trips` claim is untouched, but `isMember()` now rejects the session carrying it. There is no grace period and no client-side warning beforehand; the only way back in is joining again via a fresh invite link on a real account. This is the actual mechanism that makes the change real, not a side effect to work around.

### 🆕 Trip creation is self-serve now — this reverses two decisions above on purpose

**Both explicitly said the opposite.** `firestore.rules` (the comment above `allow create` on `trips/{tripId}`) and `docs/PLAN-member-management.md` ("منظّم رحلة لا يُنشئ رحلات جديدة... دون: إنشاء رحلات") both scoped trip creation to the global admin alone, on purpose, more than once. This entry replaces that with a WhatsApp-style model: **any signed-in, non-anonymous account can create a trip and becomes its organizer immediately** — no admin involved, no invite consumed (there is nothing to invite into yet).

**Why the reversal is not a contradiction of either original reason.** The admin-only rule for `mode: 'organizer'` (delegated authority on an *existing* trip someone else made) is untouched — an organizer still cannot create a second trip or promote anyone. What changed is a structurally different action: starting a brand-new trip that does not exist yet, which was never something the organizer role's scope was reasoned about at all. `firestore.rules`'s `allow create` line on `trips/{tripId}` is **also unchanged** — self-serve creation goes through `manageTrip` (Admin SDK, bypasses that rule entirely), exactly like admin creation always has. The client still cannot write a trip document directly under any identity.

**`manageTrip` (`functions/index.js`) now does, for a non-admin caller only, everything `joinViaInvite` does for a real invite** — merges the `trips[tripId]=true` claim (`assertClaimsFitTokenLimit` included), calls `recordMembership(tripId, userRecord, { role: 'organizer' })` (the function already accepted an `extra` payload; setting the role was one line), and best-effort `provisionTravelerForUid`. A cooldown (`SELF_SERVE_TRIP_COOLDOWN_MS`, `users/{uid}.lastTripCreatedAt`) guards against scripted abuse, mirroring the admin exemption already used for the expense rate limiter. Deletion is untouched — still admin-only, still requires an empty trip — because it was never asked for and is the more dangerous of the two.

**A new top-level collection, `users/{uid}`, backs the auto-fill.** A signed-in user can store `displayName` + `bankDetails` there (owner-only read/write, `isValidUserProfile`), and `NewTripForm.tsx` pre-fills — editably — from it on creation. The value is copied into `trips/{tripId}.bankDetails` once at creation time, not referenced live, for the same reason the rest of this file already gives for bank details: an organizer changing their personal account later must not retroactively rewrite a past trip's settlement instructions.

**Two real bugs surfaced building this, both worth keeping as the record — guideline 18, not guideline 18 as a slogan:**

1. Writing `createdByUid` on the new trip document (useful now that creation isn't admin-exclusive — audit trail for "who made this") without adding it to `isValidTripConfig`'s `hasOnly(...)` broke *every subsequent client edit to that trip's name/bank/status*, not just the write that introduced it. `request.resource.data` on a `merge: true` write is the **full resulting document**, so a field the client never touches still has to be declared allowed the moment it exists on the doc — exactly the same trap `isValidUserProfile` was written correctly to avoid for `lastTripCreatedAt` right above it, missed on the sibling collection at first. `e2e/self-serve-trip-creation.spec.ts` caught it live against the real emulator (the "حفظ التغييرات" step failed with a genuine `PERMISSION_DENIED`, not an assumed pass) — fixed by adding `createdByUid` to the allow-list plus an explicit immutability check (`resource.data.createdByUid` cannot change on `update`), the same pattern `isExpenseOwner`/`createdByUidUnchanged` already established for expenses.
2. `TripPicker`'s auto-show condition required `pickerTrips.length > 0` — reasonable when an empty picker had nothing to offer, but self-serve creation is now the one useful thing a *zero-trip* account can do, and that condition hid the picker from exactly that account (falling through to `NotAMemberScreen`, which only points at an invite link). This is guideline 17 recurring in a new spot: *ask who a visibility condition excludes* before shipping it, not after. The fix dropped the trip-count clause entirely — the empty state itself is the entry point now.

### 🆕 The header's three standalone buttons became one AccountMenu — and "sign out" and "admin mode" are no longer the same button

Product feedback after the entry above shipped: the profile modal's own header button, plus "رحلاتي" and the admin toggle, were three separate icon buttons competing for the same small strip of header space, and the profile *tab* originally requested for it would have lived inside `TripDetailPanel` — reachable only by an existing admin/organizer, which is exactly the account a brand-new zero-trip member (the one guideline 17 above was about) is not yet. `AccountMenu.tsx` replaces all three with one avatar/initial trigger and a dropdown, and profile editing stays reachable from anywhere a signed-in user can see the header — not folded into trip-scoped UI.

**The admin toggle button was doing two unrelated things behind one label**, and splitting it surfaced a real gap: `onToggleAdmin` was `isAdmin ? handleAdminSignOut() : openAdminSignIn()` — for a non-admin member, clicking it opened an *admin* sign-in form, not a sign-out option. A plain member had **no way to sign out of the app from the UI at all** (confirmed by grepping `signOut(auth)` — it was called from exactly one place, and that place was unreachable for a non-admin account). The menu now has two independent items: "لوحة الإدارة" (admin panel shortcut, `modals.openTripAdmin`, shown only when `isAdmin`) and "تسجيل الدخول كمسؤول" (the old admin-switch capability, preserved, shown only when `!isAdmin`) — plus a "تسجيل الخروج" item that is *always* present and calls the same `handleAdminSignOut`/`signOut(auth)`, now decoupled from admin status entirely.

**Bank details stay duplicated between `users/{uid}` and `trips/{tripId}.bankDetails` on purpose** — see the snapshot-not-reference reasoning in the entry above and in the pre-existing bank details section of this file. What changed here is discoverability: `TripDetailPanel`'s bank tab now has an "استيراد من بروفايلي" button (`importBankFromProfile` in `TripDetailPanel.tsx`) that copies `profile.bankDetails` into the local, unsaved `bankForm` state — same one-shot copy semantics as `NewTripForm`'s auto-fill, still requires the existing "حفظ التغييرات" click, and touches nothing until then. It only renders when the profile actually has bank data worth importing.

⚠️ **`e2e/admin-persists-across-trips.spec.ts` and `openTripAsAdmin` (`e2e/utils/flows.ts`) had to change, not just the component** — they asserted the now-deleted "إغلاق المسؤول" button directly. The replacement opens the menu (`openAccountMenu`, new in `flows.ts`) and checks for the `menuitem` role instead of `button`, since dropdown items and the trigger are no longer the same element. Every other spec that calls `openTripAsAdmin` inherited the fix automatically — the helper is the one place this had to be taught the new UI.

### 🆕 Bank details stopped being duplicated — this reverses the "snapshot, not reference" call two entries above, on purpose, for this one field only

**The two entries directly above this one both say bank details are copied on purpose, so an organizer editing their personal account later must not retroactively rewrite a past trip's settlement instructions.** That reasoning is still correct for *why copying was originally chosen* — it just turned out to be the wrong tradeoff specifically for bank details, because the failure mode in practice was the opposite of the one it guarded against: an organizer's IBAN going stale on every trip they'd already created, with no single place to fix it, was a worse and *more common* problem than a past trip's settlement instructions changing underneath someone mid-settlement. Every other snapshot in this codebase (a `name` typed at expense-entry time, a rate captured at conversion time) protects a historical record of something that already happened; a bank account is not a historical fact, it is *whoever the organizer is banking with right now*, and freezing it at trip-creation time only meant it silently drifted from the truth.

**The fix: `trips/{tripId}` no longer stores `bankDetails` at all.** `manageTrip` (`mode: 'create'`) now writes `organizerUid: request.auth.uid` instead. `BankDetailsCard` (`Misc.tsx`) and every other place that shows an organizer's bank account read it live via `useOrganizerBankDetails(organizerUid)` — an `onSnapshot` on `users/{organizerUid}` — instead of from the trip document. Editing your profile once now updates every trip you organize, immediately, with zero writes to any trip document. `NewTripForm.tsx` and `TripDetailPanel.tsx` lost their bank-detail input fields and the "استيراد من بروفايلي" button described in the entry above entirely — there is nothing left to import into, since there is no per-trip copy to import into.

**This creates a genuine "who is the organizer" requirement that did not strictly exist before**, because the read path now depends on `organizerUid` naming exactly one account. `manageMember` (`mode: 'setRole'`) enforces single-organizer-per-trip as a result: promoting a new organizer atomically demotes whoever held the role before (in the same `db.batch()`), rather than allowing multiple simultaneous organizers as was technically possible previously. A trip created via the admin panel now also gets an organizer assigned automatically — the creating admin — where previously admin-created trips had none; this closes a gap that would otherwise have left `BankDetailsCard` permanently empty on every admin-created trip.

**The reverse index this needs — `users/{uid}.organizesTripIds` — exists purely because Firestore security rules cannot loop over a claim map.** A trip member needs to read their organizer's profile (`users/{organizerUid}`) to see the live bank details, but `firestore.rules` cannot iterate the reader's `request.auth.token.trips` map to check "is `organizerUid` the organizer of any trip I'm in." Both directions have to be expressible as a single `hasAny()` intersection, which requires a list on *both* sides: `trips/{tripId}.organizerUid` (trip → organizer, tells the client whose profile to subscribe to) and `users/{uid}.organizesTripIds` (organizer → their trips, lets `organizesSharedTrip()` in the rules intersect it against the reader's claim keys). Neither field alone is sufficient; both are kept in sync together in `manageTrip`, `manageMember`, and `restoreTrip`.

**Existing trip documents still carry the old `bankDetails` field, and `isValidTripConfig` still accepts it — not because it is used, but because rejecting it would break every edit to every trip that predates this change.** `merge: true` writes are evaluated by Firestore rules against the *full resulting document*, not just the changed fields (guideline 18's `createdByUid` trap, recurring for the third time in this file — see the two entries above). A trip edited today that happens to carry a leftover `bankDetails` field from before this change would fail `hasOnly(...)` on something as unrelated as a name edit if that key weren't still allow-listed. There is deliberately no migration script to strip it from old documents (see the plan's non-goals) — the existing "تعيين منظّماً" flow in the Members tab already writes `organizerUid` the moment any trip gets an organizer assigned, and `scripts/audit-legacy-docs.mjs` reports trips still missing one (`tripsWithoutOrganizerUid`) for visibility, not automatic repair.

**A real, unrelated bug surfaced while touching the adjacent code, fixed in passing:** `useUserProfile.ts`'s fallback for a brand-new, never-filled-in profile was defaulting to `BANK_DETAILS` from `constants.ts` — the app owner's own real IBAN — meaning every new user's blank profile silently displayed the owner's personal bank account until they filled in their own. Replaced with a genuinely empty `EMPTY_BANK_DETAILS` local constant; `constants.ts`'s `BANK_DETAILS` export is deleted, it has no remaining use anywhere.

### 🆕 A self-serve creator's auto-provisioned traveler now names itself from the profile too — and gets synced there afterward, not just seeded once

**Reported live, in production, the day this shipped:** a member with no display name set on their Firebase Auth account (routine for Email/Password sign-in — Auth's `displayName` is a separate field from anything the app asks for) created a trip and became its organizer, and the traveler auto-provisioned for them showed the generic `مسافر جديد` default — despite having already filled in their real name in "بروفايلي" moments earlier. `manageTrip` and `joinViaInvite` both resolved the new traveler's name from `request.auth.token.name || userRecord.displayName` only — Auth's own name — never from `users/{uid}.displayName`, the field the app's own profile screen actually edits. Fixed by adding `getProfileDisplayName(uid)` and trying it first at both call sites.

**That fixes new provisioning, but not a name already wrong** — and there turned out to be no way to fix one at all: the pencil icon on a traveler card (`TravelerSection.tsx`) opens a balance-adjustment modal, not a rename form: there has never been a "rename traveler" control anywhere in the app, admin included. The user's own instinct was to ask why the traveler's name isn't simply *the same field* as the profile's, mirroring the bank-details entry directly above this one.

**It isn't, on purpose, and the reason is scale, not principle.** Bank details are read live from exactly one profile per trip — the organizer's — in exactly one card. A traveler's name renders everywhere a trip does: cards, expense-participant chips, reports, printed statements. Making every account-linked traveler's name a live subscription to its own profile document would multiply `useOrganizerBankDetails`'s one-listener-per-trip into one-listener-per-linked-traveler, in a codebase whose `DataContext`/`UIActionsContext`/`UIFormContext` split exists specifically to keep expense-heavy views cheap (see the context-split entry above). It would also remove the ability to have a trip-specific nickname different from your global profile name — a capability nothing currently uses, but a live link would foreclose silently rather than by choice.

**The fix actually shipped, `useSyncTravelerNameFromProfile.ts`, is a middle path: eventual, not live, and reuses an existing function instead of adding a UI.** `updateMyTravelerName` (`functions/index.js`) already existed and was never restricted to being called once — that restriction was purely a client convention (only ever invoked from the post-join "needsName" one-step form). The new hook watches the signed-in member's own traveler entry in the currently open trip; whenever its stored `name` differs from a non-empty `profile.displayName`, it calls `updateMyTravelerName` silently, once per distinct mismatch (a ref, not React state, tracks the last value attempted — no retry queue on failure, same restraint as everywhere else in this file). No button, no modal, and a profile edit made once now catches up every trip the member is *in*, not just the one they organize.

### 🆕 "Empty trip" for deletion purposes now means no *active* data — auto-provisioning made "any traveler exists" trivially always true

**Another live regression, reported the same week:** an admin created a scratch trip to test something, soft-deleted themselves from its traveler list (the only removal path that exists), and then had trip deletion refused — on a trip that looked, and was meant to be, empty. `manageTrip` (`mode: 'delete'`) and `restoreTrip`'s "target must be empty" guard both queried `travelers.limit(1)` with no filter at all: the mere existence of a traveler document, soft-deleted or not, was treated as "has data, refuse." That check predates self-serve creation and its auto-provisioning (see the self-serve-creation entry above) — back when only an admin could create a trip and nothing auto-populated it, "any traveler exists" and "has real financial history" were the same fact. They stopped being the same fact the day `provisionTravelerForUid` started running unconditionally on every trip creation, admin panel included: **every trip now has at least one traveler from the instant it's created**, so the guard became permanently true and the delete-a-mistake feature became permanently dead — for months before anyone hit it, because nobody had reason to delete a trip immediately after creating it until self-serve creation made "oops, wrong ID, let me start over" a routine flow.

**The fix had to be more careful than "just check `deletedAt`," because a soft-deleted traveler is not automatically financially inert.** `deposited` can go back to `0` after real deposit activity (add 500, subtract 500), and `depositLogs` — genuinely immutable, kept as dispute evidence — would still exist underneath. So `checkTripHasProtectedData(tripId)` (`functions/index.js`, shared by both `manageTrip` and `restoreTrip` — same condition, kept in one place instead of copy-pasted twice as it was before) checks any *active* traveler or expense first (refuses immediately — live data someone may depend on), and only then, for the travelers that remain (all soft-deleted), whether any of them has so much as one `depositLogs` entry. Only if both come back clean does the trip count as empty. A soft-deleted, zero-deposit, never-touched traveler — exactly what auto-provisioning creates and exactly what a scratch trip's creator soft-deletes — now correctly stops blocking deletion; a soft-deleted traveler with real deposit history still blocks it, same as before.

**Bounded at 300 documents per collection per check** (`MAX_PROTECTED_DATA_CHECK_DOCS`), not `limit(1)` like the old check — inspecting *content*, not just existence, needs the actual documents. A trip with more travelers or expenses than that is not a "clean up my mistake" candidate in the first place, and the guard staying conservative in that regime (most likely finds an active one within the first 300 anyway) costs nothing real.

⚠️ **First cut of this fix treated expenses differently from travelers — existence alone still refused, soft-deleted or not — reasoning that "an expense document *is* the record, unlike a traveler." That inconsistency shipped, and broke the same way within the week: reported by the same user who hit the traveler case, this time after registering one test expense and soft-deleting it.** The reasoning doesn't survive contact with how expenses actually work in this codebase: an expense has no separate immutable log the way a traveler's `depositLogs` does — the expense document itself follows the exact same soft-delete/restore lifecycle as a traveler, no more sacred than one. There was never a structural reason to treat them differently; `checkTripHasProtectedData` now applies the identical active-only rule to both collections, and `depositLogs` remains the one genuinely special case that survives soft-deletion. The lesson generalizes past this one bug: when justifying an asymmetry between two same-shaped things ("X blocks unconditionally, Y only if active"), the asymmetry itself needs its own reason, not just a reason for the stricter side — "no counter-argument occurred to me" isn't evidence the softer side is actually safe.

### 🆕 Trip lifecycle now advances itself — Phase 1 only: status transitions, never deletion

**The entry above fixed deletion for trips someone deliberately emptied by hand. It did nothing for a trip that simply ended.** A real trip with real expenses and deposits — the exact data `checkTripHasProtectedData` exists to protect — can never be deleted, no matter how many years pass, because nothing about a trip's data changes on its own. The user who reported both delete-guard bugs pointed out the better fix directly: trips should move through their lifecycle on their own schedule (`active` → `completed` → `archived`), and only once a trip has sat archived long enough should final deletion become available at all — not blocked forever, not automatic either.

**This phase ships only the status progression — automatic, but fully reversible, and touching no financial data whatsoever.** Whether an archived-long-enough trip should ever become deletable despite holding real data is deliberately deferred to a Phase 2 that does not exist yet: that step can permanently destroy real deposit/expense history, and earns its own decision, not inheritance from this one. See the plan this shipped from for the full reasoning trail.

**`trips/{tripId}.statusChangedAt` is new, and is the one piece of state this phase actually needed.** `status` alone has never carried a timestamp — there was no way to answer "how long has this been archived?" without one. It's written by the client on every manual status change (`useTripAdminActions.ts`: `saveTripStatus` now sends `{ status, statusChangedAt: Date.now() }` in one write, never separately) and by the new scheduled transition below — same field, same meaning, regardless of who changed it. A trip that predates this feature has no `statusChangedAt` at all, and gets none by assumption: the first time anything touches its status — a human, or the schedule below — is the first time the field exists. No backfill script invents a timestamp for history nobody recorded, the same "closed population, no retroactive guess" principle already applied to `organizerUid`/`createdByUid` twice in this file.

**`advanceTripLifecycle` (`functions/index.js`) is the first `onSchedule` function in this codebase** — daily, no human trigger. Its actual logic lives in a separately exported `advanceTripLifecycleLogic(now)`, callable directly instead of through the schedule wrapper; this was a deliberate testability choice, verified empirically (not assumed) before committing to it — a probe script confirmed a Playwright e2e test can `require('../functions/index.js')` directly against the Firestore emulator and get correct results, without needing the `pubsub` emulator that `onSchedule` triggers normally require (and that `test:e2e` doesn't run). `e2e/trip-lifecycle.spec.ts` walks one seeded trip through its full `active → completed → archived` path across two calls, backdating `statusChangedAt` between them to simulate elapsed time instead of waiting real days.

**A trip only enters this pipeline if it has an itinerary with real dates.** `tripEndTime(itinerary)` (`src/utils/itinerary.ts`, mirrored server-side as `tripEndTimeJs` — the same "no shared package between client and functions" reason `isValidNameKeyJs`/`deriveShortNameJs` already exist) returns the last segment's arrival time, or `null` for an empty itinerary. A trip nobody bothered to fill an itinerary for has no truthful signal for "when did this end," and stays `active` until a human changes it — not a gap, a scope line drawn on purpose. Likewise a `completed` trip with no `statusChangedAt` (predates this feature, never manually touched since) never auto-archives — same closed-population reasoning as above, applied to the second transition too.

### 🆕 Phase 2 shipped: a trip archived 90+ days can be deleted despite holding real financial data — deletion stays human-triggered, and now actually purges the data instead of orphaning it

**The entry above deliberately stopped short of this.** Two decisions were flagged as needing an explicit, separate answer before writing any of this code, and both were asked and answered directly rather than assumed: deletion stays a **human action** (an admin still clicks "حذف الرحلة" and types the trip ID to confirm — the schedule never deletes anything on its own, it only advances `status`), and the grace period is **90 days** archived, not the 180 floated as a placeholder in the original plan.

**`isEligibleForAgePurgeJs` (`functions/index.js`, mirrored client-side as `isEligibleForAgePurge` in `src/utils/tripStatus.ts` for the UI's own explanation, same client/server-duplication pattern as `tripEndTime`/`tripEndTimeJs`) sits in front of `checkTripHasProtectedData` inside `manageTrip` (`mode: 'delete'`), not inside it.** A trip that is `archived` and has been for more than `TRIP_PURGE_ELIGIBLE_MS` skips the protected-data check entirely — active travelers, expenses, deposit logs, all of it, none of it matters once a trip is old enough and an admin has deliberately chosen to delete it. Everything younger, or still `active`/`completed`, goes through the exact check described in the entry above, completely unchanged.

**A third question surfaced during implementation that the original plan hadn't asked: does purging an eligible trip actually delete `artifacts/{tripId}` (travelers, expenses, deposit logs), or just the `trips/{tripId}` config doc — leaving the real data orphaned but physically intact, exactly like the ordinary empty-trip delete already does?** That existing behavior was fine for Phase 1: an ordinary deletable trip has nothing of substance under `artifacts/` to begin with, so there was never anything worth cleaning up. Phase 2 is different by construction — a trip becomes eligible for this path *specifically because* it holds real data the normal guard would otherwise protect. Leaving that data sitting there, merely unreachable through the app, would make "حذف نهائي" a polite fiction. Asked and confirmed explicitly: the purge path now also runs `db.recursiveDelete()` on `artifacts/{tripId}` — travelers, expenses, deposit logs, all of it, genuinely gone, not orphaned. The ordinary path is untouched; it still only removes `trips/{tripId}` and its `members` subcollection, because there was never anything else there to remove.

**The danger-zone UI (`TripDetailPanel.tsx`) says so before the admin clicks, not after.** The existing copy ("الحذف متاح للرحلات الفارغة فقط") would have been actively misleading for an eligible-by-age trip that plainly isn't empty. A conditional warning renders only when `isEligibleForAgePurge` is true, naming the exception and what it means — real financial data, actually destroyed — so an admin never discovers this by surprise after the fact.

### 🆕 The three UI Contexts became one Zustand store — same volatility split, `useAppCoordinator`'s own local state stayed `useState` on purpose

**`useAppCoordinator.ts` had grown into two different jobs wearing one name: composing ~20 Firestore/auth hooks into one return value consumed by `App.tsx`'s props, and — entirely separately — owning `DataContext`/`UIActionsContext`/`UIFormContext`'s three values via `AppProviders.tsx`.** The user asked to fold the coordination logic into a single state store, expecting both jobs to move. Only the second one actually needed to: the 20-hook composition has exactly one reader (`App.tsx`, once, in the same render) and was never the thing causing re-renders — the 3-context split, consumed by `ExpenseSection.tsx`/`TravelerSection.tsx`/`ChartsSection.tsx`, was. Scoped explicitly to that boundary before writing any code, confirmed by two direct questions rather than assumed: **Zustand** as the library (over a hand-rolled `useSyncExternalStore`, for its built-in selector-based subscriptions), and the migration limited to `useAppCoordinator` + the three contexts — every one of the 20 individual Firestore/auth hooks (`useExpenses`, `useTravelers`, `useTripConfig`, etc.) stayed untouched, still called exactly as before.

**`src/store/tripStore.ts` is a verbatim port of the three context types into one object with three top-level keys** (`data`/`actions`/`form`, matching `DataContextType`/`UIActionsContextType`/`UIFormContextType` field-for-field) — one store, not three, because Zustand's per-selector subscription already isolates sibling keys without needing separate store instances. The volatility rule that justified the original split carries over unchanged: **place a field by how often it changes, not by what it relates to** — see guideline 16 in `CONTRIBUTING.md`.

**The store is a mirror of hook-owned React state, never a second source of truth.** `src/store/TripStoreProvider.tsx` (renamed from, and API-compatible in props with, the deleted `AppProviders.tsx`) writes into the store via three separate `useLayoutEffect`s — one per key — each gated by the same dependency array the old `useMemo`s used. `useLayoutEffect`, not a `setState` call during render: writing to an external store mid-render makes the render impure (exactly what React 18 Strict Mode exists to catch), and it still runs before paint, so there is no visible flicker. `TripStoreProvider` itself never reads from the store — it is a pure writer; data flows one direction only, Firestore/Auth → the owning hook's own `useState` → `useAppCoordinator`'s return value → props → the store → selector hooks in the three leaf components.

**A new store instance is created per `<TripStoreProvider>` mount (`createStore` + `useRef` + React Context), deliberately not a bare module-level Zustand singleton**, even though "replace the contexts with direct Zustand selectors" reads most literally as one global store. `src/stories/decorators.tsx`'s `Providers` wrapper is mounted more than once on the same page by design — a Storybook docs page renders several stories of `TravelerCard` side by side, each with different `data` overrides (confirmed live: the "شبكة البطاقات" story shows four cards with four different balances simultaneously). A singleton would make every simultaneously-mounted instance overwrite the same global object; whichever story's decorator ran `setState` last would win for all of them. `createStore`+Context is the pattern Zustand's own multi-instance/SSR guidance recommends for exactly this case, and it buys a second thing for free: `App.test.tsx`'s 17+ `render(<App />)` calls each get a fresh store with no manual reset needed between tests, the same way the 20 hooks' own `useState` already resets on every fresh mount.

**`useAppCoordinator`'s own local state (`isSyncing`, `syncError`, `showTripPicker`, `toast`) deliberately stayed `useState`, not moved into the store.** It has exactly one reader and one writer — `App.tsx`, through the same function — so there was no re-render problem to fix, and migrating it would only have added a `Dispatch<SetStateAction<T>>`-shaped adapter to satisfy `useExpenses.ts`/`useTravelers.ts`'s existing setter type, for a slice nothing else ever subscribes to. Confirmed directly rather than defaulted into: moving code that fixes nothing is exactly what `CONTRIBUTING.md`'s "no premature abstraction" framing warns against.

**Render isolation was proven, not assumed, at three levels.** `src/store/tripStore.test.ts` unit-tests the store factory alone — updating one key leaves the other two keys' object identity untouched. `src/store/TripStoreProvider.test.tsx` mounts real `memo()`-wrapped probe components (mirroring `ExpenseListItem`/`TravelerCard`, which are themselves `memo()`-wrapped — a bare, unmemoized probe re-renders on every parent re-render regardless of the store, which isn't the thing being tested) and counts renders directly: a `form`-only prop change leaves a `data`-subscribed probe's render count untouched, and vice versa. Both were live-verified afterward too — the dev server boots to `AuthGate` with no console errors, and the Storybook multi-card story above shows the per-mount-store decision actually holding in the one scenario a singleton would have broken.

### 🆕 Sentry added for error tracking — unified across client and functions, measured against the same bar as the QR code dependency

**This project already has a stated test for accepting a new third-party dependency, not a new one invented for this entry:** the QR-code decision above asks whether a dependency buys real verification that's expensive to hand-roll, not whether it's popular or convenient. Source-map symbolication (mapping a minified stack frame back to a real function/line), breadcrumb capture across async boundaries (fetch/XHR/console interleaved with user actions before a crash), and error deduplication/grouping (fingerprinting near-identical stack traces across thousands of events) are all things a hand-rolled `console.error`-to-a-webhook approach cannot reasonably reproduce with confidence. That's the bar Sentry is measured against here.

**Cloud Functions already send every `console.error` to Google Cloud Error Reporting automatically, for free, with zero code — this did not change.** Adding Sentry on top was a deliberate choice for *one dashboard* covering both client and server errors, not a claim that GCP's free tier was broken or insufficient. `functions/index.js`'s `withSentry(fnName, handler)` wraps all 8 exported functions (7 `onCall` + `advanceTripLifecycle`'s `onSchedule`) at the export boundary — it still logs `console.error(\`[${fnName}]\`, err)` exactly as before (so Cloud Error Reporting keeps working unchanged), then additionally calls `Sentry.captureException` and `Sentry.flush(2000)` before rethrowing. The internal best-effort `catch` blocks scattered through the file (e.g. `[recordMembership] تعذّر تسجيل...`) were deliberately left alone — those are failures the code already decided shouldn't fail the whole request, and Cloud Logging still captures them regardless of Sentry. Wiring every internal catch into Sentry too would have been scope creep against a 1350-line file for a first integration pass.

**`@sentry/google-cloud-serverless`, not `@sentry/node` directly** — it's built on `@sentry/node` but adds GCP-specific defaults, most importantly correct `flush()`/timeout handling for a runtime that can freeze the process immediately after a handler returns (a buffered, unflushed Sentry event is silently lost otherwise). Its convenience wrappers (`wrapHttpFunction` etc.) don't fit here: `onCall` handlers receive a `CallableRequest`, and `onSchedule` receives a `ScheduledEvent` — neither matches the raw `(req, res)`/`CloudEvent` signatures those wrappers expect. `withSentry` is a small hand-written wrapper instead, which is also why `defineSecret('SENTRY_DSN')` (the first use of Cloud Functions v2 secrets in this file) has to be declared in each function's own `secrets: [...]` option — v2 doesn't make a secret available to an instance unless that instance explicitly asked for it.

**Both client and server default to fully off, unlike every other required env var in this codebase.** `src/firebase.ts` throws at startup if a Firebase var is missing, by design (see *Environment Variables* above) — a missing Sentry DSN does the opposite: `initSentry()`/`initSentryOnce()` both check for an empty DSN and return immediately, no throw, no broken app. Error tracking is monitoring, not a load-bearing dependency for the app to function; treating a missing DSN as fatal would have inverted that.

**PII scrubbing is a pure function, tested, and shared in spirit (not in code) between client and server.** This is a financial app: a traveler's full IBAN and beneficiary name (`BankDetails`), real emails and display names, and free-text expense descriptions all flow through the app, and Sentry's defaults (breadcrumbs from fetch/XHR, `Sentry.setUser()`, request capture) could plausibly leak any of them. `sendDefaultPii: false` handles most of it at the SDK level; `src/utils/errorScrubbing.ts` (client, tested in `errorScrubbing.test.ts` per the "pure logic in `utils/`" guideline) and `functions/errorScrubbing.js` (server, CommonJS duplicate — same reasoning as `isValidNameKeyJs`/`deriveShortNameJs` being duplicated rather than shared across the ESM/TS-vs-CommonJS boundary) are a second, explicit layer: a field-name blacklist (`iban`, `bankDetails`, `email`, `description`, `name`, etc.) recursively redacted from `event.extra` and breadcrumb data, plus `event.user`/`event.request` dropped outright. The two files must be kept in sync by hand if the sensitive-field list changes — there's no shared module between the two runtimes to enforce it automatically.

**No performance monitoring, no session replay.** `tracesSampleRate: 0` on both sides — the request was error tracking specifically, not Sentry's full product surface, and turning on tracing/replay later is a separate, explicit decision with its own quota and PII implications, not something to default into silently.

**`functions/.secret.local` is committed, not gitignored, despite the blanket `*.local` rule in `.gitignore`** — this was found empirically, not assumed, by actually running `test:e2e` after wiring `secrets: [SENTRY_DSN]` into all 8 functions and watching it produce real, intermittent test failures (guideline 18 again: a suite that reports failures is worth reading, not retrying blindly). Every function declaring a secret makes the Functions emulator try to fetch its value from real Google Cloud Secret Manager on each cold start — against `demo-travelapp-e2e`, a fake project id with no such secret, it always fails with a 403 after several seconds of retries. That's real, unavoidable network latency injected into every e2e run, and it was large enough to make timing-sensitive UI assertions miss their window unpredictably — three separate full-suite runs each failed a *different* single test, while every failing test passed cleanly in isolation, which is the signature of latency-induced flakiness, not a functional break. `firebase-tools` has a documented escape hatch for exactly this: a local `.secret.local` file read *before* any network call is attempted, keyed by the same filter the emulator uses to skip Secret Manager entirely (`secretEnvs[s.key]` must be truthy — an **empty** value still triggers the network fetch, so the file holds a deliberately invalid non-empty placeholder, `SENTRY_DSN=disabled-for-local-emulator`, confirmed directly to make `Sentry.init` warn-and-no-op rather than throw). Excepted from `*.local` the same way `.env.example` is excepted from `.env.*`, immediately above it in `.gitignore`. Without this file tracked, CI's `test:e2e` job would carry the same latency and the same flakiness on every run, not just locally.

### 🆕 ExpensesPanel's "إدارة الرحلة/الرحلات" button removed — AccountMenu extended to organizers instead of trusting the premise that it already covered them

**A cleanup request came in asking to delete the trip-management button inside the trip screen as a "duplicate" of AccountMenu's header entry point.** Checking before acting (not after) turned up that the two were not actually duplicates for every role: `AccountMenu.tsx` showed a trip-management item only when `isAdmin` — for everyone else it showed "تسجيل الدخول كمسؤول" (sign in as a separate admin account), never a path into `TripAdminView`. The `ExpensesPanel` button, gated on `isAdmin || isOrganizer`, was the *only* way a non-admin trip organizer (the Phase 3 role — see the entries above on `isOrganizer`/`organizerUid`) could reach trip management at all. Deleting it as literally requested would have silently locked every organizer out of managing their own trip, and broken `e2e/organizer-role.spec.ts`, which asserts and exercises exactly that access path.

**The fix extends `AccountMenu` to a third branch instead of picking one of the two existing entry points as the survivor.** `isAdmin` still shows "لوحة الإدارة"; a new `isAdmin === false && isOrganizer === true` branch shows "إدارة الرحلة" (both call the same `onOpenAdminPanel`, i.e. `modals.openTripAdmin` — there was never a second dispatcher, only a second UI trigger); everyone else still gets "تسجيل الدخول كمسؤول". `ExpensesPanel.tsx` loses the button, its `isOrganizer`/`onOpenTripAdmin` props, and the now-unused `Settings` icon import entirely — it goes back to being props it actually reads.

**Every e2e spec that reached trip management through the old `ExpensesPanel` button had to change, not just `organizer-role.spec.ts`.** `delete-empty-trip.spec.ts` and `delete-old-archived-trip.spec.ts` both had a local `openTripDetailAsAdmin` helper clicking the ExpensesPanel button directly (regex-matched against both "إدارة الرحلة" and "إدارة الرحلات" labels); `self-serve-trip-creation.spec.ts` asserted the organizer-facing button was visible immediately after self-serve trip creation. All four now call `openAccountMenu` (the existing helper in `e2e/utils/flows.ts`, already used by `openTripAsAdmin`) and target the `menuitem` role instead of `button`. `App.test.tsx`'s two admin-visibility assertions moved the same way — checking `screen.getByText('إدارة الرحلات')` directly is no longer meaningful once that text only exists inside a closed-by-default dropdown; both tests now open the menu (`fireEvent.click` on the "حسابي" toggle) before asserting what's inside it, the same "assert inside the open state, not just its absence when collapsed" fix `organizer-role.spec.ts`'s own negative-case assertion needed.

### 🆕 Mobile-first pass, four steps, each verified before the next: input bar safe-area, AccountMenu profile card, page-wide safe-area, floating list cards

**Each step below was implemented, then proven with the full `lint`/`typecheck`/`test`/`test:e2e`/`build` sweep, before moving to the next** — not a single "redesign the UI" commit. That discipline caught a real intermittent-test-flake false alarm (see the trip-lifecycle/Sentry entries above for the same pattern recurring) and meant each step's blast radius was independently provable.

**Step 1 — `SmartInputBar.tsx`'s bottom offset changed from `bottom-4` to `bottom-[max(1rem,env(safe-area-inset-bottom))]`.** Identical on every device today (`env()` resolves to `0`, `max(1rem, 0)` = `1rem` = the old value byte-for-byte) — the change only does something once `viewport-fit=cover` exists (see Step 3). Also added `haptic.success()` on a successful quick-add — it previously fired only on validation/write errors, never confirming success.

**Step 2 — `AccountMenu.tsx`'s standalone "بروفايلي" item is gone; the name/email card itself is now that button**, matching how native iOS/Android settings screens make the account header row the entry point rather than duplicating it as a separate list item below. Added `ChevronLeft` (already used in `TripPicker.tsx` for the identical "this row opens something" affordance, correctly pre-mirrored for RTL — no new icon needed). The button carries a fixed `aria-label="بروفايلي"` specifically so its accessible name doesn't depend on the displayed user's name/email, which is why the existing `e2e/self-serve-trip-creation.spec.ts` assertion (`getByRole('menuitem', { name: 'بروفايلي' })`) needed zero changes despite the DOM structure changing underneath it.

**Step 3 — `viewport-fit=cover` added to `index.html`'s viewport meta, and `Header.tsx`'s `<header>` gained `pt-[env(safe-area-inset-top)]`.** These two had to land together: `viewport-fit=cover` is what makes `env(safe-area-inset-*)` resolve to anything nonzero on iOS at all (without it, every safe-area env var is always `0`, silently — a page can ship "safe area aware" CSS that does nothing), but flipping it on also lets page content extend under the notch/status bar *everywhere*, not just where you intended. The padding goes on the outer `<header>` element itself, not the inner flex row that already had `py-2`/`py-3` — this way the teal background stretches up to visually cover the notch/status-bar area (the native-app look being asked for), while the actual logo/stats/AccountMenu row stays positioned below it, unobscured. This was flagged as a deliberate deferral in the Step 1 response and only implemented once explicitly requested — see that step's own note about why `viewport-fit=cover` is a page-wide decision, not a `SmartInputBar`-local one.

**Step 4 — traveler and expense cards stopped being a divided list and became individually floating cards.** `TravelerCard`/`TravelerCardSkeleton` dropped their default `border border-slate-100`, relying on `shadow-sm` alone to read as "elevated" against the page's `bg-slate-50` — except the `isMine` card, which **keeps** its `border-2 border-teal-300`: that border is a deliberate semantic highlight ("this is your card"), not a list-separator, and removing it would have deleted real information, not just decoration. `ExpenseListItem`/`ExpenseListItemSkeleton` went from `border-b border-slate-100 last:border-0` rows inside one shared `bg-white rounded-2xl` container to each being its own `rounded-2xl shadow-sm mb-3` card; `ExpensesPanel.tsx` no longer wraps the list in a card container at all (that container is what was producing "a card inside a card" once each row became a card itself) — matching how `EmptyState` already renders bare, uncontained, directly in `TravelersPanel.tsx` with no card wrapper of its own.

⚠️ **The swipe-to-delete/edit gesture on `ExpenseListItem` needed `overflow-hidden` preserved through this change, for a different reason than before.** It used to clip a continuous list row's shared corners; now it clips the colored delete/edit reveal panels to the *individual card's* `rounded-2xl` shape as it's swiped — removing it would have let those panels' square corners poke out past the card's rounded ones mid-swipe. Confirmed directly, not assumed: `e2e/soft-delete-trash.spec.ts` (which exercises this exact interaction) and every spec using the `div.group`-based card locators (`critical-flow.spec.ts`, `balances-math.spec.ts`, `e2e/utils/flows.ts`'s `expenseCard` helper) all still pass — the `group` class those locators depend on was deliberately preserved on both `TravelerCard` and `ExpenseListItem`'s outer elements through this restyle.

### 🆕 `ExpenseForm` moved from an inline page section to the shared `Modal` bottom sheet — the only form in the app that wasn't already one

**Reported by the user as "the expense form opens off-screen after scrolling down, with blank gaps appearing"** — from `SmartInputBar`'s "إضافة تفاصيل" (expand) button specifically, but the same underlying trigger (`expense.openExpenseForm`) is also used by `ExpensesPanel`'s empty-state "سجّل أول مصروف" button and by editing an existing expense, so all three shared the bug. Root cause, found by tracing the render tree rather than patching the reported symptom: `<ExpenseForm />` was rendered directly inside a `<section>` in `App.tsx`'s normal page flow — the *only* form/dialog in the codebase that wasn't already going through the shared `Modal` component (`DepositModal`, `TrashBinModal`, `UserProfileModal`, `AdminSignInModal`, `DepositHistoryModal`, `ConfirmModal` all already wrap in `<Modal>`). Toggling `isExpenseFormOpen` just swapped that section's content between `null` and the full form, wherever that section happened to sit relative to however far down the page the user had scrolled — with no relationship between the two.

**The literal fix initially requested — `scrollIntoView` plus a Tailwind `transition-all` on the section — was considered and rejected as incomplete, not just inelegant.** A CSS `transition` only animates continuous property changes on an already-mounted element; it does not animate an element appearing from a React `null`-to-content mount, which is exactly what was happening here. This codebase already uses `framer-motion`/`AnimatePresence` everywhere else for that exact reason (see the `AccountMenu`/Bottom Sheet entries above) — bolting a CSS transition onto this one form would not have produced the "smooth expansion" being asked for, and `scrollIntoView` alone would have patched only the `SmartInputBar` call site while leaving the identical bug live on the empty-state button.

**The actual fix: `ExpenseForm` now returns `<Modal onClose={cancelExpenseForm} label={...} maxWidth="max-w-md">...</Modal>` instead of a plain `<div>`.** Being `position: fixed`, `Modal` is unaffected by scroll position or its own position in the DOM — no `scrollIntoView` call is needed at all. `App.tsx`'s wrapping `<section className="bg-white rounded-2xl shadow-sm border ...">` was removed entirely (it also happened to leave a visible empty bordered/shadowed sliver in the layout whenever the form was closed, since `trip.canAddExpenses` alone still rendered the now-content-less section) and replaced with `<AnimatePresence>{expense.isAddingExpense && <ExpenseForm />}</AnimatePresence>` at the call site — matching `ModalManager.tsx`'s existing pattern exactly. This mattered specifically because `ExpenseForm` does its own internal `if (!isExpenseFormOpen) return null` (required by its Rules-of-Hooks ordering comment, left untouched), and `AnimatePresence` only detects a child's removal — and therefore only plays the exit animation — when the conditional sits at the JSX call site AnimatePresence directly wraps, not inside a child component's own internal early return.

**A process mistake, not a code mistake, on the first delivery attempt: the fix was implemented, verified (lint/typecheck/test/e2e/build all green), and reported as done — but never committed.** It sat as an uncommitted local change on an unrelated already-merged branch (`polish/soft-balance-indicators`, PR #49), so it never reached anywhere the user could actually test it. When they reported the bug as still present, that report was correct — nothing had shipped. Caught by checking `git status`/`git log` directly rather than re-deriving or second-guessing the fix itself, per guideline 18 applied to the meta-question "is the code I'm confident about actually where the user can see it," not just "does the code work."

**Verified live against the real emulator, not just asserted from reading the diff — `e2e/expense-form-scroll-visibility.spec.ts` seeds 25 expenses so the page genuinely exceeds a 375×812 mobile viewport, scrolls to the bottom, opens the form from `SmartInputBar`, and asserts the amount field's `getBoundingClientRect()` actually falls within `[0, window.innerHeight]`** — a `toBeVisible()` check alone would not have caught the original bug, since Playwright's visibility check does not require an element to be within the current scroll position, only that it isn't `display:none`/zero-sized/etc.

### 🆕 `Modal` is portaled to `document.body` — the entry above shipped a real device bug the automated test happened not to catch, and fixing it properly surfaced two more

**Reported by the user with a real iPhone screenshot, after the entry above had already merged: opening the expense form still showed only the dimmed backdrop, with no visible panel anywhere.** The `expense-form-scroll-visibility.spec.ts` scenario that verified the previous fix scrolled all the way to the bottom before opening the form — which, by coincidence, placed the (still mispositioned) panel inside the viewport anyway, so the test passed for the wrong reason. A second scenario was added that opens the form at the *top* of the page instead, which cannot accidentally mask this class of bug, and it reproduced the failure immediately in Chromium too — this was never actually a device-specific quirk, just untested at the one scroll position that happened to hide it.

**Root cause: `PullToRefresh.tsx` wraps `<main>` (and therefore every modal rendered inside it) in a `<div>` that carried `transform: translateY(0px)` at rest, unconditionally, for the rubber-band pull gesture.** Per the CSS spec, *any* element whose computed `transform` is not `none` — even a translation of zero pixels with no visible effect — establishes a new containing block for `position: fixed` descendants. `Modal`'s backdrop is `fixed inset-0`, and it now had one of these descendants for the first time (every other modal already existed before `PullToRefresh` wrapped `<main>`, or happened not to be triggered from a scrolled state during testing). Its position was therefore computed relative to `PullToRefresh`'s wrapper box — which, because the expense list beneath it uses `react-virtuoso`'s `useWindowScroll` and spans the page's entire scrollable height — could be many times taller than the viewport, so the modal rendered far below the visible screen while its backdrop, sized to the same tall box, still covered what the user could actually see.

**Three CSS-only attempts to fix `PullToRefresh.tsx` directly were tried and each rejected, in order:**

1. `transform: contentOffset ? \`translateY(${contentOffset}px)\` : undefined` at rest — but `transition: 'transform 0.25s ease'` was still declared unconditionally alongside it, and a `transition-property` targeting `transform` establishes the same containing block regardless of whether the transform's *value* ever actually changes. The bug persisted.
2. Removing the entire inline `style` object at true rest (tracked via an `isSettled` flag, cleared on touch-start and restored ~300ms after touch-end to outlast the 250ms return animation) — this genuinely left zero relevant CSS declared at rest, yet the expense list still failed to render any items on short pages (see below). Abandoned for introducing a regression without even confirming it fixed the original bug.
3. The standalone CSS `translate` property instead of `transform: translateY()` — in practice this *also* establishes a containing block for `position: fixed` descendants (the modern CSS Transforms spec extended the containing-block rule to `translate`/`rotate`/`scale`, not just `transform`), so it did not fix the original bug either.

**The actual fix: `Modal` renders through `createPortal(..., document.body)` instead of in place, and `PullToRefresh.tsx` is untouched.** A portaled node is not a descendant of *any* ancestor's CSS for containing-block purposes, regardless of what `PullToRefresh` — or anything else, now or added later — does with `transform`. This is the standard fix for this exact bug class (every other modal library does the same), and it means nobody has to remember "no ancestor of `<main>` may ever use `transform`" as an unenforced, undocumented rule.

**Portaling exposed a second, unrelated bug: `react-virtuoso`'s `useWindowScroll` can measure the wrong (often zero) window viewport on its first mount, if that mount follows a sequence of layout-affecting events — self-serve trip creation, opening and closing the admin panel, then opening the expense modal, in that order.** Confirmed *not* a containing-block issue by inspecting the live DOM: the scroller's entire ancestor chain up to `<html>` was `position: static`/`relative` throughout, and `offsetParent` resolved normally at every level — this is `useDialogA11y.ts`'s own documented finding (`offsetParent` returns `null` for `position: fixed` elements) ruled out directly, not assumed. `ExpensesPanel.tsx` now holds a `virtuosoRef` and calls `virtuosoRef.current.scrollTo({ top: window.scrollY })` inside `requestAnimationFrame`, in a `useEffect` keyed on both "is the list currently showing data" and `filteredExpenses.length` — the second dependency matters because an already-mounted list (e.g. a soft-deleted expense restored via undo) needs the same nudge without Virtuoso ever unmounting.

**Portaling exposed a third, unrelated bug, caught only by the existing `e2e/soft-delete-trash.spec.ts`: `Modal`'s backdrop and `Toast.tsx` both used the identical `z-[9999]`.** With equal `z-index`, stacking is resolved by DOM order — and a portaled `Modal` node is now appended at the very end of `document.body`, after `Toast`'s node, which stays wherever it naturally sits in the React tree. During the ~300ms `Modal` spends animating out after "نعم، احذف" (confirm delete), its now-later-in-DOM-order `fixed inset-0` backdrop visually and click-wise covered the `Toast` underneath — silently swallowing the click on "تراجع" (undo) before `handleRestoreExpense`'s Firestore write could ever fire, even with Playwright's `force: true` (which skips *Playwright's* actionability checks, not the browser's actual hit-testing at that screen coordinate). Confirmed by testing each of the three fixes above in isolation via `git stash`, not by reasoning about it — this one only reproduced with the portal change present, and only in this specific delete-then-undo sequence. Fixed by bumping `Toast.tsx` to `z-[10000]`, strictly above any `Modal`, so a toast's feedback (and its one-shot undo action) can never be covered by a modal that is merely in the process of leaving.

**The pattern worth keeping: a fix that is CSS-only and touches the element everyone already suspects (`PullToRefresh.tsx`) is not automatically safer than one that restructures where a component renders.** Three attempts at the former each traded the original bug for a new one, or failed to fix it at all; the one attempt at the latter fixed the original bug outright and needed two small, independently-verifiable follow-up fixes elsewhere — both caught by tests that already existed or were added specifically because the first fix's own test had been shown to pass for the wrong reason.

</div>
