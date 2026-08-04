# Decisions

A record of real decisions made on this project — choices between
options, design directions, fixes for non-obvious problems. Newest
entry on top. See `AGENTS.md` for the format and when to add one.

---

## D-2026-08-04-photo-url-egress-cache

**Status:** Done

**Summary:** Root-caused a Supabase Storage egress cap being exceeded to `parent-dashboard`'s 45s
auto-refresh regenerating a fresh (uncacheable) signed URL for every unchanged photo on every tick,
forcing full re-downloads instead of reusing the browser's own cache. Added a small client-side cache
(`apps/shared/photo-cache.js`) that reuses the same signed URL per photo id across renders, wired into
`parent-dashboard` and `bedroom-reset`.

**Record:** decisions/2026/D-2026-08-04-photo-url-egress-cache.md

---

## D-2026-08-02-gate-rejection-reason-bug

**Status:** Done

**Summary:** A live speed test surfaced a real bug: rejected photos could show a confusing
  rejection reason that actually *describes a valid room* ("This is an indoor bedroom-type room as
  evidenced by..."). Root cause: `GATE_SCHEMA`'s `reject_reason_if_invalid` was a required, non-nullable
  string, forcing the model to write something even when it believed the photo was a valid room; a
  stricter code-side check (e.g. `confidence != "high"`) could still reject it, surfacing that
  affirmative text as the "reason." `SCORER_SCHEMA`'s analogous `mismatch_reason` already handled this
  correctly (nullable, explicit null-for-valid example) - the gate just never got the same fix. Made
  `reject_reason_if_invalid` nullable, updated the prompt to match, and had `llava_gate()` build the
  reason from whichever specific criterion actually failed. Verified via unit tests reproducing the
  exact real-world case (no live Ollama access from this session).

**Record:** decisions/2026/D-2026-08-02-gate-rejection-reason-bug.md

## D-2026-08-02-poller-speed-improvements

**Status:** Done

**Summary:** Two speed fixes for the photo-scoring pipeline: (1) reference photos are now cached on
  disk in `poller.py` (keyed by stable photo id, not the rotating signed URL) instead of being
  re-downloaded/re-encoded on every scoring job; (2) `family-api`'s upload/delete reference-photo
  actions now flag a target for eager fingerprint regeneration (reusing
  `request_fingerprint_regeneration`'s existing signal), so a fingerprint is usually ready before a
  kid's first submission instead of adding an extra AI call to it. Declined converting tidiness's
  reference-photo comparison to text (unlike the room fingerprint) - tidiness needs the actual visual
  detail to score accurately. Edge function change deployed (v41, verified byte-identical) and
  live-smoke-tested against a disposable test family.

**Record:** decisions/2026/D-2026-08-02-poller-speed-improvements.md

## D-2026-08-02-wire-fingerprint-into-scorer

**Status:** Done, pending live confirmation

**Summary:** `D-2026-07-16-room-fingerprint` originally intended the scorer's room-match step to
  compare against fingerprint text instead of raw reference photos, but that wiring never actually
  landed (per `D-2026-07-17-poller-fingerprint-generation`'s drift) - the scorer kept comparing raw
  photos directly, leaving the original bedding-false-rejection risk live in real scoring. Wired it
  in for real: `llava_score()` now takes the fingerprint text and uses it for room-match, generating
  one lazily on a target's first scored submission if none is cached yet. No edge function change
  needed - `get_pending_photo_scores` already returns `room_fingerprint` per job. Applied directly to
  the user's `poller.py` and delivered back to them; live confirmation pending.

**Record:** decisions/2026/D-2026-08-02-wire-fingerprint-into-scorer.md

## D-2026-08-02-fingerprint-prompt-permanence-tightening

**Status:** Done

**Summary:** The room fingerprint's "structural-only, not bedding/linens" instruction wasn't strict
  enough - generated fingerprints still leaned on the current bed cover instead of truly permanent
  markers (floor, curtains, wall, furniture type). Rewrote the prompt with an explicit include/exclude
  checklist plus a deterministic keyword-filter backstop in `poller.py`, applied directly to the
  user's file after they pasted it into chat, and delivered back to them (see the follow-on
  `D-2026-08-02-wire-fingerprint-into-scorer` for the related scoring-pipeline gap this surfaced).

**Record:** decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md

## D-2026-08-01-day-boundary-timezone-perth

**Status:** Done

**Summary:** Server-side "today" date computation (3 column DEFAULTs plus `todayStr()`) was UTC, and
  the DEFAULTs were even hardcoded to the wrong city (`Australia/Sydney`) for a Perth-based family.
  Fixed all go-forward date logic (column defaults, `todayStr()`, all 4 atomic functions' day-boundary
  check) to use `Australia/Perth`. Same-day follow-up: audited every date column across all 6 real
  families and corrected the only 2 rows actually wrong (a single mis-dated Gallaghers event); every
  streak field was already correct by coincidence, and legitimate parent-entered reading dates were
  left untouched.

**Record:** decisions/2026/D-2026-08-01-day-boundary-timezone-perth.md

## D-2026-07-31-atomic-points-streak-updates

**Status:** Done

**Summary:** Fixed non-atomic read-modify-write races on `kid_streaks`/`family_room_progress`
  (lost point awards, double-awarded once-per-day completion bonus under concurrent requests) with
  four new row-locked Postgres functions, mirroring `grant_spin_credit_atomic`'s existing pattern.

**Record:** decisions/2026/D-2026-07-31-atomic-points-streak-updates.md

## D-2026-07-31-reward-tracker-pin-server-enforcement

**Status:** Done

**Summary:** reward-tracker's PIN-lock UI (delete category, delete spin reason, Reset) was
  client-side only - the edge function now independently re-verifies the PIN/icons proof, and PIN
  protection became a real per-family server setting (was a per-device localStorage toggle the
  server never saw) instead of silently trusting a bare parent token.

**Record:** decisions/2026/D-2026-07-31-reward-tracker-pin-server-enforcement.md

## D-2026-07-31-kid-trade-security-fixes

**Status:** Done

**Summary:** Fixed a `respond_to_trade` double-accept race (duplicated point transfer) by moving
  the atomic status claim before its side effects, and closed a real lockout bypass where changing
  a kid's secret picture silently cleared an active trade-verification lockout.

**Record:** decisions/2026/D-2026-07-31-kid-trade-security-fixes.md

## D-2026-07-30-reading-tracker-goal-start-date-default

**Status:** Done

**Summary:** The reading tracker's Setup "Goal start date" field now defaults to today when a kid has
  none saved, instead of showing blank - a kid could otherwise have a pages-per-night goal saved with
  no start date, silently and permanently hiding the ahead/behind banner.

**Record:** decisions/2026/D-2026-07-30-reading-tracker-goal-start-date-default.md

## D-2026-07-30-spin-tab-ask-kid-on-spin

**Status:** Done

**Summary:** Removed the shared header kid picker from the reward-tracker Spin tab; pressing SPIN
  now opens a "Spin for who?" modal first and sets `selectedKidId` from that choice, instead of
  spinning for whatever kid the header happened to have selected. Quick Tap's header picker is
  unchanged.

**Record:** decisions/2026/D-2026-07-30-spin-tab-ask-kid-on-spin.md

## D-2026-07-30-reading-tracker-fk-cascade-fix

**Status:** Done

**Summary:** `kid_reading_books`/`kid_reading_log`/`kid_reading_holidays`'s `family_id`/`kid_id` foreign
  keys were created without `on delete cascade`, unlike every other family/kid table - fixed to match,
  after it broke deleting a disposable test family during verification.

**Record:** decisions/2026/D-2026-07-30-reading-tracker-fk-cascade-fix.md

## D-2026-07-30-reading-tracker-new-app

**Status:** Done

**Summary:** Built reading tracking as its own new app (`apps/reading-tracker`) rather than folding it
  into `parent-dashboard`, following the existing per-concern-app pattern; new `kid_reading_books`/
  `kid_reading_log` tables plus a per-kid page-based bonus-spin trigger reusing the existing
  `bonus_spins` mechanic.

**Record:** decisions/2026/D-2026-07-30-reading-tracker-new-app.md

## D-2026-07-28-technical-access-not-scope

**Status:** Done

**Summary:** Added a "Technical access ≠ scope" section to AGENTS.md, after direct testing on Home AI
  Server confirmed a session with broad, non-enforced access would cross into a different project's files
  if asked.

**Record:** decisions/2026/D-2026-07-28-technical-access-not-scope.md

## D-2026-07-27-reward-tracker-big-rewards

**Status:** Done

**Summary:** New kid_big_rewards table (pending/spent lifecycle) for ad-hoc, rarer rewards,
  separate from the running Quick Tap tally, surfaced as a new Big tab.

**Record:** decisions/2026/D-2026-07-27-reward-tracker-big-rewards.md

## D-2026-07-26-kid-trade-balance-enforcement

**Status:** Done

**Summary:** Trade-balance checks now run both at propose time (fail fast) and at accept time
  (authoritative re-check, auto-cancels a trade that no longer holds up).

**Record:** decisions/2026/D-2026-07-26-kid-trade-balance-enforcement.md

## D-2026-07-20-pwa-to-capacitor-migration-assessment

**Status:** Open

**Summary:** Chose React+Vite+PWA+Capacitor Android as the migration path off vanilla PWAs,
  staged behind a hello-world Family Link proof-of-concept before porting any real app.

**Record:** decisions/2026/D-2026-07-20-pwa-to-capacitor-migration-assessment.md

## D-2026-07-20-ios-support-sequencing

**Status:** Open

**Summary:** iOS support follows Android fully proven first (via cloud Mac CI), rather than in
  parallel, since iOS needs new toolchain cost/risk and its own unverified Screen Time
  assumption.

**Record:** decisions/2026/D-2026-07-20-ios-support-sequencing.md

## D-2026-07-20-pwa-version-display

**Status:** Done

**Summary:** Apps show their running build version by fetching and regexing CACHE_NAME out of
  their own service-worker.js source, rather than duplicating a version constant.

**Record:** decisions/2026/D-2026-07-20-pwa-version-display.md

## D-2026-07-20-rename-code-commands

**Status:** Done

**Summary:** Renamed the 8 .claude/commands/ files to insert -code- (matching PACT's
  precedent), distinguishing them from a separate lighter -chat- Skill family; historical docs
  keep the old names.

**Record:** decisions/2026/D-2026-07-20-rename-code-commands.md

## D-2026-07-19-bonus-spin-category-flag

**Status:** Done

**Summary:** Added a stable is_bonus_spin flag on reward categories (replacing a fragile
  label-string match) to identify and protect the double-spin mechanic.

**Record:** decisions/2026/D-2026-07-19-bonus-spin-category-flag.md

## D-2026-07-19-spin-credit-code-review-fixes

**Status:** Done

**Summary:** Fixed 10 findings from a multi-angle spin-credit code review, headlined by a race
  condition fixed via row-locked atomic RPCs for grant/consume.

**Record:** decisions/2026/D-2026-07-19-spin-credit-code-review-fixes.md

## D-2026-07-19-spin-credit-system

**Status:** Done

**Summary:** Built a generic, cross-app grant_spin_credit mechanism with per-reason cadence
  limits, additive to the existing free spin button; wired Bedroom Reset's AI auto-approve as
  its first caller.

**Record:** decisions/2026/D-2026-07-19-spin-credit-system.md

## D-2026-07-19-reward-tracker-mobile-header-and-table-redesign

**Status:** Done

**Summary:** Redesigned Reward Tracker's mobile header/table per a UI brief, splitting
  kid-selector scope (Quick Tap/Spin only) from Table view's always-all-kids-as-columns layout.

**Record:** decisions/2026/D-2026-07-19-reward-tracker-mobile-header-and-table-redesign.md

## D-2026-07-19-parent-icon-auth-alternative

**Status:** Done

**Summary:** Added a per-family choice between the PIN and a 3-of-9 shuffled icon-grid as the
  parent auth method, shared across Reward Tracker and Bedroom Reset's Parent Check.

**Record:** decisions/2026/D-2026-07-19-parent-icon-auth-alternative.md

## D-2026-07-19-reward-tracker-spin-weighting

**Status:** Done

**Summary:** Added per-category spin_weight (1-5) sized directly into wheel wedge angles, plus
  synthesized (not file-based) spin sound and an adjustable duration setting.

**Record:** decisions/2026/D-2026-07-19-reward-tracker-spin-weighting.md

## D-2026-07-19-my-rewards-trading

**Status:** Done

**Summary:** Built kid-to-kid reward trading in my-rewards, gated by a kid-chosen shuffled
  picture grid (lockout after 2 wrong picks) rather than a PIN, explicitly not a strong
  security boundary.

**Record:** decisions/2026/D-2026-07-19-my-rewards-trading.md

## D-2026-07-18-reward-tracker-spin-wheel

**Status:** Done

**Summary:** Added a spinning reward wheel; landing on the legacy 'Spin twice' category
  triggers two bonus spins as a wheel mechanic rather than a tallied reward.

**Record:** decisions/2026/D-2026-07-18-reward-tracker-spin-wheel.md

## D-2026-07-18-poller-token-out-of-source

**Status:** Done

**Summary:** Moved poller.py's WORKER_TOKEN out of hardcoded source into an environment
  variable set in crontab, before the script's first push to a GitHub repo.

**Record:** decisions/2026/D-2026-07-18-poller-token-out-of-source.md

## D-2026-07-18-reward-tracker-instant-tap

**Status:** Done

**Summary:** Made Quick Tap balance updates optimistic (update UI on tap, reconcile via
  background loadState) to fix real tap-to-feedback latency, not just remove the PIN/note-modal
  steps.

**Record:** decisions/2026/D-2026-07-18-reward-tracker-instant-tap.md

## D-2026-07-18-reward-tracker-inline-plus-minus

**Status:** Done

**Summary:** Removed the Earn/Spend mode switch entirely in favour of per-row +/- buttons,
  eliminating a chronic wrong-mode mistake.

**Record:** decisions/2026/D-2026-07-18-reward-tracker-inline-plus-minus.md

## D-2026-07-18-reward-tracker-kid-theme-colours

**Status:** Done

**Summary:** Added a stable, parent-overridable theme_color per kid (stored on kids, not
  index-derived) plus an unused-category warning and more compact Quick Tap tiles.

**Record:** decisions/2026/D-2026-07-18-reward-tracker-kid-theme-colours.md

## D-2026-07-18-reward-tracker-custom-reasons

**Status:** Done

**Summary:** Made note-modal preset reasons a family-scoped, parent-editable table
  (family_reward_notes) seeded with the old hardcoded defaults, mirroring the categories
  pattern.

**Record:** decisions/2026/D-2026-07-18-reward-tracker-custom-reasons.md

## D-2026-07-17-poller-fingerprint-generation

**Status:** Done

**Summary:** Added actual fingerprint generation to poller.py (additive, new function + second
  poll) after discovering the deployed worker never implemented the fingerprint concept at all.

**Record:** decisions/2026/D-2026-07-17-poller-fingerprint-generation.md

## D-2026-07-17-my-rewards-kid-app

**Status:** Done

**Summary:** Built a separate, read-only my-rewards PWA (its own installable icon, kid_code
  login) rather than a second login mode bolted onto the parent-only Reward Tracker.

**Record:** decisions/2026/D-2026-07-17-my-rewards-kid-app.md

## D-2026-07-17-fingerprint-regenerate-now

**Status:** Done

**Summary:** Added an explicit parent-triggered 'regenerate now' fingerprint request (polled by
  the worker) instead of only regenerating lazily on the next photo submission.

**Record:** decisions/2026/D-2026-07-17-fingerprint-regenerate-now.md

## D-2026-07-17-agent-workflow-scaffold

**Status:** Done

**Summary:** Ported PACT's 8-command AI agent workflow to this repo, adapted to
  commit-straight-to-main with no branches/worktrees/PRs, since this repo already works that
  way.

**Record:** decisions/2026/D-2026-07-17-agent-workflow-scaffold.md

## D-2026-07-17-reward-tracker-pin-and-insights

**Status:** Done

**Summary:** Added server-side PIN verification, a full-ledger (uncapped) Insights aggregation
  action, Kid View, avatars, and Undo toast; skipped a proposed GitHub-Gist sync as conflicting
  with the RLS security model.

**Record:** decisions/2026/D-2026-07-17-reward-tracker-pin-and-insights.md

## D-2026-07-17-reward-tracker-app

**Status:** Done

**Summary:** Rebuilt a standalone localStorage Reward Tracker into the shared Supabase backend
  as a parent-gated app with an append-only ledger, kept as a separate currency from the
  chore-streak points.

**Record:** decisions/2026/D-2026-07-17-reward-tracker-app.md

## D-2026-07-16-fingerprint-lock-and-parent-visibility

**Status:** Done

**Summary:** Added a room_fingerprint_locked flag so a parent's manual fingerprint correction
  survives later reference-photo changes instead of being silently auto-invalidated.

**Record:** decisions/2026/D-2026-07-16-fingerprint-lock-and-parent-visibility.md

## D-2026-07-16-room-fingerprint

**Status:** Done

**Summary:** Reversed the earlier no-fingerprint call: room identity now matches against a
  cached, structure-only written fingerprint instead of raw reference photos, after bedding
  differences caused false rejections.

**Record:** decisions/2026/D-2026-07-16-room-fingerprint.md

## D-2026-07-16-gate-scorer-split

**Status:** Done

**Summary:** Split the vision-model call into a perception-only gate (reports evidence, never
  self-asserts valid/invalid) plus a separate scorer, after three independent reviews converged
  on 'completion bias' as the root cause.

**Record:** decisions/2026/D-2026-07-16-gate-scorer-split.md

## D-2026-07-16-layered-anti-cheat-checks

**Status:** Open

**Summary:** Added cheap deterministic pre-checks (blank/blur pixel stats, perceptual-hash
  duplicate detection) in front of the vision model, narrowing what the model is actually asked
  to judge.

**Record:** decisions/2026/D-2026-07-16-layered-anti-cheat-checks.md

## D-2026-07-16-ai-anti-cheat-simplification

**Status:** Done

**Summary:** Simplified the AI-scoring build-out: dropped a planned fingerprint store, replaced
  EXIF freshness checks (which client compression strips) with a captured lastModified
  timestamp, used the existing failed status instead of score:0.

**Record:** decisions/2026/D-2026-07-16-ai-anti-cheat-simplification.md

## D-2026-07-16-governance-docs

**Status:** Done

**Summary:** Set up dedicated AGENTS.md/DECISIONS.md/CHANGELOG.md files, trimming the task
  board to open work only, replacing reliance on conversation history for project memory.

**Record:** decisions/2026/D-2026-07-16-governance-docs.md

## D-2026-07-16-task-board-restructure

**Status:** Done

**Summary:** Restructured the flat-prose roadmap into NOW/NEXT/LATER bands with tags, status,
  and a concrete done-when per task, renaming ROADMAP.md to TASK_BOARD.md.

**Record:** decisions/2026/D-2026-07-16-task-board-restructure.md

## D-2026-07-15-worker-token-auth

**Status:** Done

**Summary:** Authenticated the home-network AI-scoring worker via a simple static WORKER_TOKEN
  secret rather than forcing it into the parent/kid session-token model.

**Record:** decisions/2026/D-2026-07-15-worker-token-auth.md

## D-2026-07-15-ai-scoring-configurable-modes

**Status:** Done

**Summary:** Built AI room-scoring with a per-family configurable mode
  (off/informational/nudge/auto_approve) from the start, reusing the existing Parent-Check
  points/streak logic.

**Record:** decisions/2026/D-2026-07-15-ai-scoring-configurable-modes.md

## D-2026-07-15-ai-scoring-pull-architecture

**Status:** Done

**Summary:** The home-network AI worker polls Supabase for pending jobs (pull architecture)
  rather than the cloud calling into the home network, avoiding any inbound exposure.

**Record:** decisions/2026/D-2026-07-15-ai-scoring-pull-architecture.md

## D-2026-07-15-reference-photos-parent-only

**Status:** Done

**Summary:** Reference-photo management restricted to parent sessions only, enforced
  server-side in the edge function (not just hidden in the UI), after kids were removing their
  own photos.

**Record:** decisions/2026/D-2026-07-15-reference-photos-parent-only.md

## D-2026-07-13-photo-delete-dashboard-x

**Status:** Done

**Summary:** Replaced the buggy lightbox-then-confirm-modal photo-delete flow with a direct X
  button on each photo tile, per the user's stated preference, plus a defensive z-index fix.

**Record:** decisions/2026/D-2026-07-13-photo-delete-dashboard-x.md

## D-2026-07-13-android-keyboard-autofocus

**Status:** Done

**Summary:** Removed the programmatic focus() call on the code-entry field, since it silently
  blocked the on-screen keyboard from appearing on Android Chrome.

**Record:** decisions/2026/D-2026-07-13-android-keyboard-autofocus.md

## D-2026-07-13-parent-agnostic-wording

**Status:** Done

**Summary:** Renamed all 'Mum' references (DB columns, action names, UI text) to neutral
  'Parent' throughout the codebase, with a data migration for historical rows.

**Record:** decisions/2026/D-2026-07-13-parent-agnostic-wording.md

## D-2026-07-13-service-role-session-auth

**Status:** Done

**Summary:** Documents this project's founding architecture: RLS-locked tables with zero
  policies, all access routed through one service-role edge function using opaque session
  tokens instead of Supabase Auth.

**Record:** decisions/2026/D-2026-07-13-service-role-session-auth.md
