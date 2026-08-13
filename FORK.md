# Fork-local changes

This repository is a fork of upstream Open Design. It intentionally diverges.
Every fork-local change is recorded in the change log below so upstream syncs
and merges never lose it.

**Rule: any code change in this fork must be appended to the change log below
before the work is considered done.**

When syncing or merging from upstream, treat each entry as a patch that must
survive. If upstream touches the same files, re-apply the fork behavior
described here instead of taking upstream's version verbatim.

## Product decisions (do not revert on sync)

1. **No login gate.** The app is fully public. `shouldRouteToFirstRunOnboarding`
   in `apps/web/src/App.tsx` returns `false`; first-run and reset-onboarding go
   straight to the model-source chooser, never to a sign-in screen.
2. **No "Open Design Hosted" onboarding option.** The chooser offers only
   Local Agent and Bring Your Own Key; the default is Local Agent.
3. **Sign-out does not re-gate onboarding.** `resetExecutionConfigAfterSignOut`
   keeps `onboardingCompleted: true` and does not force `mode: 'daemon'`.

## Intentionally kept (looks removable — do not delete, do not "fix" on sync)

- `AmrLoginPill` in `ChatPane.tsx` / `AmrBalanceDialog.tsx` — optional cloud
  auth helper for the Hosted runtime; separate product decision, not a gate.
- `apps/web/src/components/entry-rail-account-state.ts` — currently unused
  rail helper; kept by explicit decision.
- i18n keys `settings.onboardingCloud*`, `settings.onboardingAmr*`,
  `settings.onboardingRecommended` — required by `apps/web/src/i18n/types.ts`
  in all 19 locales; `onboardingAmrModelSourceLabel` is still used by the AMR
  model picker.
- Known pre-existing failures on `main` (not caused by this fork's edits):
  `EntryShell.amr-workspace-race.test.tsx` (red), DeepSeek campaign /
  `SettingsDialog.execution` / other red suites, and `pnpm guard` errors from
  files absent in this fork (`.github/workflows/ci.yml`,
  `apps/telemetry-worker/package.json`).

## Change log

### 2026-08-11 — `b59063351` feat: make app publicly accessible (baseline)

Upstream-derived baseline for this fork's direction: disabled the sign-in gate
(`shouldRouteToFirstRunOnboarding` → `false`), removed the Settings sign-in
callout and the AMR authorize `AmrLoginPill` from `SettingsDialog.tsx`, gutted
the EntryShell re-gate effect body, trimmed `EntryNavRail`.

### 2026-08-13 — remove the onboarding login screen

Reset onboarding must not show the "Sign in to Open Design" screen; it opens
directly on the model-source chooser.

- `apps/web/src/components/EntryShell.tsx` — deleted onboarding step 0 (the
  cloud sign-in landing) and its machinery: `handleCloudSignIn`,
  `handleAmrSignInToContinue`, `handleCancelAmrLogin`, `pollAmrLoginCompletion`,
  login state (`amrStatus`, `amrLoginPending`, `amrLoginCancelPending`,
  `amrLoginError`, `activationHintClosed`, poll/cancel refs), the mount-time
  vela status fetch, the passive reauth effect, and `continueAfterCloudSignIn`.
  Onboarding now starts at the model-source step (`useState(1)`).
- Removed the `onAmrLoginStatusChange` prop chain
  App → EntryView → EntryShell → OnboardingView (App keeps its own global vela
  poller for the nav rail / Settings).
- Tests: `EntryShell.onboarding.test.tsx` — deleted the login-flow tests,
  adapted the rest to the chooser-first flow;
  `App.onboarding-completion-persistence.test.tsx` — sign-out assertions now
  expect `onboardingCompleted: true` (product decision 3).

### 2026-08-13 — remove the `amrLoggedIn` prop chain and empty re-gate effect

- `apps/web/src/App.tsx`, `EntryView.tsx`, `EntryShell.tsx` — deleted the
  `amrLoggedIn` prop end-to-end and the empty
  `useEffect(..., [amrLoggedIn, view])` left by the baseline commit.
- `tests/components/EntryShell.onboarding.test.tsx` and
  `tests/components/EntryShell.amr-workspace-race.test.tsx` — dropped the
  now-invalid prop from their `EntryShell` renders.

### 2026-08-13 — remove "Open Design Hosted" from the model-source chooser

- `apps/web/src/components/EntryShell.tsx` — deleted the Hosted radio and the
  `amr` branch of `continueWithModelSource`; `modelSource` / `runtime` narrowed
  to `'local' | 'byok'`, default `'local'`; keyboard nav and refs reduced to
  the two remaining sources; `currentRuntimeType` no longer emits `amr_cloud`.
- `apps/web/src/i18n/locales/en.ts` — `settings.onboardingExecutionBody` no
  longer mentions the hosted service.
- Tests: chooser test asserts Hosted is absent; arrow-key test rewritten
  around Local ↔ BYOK; Hosted-completion test deleted.

### 2026-08-13 — add FORK.md change-log discipline

- Created `FORK.md` (this file) recording all fork-local changes above.
- `CLAUDE.md` — references `FORK.md` and the rule that every change must be
  appended to its change log.
