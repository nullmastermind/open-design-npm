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
- Known pre-existing failures on `main` (not caused by this fork's edits,
  verified identical pre/post via a 2026-08-13 baseline comparison):
  Windows-native environmental artifacts dominate — CRLF line endings vs
  literal CSS assertions (`tests/styles/*`), `#!/usr/bin/env node` shim
  spawns without Windows extensions (daemon `run-atomic-ownership`,
  `stale-message-snapshot-preserves-daemon-events`, and POSIX-socket
  daemon tests), plus `tests/state/config.test.ts`'s syncConfigToDaemon
  ratchet test conflicting with this fork's `onboardingCompleted: true`
  default. As of the 2026-08-13 sync, `EntryShell.amr-workspace-race` is
  GREEN (its upstream gate-assertion tests were deleted), and the DeepSeek
  campaign / `SettingsDialog.execution` suites pass on this machine.
  `pnpm guard` still errors on files absent in this fork
  (`.github/workflows/ci.yml`, `apps/telemetry-worker/package.json`).

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

### 2026-08-13 — add `sync-upstream` skill (safe upstream sync)

- `.claude/skills/sync-upstream/SKILL.md` — manual upstream sync/merge
  workflow that respects local code + FORK.md: no `-X ours` (it silently
  corrupts deletion regions), FORK.md-first conflict resolution (upstream
  version as base, fork behavior re-applied against current symbol names),
  parse gate + web typecheck + focused onboarding tests before any push,
  FORK.md change-log entry, and user approval before landing on main.
  The automated `.github/workflows/sync-fork.yml` still uses `-X ours`; the
  skill is the safe manual path until that workflow is reworked.

### 2026-08-13 — upstream sync `044324b9a..a1d279649` (24 commits, first safe-manual merge)

First sync through the `sync-upstream` skill (no `-X ours`). Merged
`upstream/main` into `sync/upstream-2026-08-13`, resolved 7 conflicted files,
re-verified every FORK.md product decision against the merged tree, and
repaired two auto-merge defects before landing.

- **Modify/delete conflicts** — fork's deletion wins:
  `.github/workflows/release-prerelease.yml` and `visual-baseline.yml`
  `git rm`'d; `.github/workflows/` again contains only `publish-npm.yml` +
  `sync-fork.yml`.
- **Content conflicts** — all 17 blocks were upstream-only re-additions of
  sign-in / gate machinery the fork removed (HEAD side empty in every block),
  so each resolved to the fork side:
  - `apps/web/src/App.tsx` — dropped the re-added `amrLoggedIn` /
    `amrSessionState` / `amrAccountPlan` EntryView props.
  - `apps/web/src/components/EntryView.tsx` — dropped the same prop
    declaration / destructure / forwarding (3 blocks).
  - `apps/web/src/components/EntryShell.tsx` — dropped 8 blocks:
    CloudSignInTip + entry-rail-account-state imports, vela-login /
    amrLoginPolling imports, the AMR prop declaration + destructure, the
    rail-account-footer / re-gate effect block, `footerNotice`,
    `amrSignedIn`, and the full `handleCloudSignIn` /
    `handleAmrSignInToContinue` / `handleCancelAmrLogin` /
    `pollAmrLoginCompletion` machinery. Two upstream auto-merged references
    to those deleted symbols were repaired against fork names:
    `handlePluginLoopSubmit`'s `amrAuthRequired` re-gate block removed, and
    the rail's `context={railWorkspaceContext}` restored to
    `context={workspaceContext}`.
  - `apps/web/src/components/SettingsDialog.tsx` — dropped the sign-in
    callout JSX (with its `AmrLoginPill`), `amrRevealPendingCancelAction`,
    the coachmark JSX, and the AMR-authorize `AmrLoginPill` JSX (4 blocks).
  - `apps/web/tests/components/EntryShell.onboarding.test.tsx` — kept the
    fork's chooser-first signed-out test.
- **Auto-merge defects repaired on the sync branch:**
  - `EntryShell.amr-workspace-race.test.tsx` (+158 lines auto-merged) had
    two new upstream tests asserting the sign-in gate behavior the fork
    removed ("returns a definitively expired Cloud session to the existing
    sign-in gate", "returns a submit-time auth rejection to sign-in…") plus
    a third gate-flavored test. After first dropping the now-invalid
    `amrLoggedIn` / `amrSessionState` props from their renders (same pattern
    as the 2026-08-13 entry), all three gate-assertion tests were deleted;
    the fork's workspace-B recheck test stays and passes.
- **FORK.md decisions re-verified in the merged tree:**
  `shouldRouteToFirstRunOnboarding` returns `false`;
  `resetExecutionConfigAfterSignOut` keeps `onboardingCompleted: true` with
  no forced `mode: 'daemon'`; onboarding starts at the model-source chooser
  (`useState(1)`); the chooser is Local/BYOK only, default Local
  (`modelSource: 'local' | 'byok'`). Intentionally-kept surfaces intact:
  `AmrLoginPill`/`AmrBalanceDialog` in ChatPane, `entry-rail-account-state.ts`,
  `amrLoginPolling.ts` (imported by App/SettingsDialog), the
  `settings.onboardingCloud*` / `onboardingAmr*` / `onboardingRecommended`
  i18n keys.
- **New upstream surfaces taken as-is** (not gates; flagging per the
  safe-manual rule): `fix(amr): recover expired cloud sessions` —
  App.tsx's global vela poller now auto-recovers expired AMR sessions and
  SettingsDialog's AMR card renders the sign-in pill (both optional
  cloud-auth helper surfaces the fork keeps); the App-level
  `cloudIdentityRejected` re-auth effect that navigates to onboarding when
  an explicitly-selected AMR cloud identity rejects (no longer reachable
  through the chooser since the Hosted option was removed).
- **Gates:** parse gate OK (2993 files); `@open-design/web` typecheck 0
  errors (post-repair); `@open-design/daemon` typecheck 0 errors; focused
  onboarding suites 26/26 green; race suite green post-repair. Full
  `@open-design/web` suite: 6334 passed / 40 failed — a baseline comparison
  run of all 16 failing files against the pre-merge tree shows every failure
  identical except the three gate-assertion tests above (deleted; file now
  green). Daemon suite: full-run comparison skipped; the 7 new upstream test
  files were run directly — 5 pass, 2 fail on Windows-native only
  (`run-atomic-ownership`, `stale-message-snapshot-preserves-daemon-events`:
  they spawn agent CLIs via `#!/usr/bin/env node` shim scripts with no
  extension, which Windows cannot execute; same class as the documented
  POSIX-socket environmental failures, not a merge defect).
- Manifests changed (`apps/daemon`, `tools/pack` packages + lockfile) →
  `pnpm install` run; `npm-package/` untouched.
