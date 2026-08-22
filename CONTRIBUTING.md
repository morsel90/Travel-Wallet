# إرشادات المساهمة — Travel Wallet

<div dir="rtl" style="text-align: right">

قواعد يجب اتباعها عند تعديل الكود. للسياق العام راجع [CLAUDE.md](CLAUDE.md)؛ لأسباب هذه القواعد راجع [docs/DECISIONS.md](docs/DECISIONS.md).

---

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
14. **Secrets stay server-side** — 🆕 `tripInvites/{token}` is `read, write: if false` and must remain so (there is no `tripSecrets` anymore — PIN access was removed entirely, see `docs/DECISIONS.md`). Anything a client must never read or forge belongs in `functions/index.js` or an Admin SDK script, never in the client.
15. **CI pipeline** — all PRs must pass: lint → typecheck → test → rules → e2e → build. ESLint bans `any` (`no-explicit-any`) and empty `catch {}` blocks (`no-empty`), which are easy to introduce accidentally. 🆕 You no longer need to remember to run anything: `.githooks/pre-push` runs lint/typecheck/test before every push. **Do not reach for `--no-verify` as a habit** — the one commit that skipped this discipline (`c51e9f8`) left `main` red for two days. 🆕 And it no longer helps: a ruleset on `main` refuses direct pushes outright, so **all work goes through a PR**. This guideline finally describes what actually happens. See *The push gate* under *Testing*.

    🆕 **`npm run lint` runs with `--max-warnings=0`** (2026-08-15). Before this, ESLint's own exit code only reflects *errors* — a rule at `warn` severity (`react-refresh/only-export-components`, anything from `plugin:storybook/recommended`) could accumulate silently forever: not in the terminal you'd notice, not in `.githooks/pre-push`, not in CI's `lint` job. The repo had zero warnings when this was added, so nothing changed today — the fix is preventive, closing the exact gap a Final Release Audit flagged (H4) before anything used it. No other file needed changing: both the hook and CI already call `npm run lint`, so the flag closes both at once.
16. 🆕 **Store fields go where their volatility says**, not where their topic says — see `src/store/tripStore.ts`. A changing value placed in the `actions` slice reintroduces the per-keystroke re-render with no visible symptom.
17. 🆕 **Never gate a screen on a condition that excludes the person who uses it.** The "my trips" picker originally required `needsTripPin && !isAdmin`, which hid it from every member of the default trip *and* from admins entirely — i.e. from everyone who would ever open it. Ask "who does this condition exclude?" before shipping visibility logic.
18. 🆕 **Verify the negative case for anything that reports success/failure.** The emulator wrapper (`scripts/run-with-emulators.mjs`) had three separate bugs — including one where failing tests reported success — and none would have surfaced by only checking that a passing run exits 0.
19. 🆕 **Money never enters the app unvalidated, and never leaves the pure functions non-finite.** Any new numeric input path needs `Number.isFinite` at the boundary; any new calculation must hold the four rules in `utils/calculations.invariants.test.ts`. Add the rule there before the code, and never weaken a rule to make it pass — either the behaviour is wrong, or the rule is worded wrong and needs a comment explaining the correct wording.
20. 🆕 **Keep `App.tsx` to routing and composition.** New hook wiring or derived state goes in `hooks/useAppCoordinator.ts`; new store fields go in `store/tripStore.ts` / `store/TripStoreProvider.tsx` (placed by volatility, per guideline 16); new layout goes in a `*Panel.tsx` component. If `App.tsx` starts growing again, something was put in the wrong place.
21. 🆕 **Before refactoring anything untested, pin it first.** Write the characterization test against the *current* code and prove it green **before** moving a line — see `src/App.test.tsx`. A test written after the move only proves the new code agrees with itself.
22. 🆕 **Scope a bug before explaining it.** For anything failing in production, first establish *where* it fails: another device, another browser, another network. A theory explains one observation; a scope test eliminates whole families of them at once. Skipping this cost two hours and five wrong theories on 2026-08-13 — see *Diagnosing a failing Cloud Function call*.
23. 🆕 **Before debugging production behaviour, confirm the fix is actually deployed** (`git log origin/main..main`). A meaningful amount of time was lost diagnosing a bug that was already fixed locally but never pushed.

</div>
