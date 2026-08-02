# Changelog

The permanent record of what's shipped, newest date on top. See
`AGENTS.md` for when to add an entry — finished work lives here, not
on `TASK_BOARD.md`.

---

## 2026-08-02

- Fixed the room fingerprint prompt leaning on changeable details (bed cover) instead of permanent
  identity markers (floor, curtains, furniture type): rewrote `FINGERPRINT_PROMPT` with an explicit
  include/exclude checklist and added a deterministic keyword-filter backstop
  (`strip_changeable_mentions()`) in `poller.py`. Also corrected `TASK_BOARD_NOW.md`'s fingerprint
  pipeline design notes, which had drifted from the live code - confirmed the scorer's room-match step
  still compares raw reference photos directly and never actually reads the fingerprint. See
  `D-2026-08-02-fingerprint-prompt-permanence-tightening`. Applied directly to the user's `poller.py`
  and delivered back to them (not committed - lives in the separate `jrc-homelab/hs-homelife-poller`
  repo); live confirmation pending.

## 2026-08-01

- Corrected the 2 historical rows actually affected by the timezone bug below: audited every
  date-bearing column across all 6 real families against each row's own `created_at` instant, and
  found exactly one real-world event (a Gallaghers `parent_pass` on 2026-07-13) had been double-logged
  under the old `Australia/Sydney` default as the wrong calendar day in both `kid_progress_log` and
  `family_room_log`. Fixed both (migration `correct_historical_sydney_default_dates_to_perth`).
  Everything else needed no change: every `kid_streaks`/`family_room_progress` streak field was
  already correct by coincidence (no real pass event landed in the UTC/Perth drift window), and
  reading-tracker's differing dates are legitimate parent-entered backfills, left untouched. See the
  follow-up section of `D-2026-08-01-day-boundary-timezone-perth`.
- Fixed a day-boundary timezone bug in `family-api`: server-side "today" date logic (3 column
  DEFAULTs, `todayStr()`, and all 4 atomic points/streak functions added the day before) was UTC, and
  the column DEFAULTs were even hardcoded to `Australia/Sydney` - the wrong city for this Perth-based
  family. Fixed all of it to use `Australia/Perth` (migration `fix_day_boundary_timezone_to_perth`,
  `todayStr()` rewritten with `Intl.DateTimeFormat`), redeployed `family-api` (v40, verified
  byte-identical to the local source), and live-smoke-tested against a disposable test family. See
  `D-2026-08-01-day-boundary-timezone-perth`.
- Pushed a cross-project lesson to `ai-lessons-learned` (`grep-the-mechanism-not-field-names`)
  distilled from the 2026-07-31 review's own follow-up misses: sweeping for a recurring bug pattern
  by grepping known field names misses instances the search never thought to include; grep for the
  mechanism (every `innerHTML =` site, etc.) instead.

## 2026-07-31

- Swept the whole repo for the same missing-`escapeHtml()` pattern one more time: `reading-tracker`'s
  kid picker had unescaped `avatar_emoji` (same fix as reward-tracker's follow-up below), and
  `parent-dashboard`'s AI-score displays (`aiScoreLineHtml`, the AI history modal) rendered the
  vision model's `comment`/`rejection_reason` text unescaped into `innerHTML` - a lower-probability
  vector (would need a prompt-injected model response, not direct user input) but fixed for
  consistency with every other field. Re-verified every other app (bedroom-reset, my-rewards,
  leaderboard) line by line - everything else already goes through `escapeHtml()`, `.textContent`,
  or is server-validated/hardcoded data (badge/level titles, signed photo URLs, weekday labels).
  Bumped `reading-tracker` service worker to v6, `parent-dashboard` to v9.
- Follow-up to the review below: `apps/reward-tracker/app.js` also had unescaped `kid.avatar_emoji`
  at ~10 more `innerHTML` sites (kid chips, active-kid banner, spin-kid picker, table headers,
  insights bars/stats, history rows, big-reward headers, undo toast, avatar settings row, Kid
  View) - noticed while fixing the color-escaping finding but out of scope at the time, now fixed
  too. Bumped `reward-tracker` service worker to v21.
- Ran a full-repo code review (5 parallel passes covering `family-api`, reward-tracker/my-rewards,
  bedroom-reset/leaderboard, reading-tracker/parent-dashboard, and shared helpers/infra) and fixed
  all 17 confirmed findings:
  - **Security:** stored XSS in `leaderboard`, `bedroom-reset`, and `parent-dashboard` (none
    imported `escapeHtml()`, unlike every other app) - now escaped throughout. `respond_to_trade`
    could be double-accepted, duplicating a reward-point transfer between kids - fixed by claiming
    the trade atomically before its side effects, not after. reward-tracker's PIN-lock UI (delete
    category, delete spin reason, Reset) was client-side only - the edge function now independently
    re-verifies, and PIN protection became a real per-family server setting instead of a
    server-blind per-device toggle. A kid locked out of trade-verification could bypass the lockout
    by changing their secret picture (which silently cleared it) - now blocked server-side. See
    `DECISIONS.md` D-2026-07-31-reward-tracker-pin-server-enforcement and
    D-2026-07-31-kid-trade-security-fixes.
  - **Correctness/races:** `update_checklist_item`/`update_family_room_item`/`awardBedroomPass`/
    `awardRoomPass` had non-atomic read-modify-write races on points/streak totals (lost awards,
    double-awarded daily completion bonus) - replaced with 4 new row-locked Postgres functions. See
    `DECISIONS.md` D-2026-07-31-atomic-points-streak-updates. `my-rewards` `loadState()`/
    `refreshTradeState()` gained the same request-sequencing guard reward-tracker already had, for
    the same out-of-order-response bug. `reading-tracker`'s `todayStr()` used UTC instead of local
    date, corrupting the ahead/behind goal banner near local midnight - fixed. `reading-tracker`
    never called `navigator.serviceWorker.register()` at all - its service worker (and every past
    `CACHE_NAME` bump) had never actually taken effect. `parent-dashboard`'s "Copy kid link" button
    was broken when launched as an installed PWA (regex didn't match `/index.html` paths). A badge
    earned in the same tick as a level-up in bedroom-reset was silently dropped instead of shown
    (guaranteed for the "Level 5" badge) - now queued and shown in sequence. bedroom-reset's cached
    bedroom-item labels were stored under an unscoped, cross-family localStorage key - now
    token-scoped like its sibling caches. Saving zero selected reading-goal days-of-week silently
    reverted to "all 7 days" on reload - now blocked client-side. parent-dashboard's 45s
    auto-refresh could silently revert an unsaved "share on public leaderboard" toggle - added to
    its edit-guard.
  - **Minor:** unescaped-but-backend-validated color values in reward-tracker/my-rewards escaped
    for defense in depth; a cosmetic "++16 points" typo in bedroom-reset's parent-check toast fixed
    to "+16"; `apps/shared/config.js` was missing the `POINTS` export `scripts/compare-points.js`
    expects (now added, matching the backend exactly); `.github/workflows/compare-points.yml` had
    been invalid YAML since creation (flattened `on:`/`jobs:` blocks) - the CI check had never
    actually run - reformatted to valid YAML.
  - Two new Supabase migrations (`add_pin_protection_enabled_to_families`,
    `add_atomic_points_streak_functions`); `supabase/functions/family-api/index.ts` redeployed and
    smoke-tested live against a disposable test family. Bumped service worker caches: bedroom-reset
    v25, parent-dashboard v8, reward-tracker v20, my-rewards v7, reading-tracker v5.

## 2026-07-30

- Gave `apps/reading-tracker` its own distinct favicon/PWA icon (open book with a purple bookmark, on
  blue - `assets/images/homelife-reading-original.png`), replacing the generic placeholder it launched
  with. Resized down to `apps/reading-tracker/icons/{favicon-16,favicon-32,icon-192,icon-512}.png`
  (palette-quantized, 502KB source → 19.5KB at 512x512) and pointed `index.html`'s favicon `<link>`
  tags and the service worker's cache list at these local files instead of the shared
  `apps/shared/icons/favicon-{16,32}.png`, matching the existing per-app-favicon convention (e.g.
  parent-dashboard, reward-tracker). Bumped `reading-tracker` service worker to v4.
- Added `apps/reading-tracker`, a new parent-facing PWA for tracking each kid's reading: start a book
  (title, optional total pages), log the page they're up to for a given date (pages read is computed
  automatically as the delta from the last entry), mark books finished, and set a per-kid nightly pages
  goal plus a per-kid "bonus spin every N cumulative pages" threshold. Crossing that threshold grants a
  Reward Tracker bonus spin automatically via the existing `bonus_spins`/atomic-increment mechanic (same
  one Bedroom Reset's AI auto-approve already uses). New tables `kid_reading_books`/`kid_reading_log` and
  new `kids` columns `reading_daily_goal_pages`/`reading_spin_threshold_pages`/
  `reading_pages_credited_for_spin`; new family-api actions `get_reading_state`, `set_reading_settings`,
  `start_book`, `finish_book`, `reopen_book`, `delete_book`, `log_reading_pages`, `undo_reading_log`. See
  `DECISIONS.md` D-2026-07-30-reading-tracker-new-app.
- Reward Tracker: the Spin tab no longer shows the kid picker in the sticky header - pressing SPIN
  now opens a "Spin for who?" modal first, then spins for the chosen kid. Quick Tap's header kid
  picker is unchanged. See `DECISIONS.md` D-2026-07-30-spin-tab-ask-kid-on-spin.
- Fixed Reward Tracker's app version tag being invisible: it was nested inside the Settings modal
  instead of sitting at the bottom of the page like every other app (e.g. `parent-dashboard`) -
  moved it to the bottom of the main app view.
- Expanded `apps/reading-tracker`: books and individual page-log entries are now editable in place
  (`edit_book`, `edit_reading_log`) alongside delete, with a per-book expandable log history; "Currently
  reading" moved above the Setup section; Setup gained a goal start date, which weekdays count toward the
  goal, and a reading-holidays list (date ranges excluded from the goal) via new table
  `kid_reading_holidays` and new `kids` columns `reading_goal_start_date`/`reading_goal_days_of_week`; a
  new banner just below the header shows whether a kid is ahead or behind their pages goal as of today,
  computed client-side from the log plus these settings. Also fixed `kid_reading_books`/`kid_reading_log`/
  `kid_reading_holidays`'s `family_id`/`kid_id` foreign keys to cascade on delete, matching every other
  family/kid table's convention (missed in the original migration; surfaced by the disposable-test-family
  cleanup step failing with a foreign-key violation).
- Fixed the reading tracker's ahead/behind banner silently never activating for a kid whose Setup had a
  pages-per-night goal saved but no goal start date - the date field had no default, so saving the goal
  alone (without also touching that field) left it null and the banner permanently hidden with no
  indication why. `goalStartDateInput` now defaults to today (same convention as the log-date input)
  whenever a kid has no saved start date, so hitting Save alone now activates tracking from today. Bumped
  `reading-tracker` service worker to v3. See `DECISIONS.md` D-2026-07-30-reading-tracker-goal-start-date-default.

## 2026-07-28

- Added a "Technical access ≠ scope" section to `AGENTS.md`, retrofitted from a new standard-level rule in
  AI_templates (`AGENTS_TEMPLATE.md`/`AI_RULES.md` Rule 10), after direct testing on Home AI Server
  confirmed a session with broad, non-enforced access would cross into a different project's files if
  asked. See `DECISIONS.md` D-2026-07-28-technical-access-not-scope.

## 2026-07-27

- Added a "🎁 Big" tab to `reward-tracker` for ad-hoc "big" rewards (1-2/month/kid) that are bigger and
  rarer than a category tap: a reason + earned date when logged, then what it was spent on + a spent date
  recorded later via a "💰 Spend" button. New `kid_big_rewards` table (RLS enabled, zero policies, same
  posture as every other family table) with `add_big_reward`, `spend_big_reward`, `undo_big_reward_spend`
  and `delete_big_reward` edge function actions - no PIN gate, no dollar/point amount, free text only.
  `my-rewards` gained a matching read-only section so a kid can see their own pending and spent big
  rewards on their card (`get_kid_big_rewards`, no write path). Bumped `reward-tracker` service worker to
  v17 and `my-rewards` to v6. See `D-2026-07-27-reward-tracker-big-rewards`.

## 2026-07-26

- Fixed a kid-to-kid trade bug in `my-rewards`: a kid could propose trading away a reward category they
  had zero (or fewer than the offered quantity of) balance in - the "you give" picker listed every family
  reward category regardless of what the kid actually held. `openProposeView()` now restricts that picker
  to categories with a positive balance (`myGiveableCategories()`), clamps the quantity input to the
  available balance, and shows "You don't have any rewards to trade yet" with the propose flow disabled
  if none qualify. Enforced server-side too, per the usual boundary: `propose_trade` now checks the
  proposing kid's actual balance before inserting the trade, and `respond_to_trade`'s accept path
  re-checks both sides' balances at the moment of acceptance (balances can shift between propose and
  accept) and auto-cancels a trade that no longer checks out instead of moving balances negative. Bumped
  `my-rewards` service worker to v5.
- Added a real "Install App" button to the bottom of bedroom-reset, using the `beforeinstallprompt` /
  `prompt()` flow (Chrome/Edge/Android) instead of only the text hint telling people to find the browser's
  install menu themselves. The text hint stays for browsers (iOS Safari) that never fire
  `beforeinstallprompt`, where there's no programmatic install to trigger. Bumped `CACHE_NAME` to
  `bedroom-reset-pwa-v23`.
- Fixed bedroom-reset's install hint text, which told people to use "Chrome or Edge" even though Firefox
  and Safari both support installing via their own browser menu (they just don't support the
  `beforeinstallprompt` API our button uses, so they need the manual path). Bumped `CACHE_NAME` to
  `bedroom-reset-pwa-v24`.

## 2026-07-20

- Added a visible cache-version indicator to all four PWAs (bedroom-reset, reward-tracker, my-rewards,
  parent-dashboard), so a device can actually be checked against what was just deployed instead of it
  being invisible whether a service worker picked up the latest release. New `apps/shared/version.js`
  reads each app's own `service-worker.js` `CACHE_NAME` at runtime (a `fetch` + regex, since a service
  worker runs in a separate script context from the page and there's no direct import between them) and
  writes it into a small muted `#appVersion` tag - inside reward-tracker's existing Settings modal, in a
  small footer for the other three, which didn't have an equivalent screen. Deliberately not a second
  hand-typed version string anywhere, so there's still only the one place (`CACHE_NAME`) to bump per app.
  Verified live via Playwright across all four apps. Bumped service worker caches: bedroom-reset v22,
  reward-tracker v16, my-rewards v4, parent-dashboard v7.
- Renamed all 8 `.claude/commands/*.md` slash commands to carry `-code-`, distinguishing them from a
  separate family of lighter "-chat-" Claude.ai Skills used outside this repo (see
  `D-2026-07-20-rename-code-commands`): `add-task`→`add-code-task`, `pick-task`→`pick-code-task`,
  `run-task`→`run-code-task`, `sweep-tasks`→`sweep-code-tasks`,
  `cleanup-branches`→`cleanup-code-branches`, `close-session`→`close-code-session`,
  `log-ai-lessons`→`log-code-lesson`, `plan-for-review`→`make-code-cold-plan-review`. Updated every
  cross-reference between the command files and in `AGENTS.md`; left `CHANGELOG.md`/`DECISIONS.md`/
  `docs/sessions/*.md` using the old names since they're a historical record of what happened at the time.

## 2026-07-19

- Fixed all 20 correctness findings from today's two code-review passes
  (`bedroom-reset`, then `reward-tracker`/`my-rewards`) that had been
  reported but deliberately left unfixed at the time. Highlights:
  - **bedroom-reset:** localStorage checklist/streak caches are now scoped
    by the active kid's token (fixes a cross-kid data leak on shared
    tablets); `session_expired` is now caught centrally in `callRoomApi()`
    and clears the tablet back to the code-entry screen instead of looking
    like an offline failure forever; room-switch races in
    `fetchAndReconcile()`/`syncItem()`/the AI photo-submit handler/the AI
    poll now capture the room a request was for and drop a stale response
    instead of misapplying it to whatever room is now showing; an offline
    checklist edit that fails to sync is now tracked per-room in a
    persisted "dirty" set so a later reconcile retries it instead of
    silently reverting it back to the server's stale value; "Start a new
    day" no longer clears the checklist if `reset_day` actually failed; a
    deleted shared room now auto-recovers the kid back to their own
    bedroom with a toast instead of dead-ending; `bootRoom()`'s shared-room
    branch now updates Focus Mode UI; the AI-score submit error map now
    covers all 12 possible codes instead of 4. Also fixed server-side:
    `submit_photo_for_scoring` now returns an enriched `photo_url` (was
    returning the raw un-enriched row, so no thumbnail showed until the
    next poll).
  - **reward-tracker:** `tapReward()` now rolls back its optimistic balance
    change and shows an error toast if `adjust_reward` fails, instead of
    leaving an unsaved balance on screen forever; category/reward-note
    add/update/delete (5 call sites) now check `res.ok` and surface errors
    instead of silently no-op'ing; `loadState()` now has a sequence-number
    guard so an out-of-order response from a rapid double-tap/spin can't
    overwrite newer state, and surfaces a toast for any failure beyond
    `session_expired` instead of going silent; the spin wheel's completion
    logic now has a timeout fallback, so switching tabs mid-animation (which
    cancels the CSS transition) no longer hangs the Spin button forever;
    Settings' PIN-protection description no longer claims it gates Spend
    (removed by the 2026-07-18 instant-tap redesign, but the copy was never
    corrected). The "Spin twice" double-spin mechanic is now identified by a
    new `is_bonus_spin` flag (migration, backfilled for all 6 existing
    families with the category) instead of a case-insensitive label match,
    with deletion blocked server-side and a lock icon client-side, mirroring
    how a `trigger_key`-linked spin reason is already protected - renaming
    the category no longer silently breaks or hijacks the mechanic. See
    `D-2026-07-19-bonus-spin-category-flag`.
  - **my-rewards:** a sibling's `avatar_emoji` is now escaped before
    rendering (was a genuine stored-HTML-injection gap - the edge function
    had no server-side length cap either, now added, `.slice(0, 16)`,
    matching how `name` is already capped); a stale trade-accept response
    can no longer hijack or dismiss a different, currently-open trade's
    verify modal (session-tagged, checked before acting); the verify-picture
    grid now disables itself while a request is in flight (matching
    Decline/Cancel) to stop a double-tap from firing two concurrent accepts.
  All fixes verified: bedroom-reset and reward-tracker/my-rewards via
  Playwright against mocked API responses reproducing each original bug
  scenario; the two edge-function fixes (photo_url enrichment, avatar_emoji
  cap) and the is_bonus_spin migration/delete-block verified live against
  disposable test families, then cleaned up.
- Ran a `/code-review` + `/simplify` pass over `reward-tracker` and
  `my-rewards`. Code-review surfaced 10 confirmed/plausible findings,
  notably more serious than the earlier bedroom-reset pass: a genuine
  stored-HTML-injection gap (`my-rewards` interpolates a sibling's
  `avatar_emoji` unescaped, and the edge function enforces no
  server-side allowlist on that field); Settings' PIN-protection
  toggle telling parents it gates Spend when that was intentionally
  removed by the 2026-07-18 instant-tap redesign and the copy was
  never corrected; a race where a stale trade-accept response can
  hijack or dismiss a different, currently-open trade in `my-rewards`;
  the Spin wheel permanently hanging (until reload) if a parent
  switches tabs mid-animation, since hiding `#spinView` cancels the
  CSS transition its completion logic awaits; `tapReward()` having no
  rollback/error-toast on a failed balance update, unlike every other
  mutating action in the file; five category/reward-note management
  call sites silently ignoring failed saves; an unawaited `loadState()`
  inside `tapReward()` that can let a stale response overwrite a newer
  one after rapid taps/spins; `loadState()` swallowing every non-
  `session_expired` failure despite being the resync called after
  nearly every action (~19 call sites); an unguarded double-tap race
  on `my-rewards`' trade-accept picture grid; and the "Spin twice"
  double-spin mechanic being keyed off a case-insensitive label string
  match instead of a stable id, so renaming that category silently
  breaks or hijacks it. Reported, not fixed, since fixing correctness
  bugs wasn't part of this pass. Simplify then applied cleanup:
  migrated `reward-tracker`'s confirm-modal to the shared
  `apps/shared/confirm.js` module (mirroring bedroom-reset's earlier
  migration); extracted the `escapeHtml` helper (previously duplicated
  identically in both apps, with a pointless `escapeAttr` alias in
  reward-tracker) into `apps/shared/escape.js`; made `renderAll()`
  skip rebuilding the Spin wheel/Table view while their tab isn't
  active (re-rendering fresh on switch-in instead, same pattern the
  wheel already used); optimized `renderHistory()` to build one
  kid/category lookup map instead of a fresh linear search per row;
  added a `visibilitychange` pause to `my-rewards`' 30s poll so a
  backgrounded/locked tab stops hitting the edge function; corrected a
  stale code comment claiming the PIN gates Spend. Skipped (would
  change behavior or need a schema change, out of scope for a frontend
  cleanup pass): the "Spin twice" string-match fragility (needs a
  stable category flag/id, a migration); deduplicating the 3-of-9
  parent-icon-picker logic now triplicated across reward-tracker,
  parent-dashboard, and bedroom-reset (cross-app scope); an apparently
  orphaned "Reward Reasons" notes feature that's still reachable via
  its own menu button even though no current tap action passes a note
  to it (a product decision, not dead code to delete unprompted).
  Verified both apps live via Playwright (confirm modal, Table/Spin
  view switching, history rendering, and the visibility-pause polling
  behavior - zero console errors). Bumped service worker caches:
  reward-tracker v15, my-rewards v3.
- Ran a `/code-review` + `/simplify` pass over the whole `bedroom-reset` app.
  Code-review surfaced 10 confirmed/plausible correctness bugs (races when
  switching rooms mid-request, cross-kid localStorage cache leakage on a
  shared tablet, offline edits silently reverted on next sync,
  `session_expired` never distinguished from a generic network failure,
  and a few others) - reported, not yet fixed, since fixing them wasn't
  part of this pass. Simplify then applied the reuse/simplification/
  efficiency/altitude cleanup: extracted the confirm-modal and lightbox
  logic (previously duplicated byte-for-byte from `parent-dashboard`) into
  `apps/shared/confirm.js` and `apps/shared/lightbox.js`; collapsed
  `fetchAndReconcile()`'s duplicated bedroom/shared-room branches and the
  six ad-hoc room-dispatch wrappers into one action-table-driven
  `callRoomApi()`; merged the copy-pasted Pass/Great-Job button handlers;
  removed dead `.kidGrid`/`.kidBtn`/`.kidAvatar` CSS; made the 20s AI-score
  poll call a lightweight status-only fetch instead of a full checklist
  teardown/rebuild; made per-tap category-badge updates read from an
  in-memory list instead of re-querying the DOM; had `bootRoom()` reset AI
  state through the existing `applyAiScore()` path instead of a partial
  hand-rolled reset. Verified live via Playwright (checklist render,
  checkbox sync, category badges, the new shared confirm modal - zero
  console errors). Bumped `bedroom-reset`'s service worker to v21.
- Fixed 10 issues a high-effort multi-angle code review found in the bonus-spin system (8 finder
  agents, 12 candidates verified, 10 confirmed - see `D-2026-07-19-spin-credit-code-review-fixes`).
  Headline fix: `bonus_spins` increments/decrements are now atomic Postgres functions
  (`grant_spin_credit_atomic`/`consume_bonus_spins_atomic`, row-locked via `SELECT ... FOR UPDATE`)
  instead of a plain read-then-write that let a concurrent grant and consume silently clobber or lose
  a spin - three independent review angles converged on this bug from different directions.
  `bonus_spins` is now also capped at 20 so a spin chain can never lose spins beyond the client's
  25-spin safety limit. Also fixed: deleting the seeded "Tidy Room AI Score" reason no longer silently
  and permanently breaks Bedroom Reset's auto-grant (blocked server-side, shown as "🔒 Linked" in the
  UI); the new "Manage Bonus Spin Reasons" delete now requires the family PIN like every other
  destructive reward-tracker action; the wheel's wedge labels are correctly sized on first view of the
  Spin tab instead of using a stale 300px fallback; three `manage_spin_reasons` UI actions now surface
  errors instead of silently doing nothing on failure; the grant button resyncs to "Used" instead of
  retry-looping on a conflict; `grant_spin_credit` accepts a `trigger_key` (not just the internal
  `reason_id`), making it genuinely usable by a real external caller; a previously-discarded grant
  error in Bedroom Reset's auto-approve path is now logged; and `spinSoundPreset()` no longer trusts
  an inherited `Object.prototype` property name as a valid sound preset. Bumped reward-tracker's
  service worker cache to v14.
- Fixed two Reward Tracker bugs and added a bonus-spin system plus wheel/
  sound upgrades, from six items the user reported after trying the mobile
  redesign. Fixes: the sticky header no longer travels ~16px before locking
  to the top on scroll (removed `body`'s top padding, which was the actual
  gap); History's Undo button now works on entries with a long note (the
  row had no `min-width: 0`, so it silently overflowed the viewport and
  pushed the button off-screen) and any future undo failure shows a visible
  error instead of leaving the button stuck disabled with no feedback.
  New: a bonus-spin system - named reasons (e.g. "Weekly Mathletics Award")
  grant a kid a bonus spin, each capped to once per its own daily/weekly/
  monthly period, tickable manually in Reward Tracker's Spin tab or granted
  automatically by another app (Bedroom Reset's AI room-score auto-approve
  is the first caller) through one shared, generic `grant_spin_credit`
  action - not a gate on spinning, a bonus spin just chains an extra
  automatic spin onto the next SPIN tap, same mechanic as the existing
  "Spin twice" category. New "Manage Bonus Spin Reasons" screen in the
  overflow menu. The wheel itself is bigger, shows each category's label
  directly on its wedge, and the SPIN button now sits in the wheel's hub,
  hidden while spinning instead of just disabled. Spin sound is now a
  preset picker (Chimes/Arcade/Retro/Off) instead of an on/off toggle,
  migrating anyone's existing on/off preference automatically. New
  `kids.bonus_spins` column, `family_spin_reasons`/`kid_spin_credit_grants`
  tables, `manage_spin_reasons`/`grant_spin_credit`/`consume_bonus_spins`
  actions. See `D-2026-07-19-spin-credit-system` (including a noted
  verification gap: the Bedroom Reset trigger itself couldn't be tested
  live, since it's gated by a worker-only secret this session can't reach -
  every other new action was verified against a disposable test family).
  Bumped reward-tracker's service worker cache to v13.
- Redesigned Reward Tracker's header and Table view for mobile, from a
  user-supplied UI brief. The large orange header is now a compact
  sticky app bar (title + context controls only; height cut from a
  multi-line block to ~57px in Table view, ~106px in Quick Tap/Spin
  where the kid picker still shows); Settings, dark mode, Kid View, and
  the two category/reason management screens moved into a new overflow
  menu (☰). The reward table now behaves like a real spreadsheet on
  scroll: the child-name header row, the reward/category left column,
  and their shared top-left corner cell all stay pinned in place while
  scrolling vertically, horizontally, or both at once
  (`border-collapse: separate` + per-cell `position: sticky`, since
  collapsed borders and sticky cells don't reliably mix, especially in
  Safari). Table view also gained a View Mode (default - just the
  balance number, no clutter) and Edit Mode (Edit/Done toggle in the
  header, reveals the existing +/- controls) - Quick Tap/Spin are
  unchanged, they were never in scope for the toggle. See
  `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`.
  Regression-tested the full existing reward-tracker Playwright suite
  (spin weighting, kid themes, instant-tap, icon-picker verification)
  after moving the admin buttons into the menu - caught and fixed one
  real bug in the process (the sticky header's z-index outranked every
  modal, silently blocking clicks on modal content underneath it).
  Bumped reward-tracker's service worker cache to v12.
- Added a 3-of-9 icon-picker as a family-chosen alternative to the
  4-digit parent PIN, covering every PIN-gated flow that shares
  `families.parent_pin` today: reward-tracker (delete category, Reset,
  Kid View exit) and Bedroom Reset's Parent Check. A family picks PIN
  or icon-picker in the parent dashboard's Settings (not a replacement
  - only one is active at a time); the 9-icon grid reshuffles positions
  on every open and after every wrong attempt so a kid watching can't
  learn the picker's *layout*, only which pictures matter, matching
  order doesn't matter (3-of-9, ~1-in-84 odds). New
  `families.parent_auth_method`/`parent_icons` columns, one shared
  `verifyParentSecret` backend helper replacing three previously-
  duplicated inline PIN comparisons, and a new role-agnostic
  `get_family_auth_method` action so a kid's own device can pick the
  right verification UI before a parent authenticates. See
  `D-2026-07-19-parent-icon-auth-alternative`. Verified live against
  disposable test families for all three apps. Bumped service worker
  caches: parent-dashboard v6, reward-tracker v11, bedroom-reset v21.
- Added spin weighting, sound, and adjustable duration to the reward
  wheel. Each reward category now has a 1-5 spin weight (editable in
  Manage Categories) that controls the wedge's *size* on the wheel -
  bigger wedge, more likely landing, no separate odds logic needed since
  a uniform-random landing angle is weighted by construction. Spin sound
  (synthesized ticks + a landing chime, no sound files) is on by default,
  toggleable in Settings; spin duration is also a Settings slider (2-8s,
  default 2.6s). Fixed a real bug where a never-set duration silently
  clamped to the 2s minimum instead of the intended 2.6s default
  (`Number(null)` is `0`, not `NaN`). See
  `D-2026-07-19-reward-tracker-spin-weighting`. Bumped the reward-tracker
  service worker cache to v10.
- Added kid-to-kid reward trading to My Rewards: a kid can propose giving
  up some of one reward for some of a sibling's, the sibling accepts or
  declines with no parent step. Accepting is gated by picking your own
  secret picture out of a shuffled 4x4 grid instead of a PIN (kid-friendlier,
  same "friction, not a real boundary" posture as the parent PIN
  elsewhere) - two wrong picks locks accepting out for 15 minutes. New
  `kid_reward_trades` table, new `kids.verify_image`/`verify_fail_count`/
  `verify_locked_until` columns, five new edge-function actions. Found
  and fixed three real bugs during testing (an `action`-field name
  collision that silently broke every accept/decline, a stale lockout
  check, and the main balance not refreshing after a trade). Verified
  live against a disposable two-kid test family. Bumped the my-rewards
  service worker cache to v2. See `D-2026-07-19-my-rewards-trading`.

## 2026-07-18

- Added a 🎡 Spin wheel mode to the reward tracker: a wheel of the
  family's reward categories, spun for whichever kid is selected,
  landing logs a real earn (no backend changes - reuses `adjust_reward`).
  Landing on "Spin twice" triggers two bonus spins instead of tallying a
  literal reward, since that's what the category actually represents.
  See `D-2026-07-18-reward-tracker-spin-wheel`. Bumped the reward-tracker
  service worker cache to v9.
- Gave the parent dashboard its own distinct favicon/app icon
  (`Homelife_parents_favicon.png` - blue background, purple checkmark,
  differentiating it from the other apps' green house icon, per the
  original ask this session started with). Resized to
  `apps/parent-dashboard/icons/{favicon-16,favicon-32,icon-192,icon-512}.png`
  and pointed `index.html`'s favicon `<link>` tags and the service
  worker's cache list at these local files instead of the app sharing
  `apps/shared/icons/favicon-{16,32}.png` with every other app.
  `manifest.json` already referenced local `icons/icon-192.png` /
  `icon-512.png` paths, so only the file contents needed replacing
  there. Bumped the parent-dashboard service worker cache to v5.
- Fixed the `poller.py` `WORKER_TOKEN` hardcoding: it was a plain
  string literal in a file with a queued task to push it to a (private)
  GitHub repo, which would have put a real secret into git history
  permanently. Refactored to read `HOMELIFE_WORKER_TOKEN` from the
  environment instead (`os.environ.get(...)`, fails closed with
  `sys.exit` if unset) and walked the user through moving the actual
  secret value into their crontab (the only place it now lives, never
  committed). Verified live via the poller's own log output after the
  crontab update took effect - clean job polling plus a real
  fingerprint-regeneration request processed successfully end to end.
- Made earning/spending instant: removed the PIN requirement on Spend and
  the "pick a reason" note modal on every tap (both had made adding/
  spending feel slow), and made the balance update optimistically on tap
  instead of waiting for a full network round trip. PIN protection still
  covers deleting a category, Reset, and Kid View exit. The reasons
  feature (`family_reward_notes`, "Manage reward reasons" in Table mode)
  is unchanged and still usable, just no longer wired into a tap. See
  `D-2026-07-18-reward-tracker-instant-tap`. Bumped the reward-tracker
  service worker cache to v8.
- Replaced Quick Tap's "+ Earn / − Spend" mode switch with `+`/`-`
  buttons directly on each reward row - no more toggling a mode before
  tapping. Rows are thin (swatch, label, balance, two small buttons) and
  auto-fit into 2+ columns on wide screens, 1 on mobile. Spend still
  requires the PIN, same as before. See
  `D-2026-07-18-reward-tracker-inline-plus-minus`. Bumped the
  reward-tracker service worker cache to v7.
- Gave each kid a persistent, customizable colour (`kids.theme_color`,
  randomly assigned when added, overridable in Settings) and made Quick
  Tap visibly tint to the selected kid's colour with a "Now earning/
  spending for <name>" banner, so it's obvious who a tap affects.
  Existing kids were backfilled with the exact colour they already
  rendered as. Also: shrank the Quick Tap tiles substantially (they no
  longer need to be huge to stay identifiable now that colour theming
  carries that job), and Manage Categories now flags any reward category
  nobody has ever earned or spent with an "Unused" badge and a summary
  warning. Fixed a real bug along the way - the Reasons modal's
  Earn/Spend switch shared a class with Quick Tap's own switch and sat
  earlier in the DOM, which had been silently misdirecting Quick Tap's
  Earn/Spend click handler since the Reasons feature shipped. See
  `D-2026-07-18-reward-tracker-kid-theme-colours`. Bumped the
  reward-tracker service worker cache to v6.
- Made Reward Tracker's note-modal "reasons" (e.g. "Tidied room",
  "Redeemed today") fully customizable per family - add or delete any,
  starting from the same defaults every family already had. New
  `family_reward_notes` table (seeded per family, same pattern as
  `family_reward_categories`; existing families backfilled) and
  `manage_reward_notes` edge-function action. `get_reward_state` now
  returns `notes`; the note modal and a new "Manage reasons" screen
  (reachable from the note modal and from Table view) both read from it
  instead of a hardcoded list. See `D-2026-07-18-reward-tracker-custom-reasons`.

## 2026-07-17

- Added `apps/my-rewards`: a read-only, kid-facing PWA showing a kid's own
  reward balance and per-category breakdown, installable on their own
  device. Gated by their existing kid_code (same as bedroom-reset,
  same local-storage token key so one login covers both). New
  `get_kid_reward_state` action (kid session, no write path - nothing
  to PIN-gate). Sage-green themed per the "green for kids, blue for
  parents" convention - see `D-2026-07-17-my-rewards-kid-app`.

- Refreshed the shared favicon (from the user's
  `homelife_favicon_original.png`) and gave Reward Tracker its own PWA
  icon, resized down to `apps/shared/icons/favicon-{16,32}.png` and
  `apps/reward-tracker/icons/icon-{192,512}.png`. Reward Tracker's icon
  is the blue star (`homelife_parents_rewards.png`) per the user's
  correction, not the sage-green variant used everywhere else. Bumped
  the bedroom-reset, parent-dashboard and reward-tracker service worker
  caches (v20/v4/v4) so installed devices pick up the new icons.
- Added confetti celebrations to the kid app for real milestones - a new
  badge earned, a Parent "Great Job", and a Parent "Pass" each now get
  their own burst (room-complete and level-up already had one). Also
  added a small chance (~1 in 12) of a brief, toast-free confetti flash
  on an ordinary checklist tick, just as an occasional surprise. When two
  milestones land in the same update (e.g. a badge unlocked by the same
  points that triggered a level-up, or a badge earned on the same Parent
  Pass that awards it), only the bigger one's toast and confetti fire
  instead of stacking two bursts and losing the more exciting message -
  `applyStreak` now reports whether it already celebrated something so
  callers can skip their own. Verified live via Playwright against a
  disposable test family for every trigger (level-up, first badge,
  plain Pass, Great Job, and the coincidence-dedup case). Bumped the
  bedroom-reset service worker cache to v19.
- Fixed two bugs reported in the parent dashboard's "Clear (let AI
  regenerate)" fingerprint flow. First, the confirm dialog appeared
  behind the already-open AI Scoring modal, since `.confirmModal` and
  `.aiModal` shared the same z-index (290) and CSS stacking ties resolve
  by DOM order, so the modal declared later in the HTML always won -
  same issue affected `.lightbox` (opened from the history modal's
  thumbnails) at a lower z-index still. Raised both `.confirmModal` and
  `.lightbox` above `.aiModal`. Second, clearing a fingerprint appeared
  to silently do nothing - by design, the AI never regenerates it
  immediately, only lazily the next time the local worker scores a
  photo, but nothing in the UI said so, which read as broken. The
  confirm prompt and the post-clear message now both say plainly that
  regeneration happens on the next scoring job, not right away.
  Verified live via Playwright (confirmed the actual DOM element under
  the Yes button is the Yes button, not the AI modal, before vs. after).
  Bumped the parent-dashboard service worker cache to v3.
- Added a "🔄 Regenerate now" button next to "Clear" for a kid's/room's
  room fingerprint, so a parent doesn't have to wait for a kid to submit
  a photo before the AI writes a new one. New
  `request_fingerprint_regeneration` action (parent-gated, requires at
  least one reference photo, resets and unlocks the fingerprint same as
  Clear) sets a `room_fingerprint_regen_requested_at` timestamp; a new
  `get_pending_fingerprint_regenerations` action lets the worker poll for
  these independently of its existing photo-scoring poll, self-clearing
  a request if its reference photos got deleted before the worker got to
  it. `submit_room_fingerprint` now clears the timestamp on any
  successful write, so both the lazy (next-photo) and explicit
  (regenerate-now) paths converge on the same completion signal. The
  parent dashboard shows a pending state (buttons disabled, "⏳
  Regeneration requested...") and polls every 8s for up to ~3 minutes
  while the modal is open. Migration `room_fingerprint_regen`, deployed
  as edge function v19. Verified via Node script and Playwright,
  including simulating the worker's completion mid-poll by writing the
  row directly (the real `WORKER_TOKEN` isn't available in this
  session, and regenerating it would break the user's live worker).
  See `D-2026-07-17-fingerprint-regenerate-now` in `DECISIONS.md`.
  `poller.py`'s side of this - the actual new polling loop and
  fingerprint-only generation call - is still pending; needs the user's
  current file to edit precisely rather than reconstruct from memory.
- Deployed the merged edge function (v20, combining the fingerprint
  regenerate-now work above with the Reward Tracker actions below,
  after two rounds of merging a diverged `origin/main`) and verified
  both feature sets live against a disposable test family. Discovered
  the user's actual current `poller.py` no longer generates or uses
  room fingerprints at all - it compares submitted photos directly
  against raw reference photos, so the fingerprint field is currently
  a parent-facing description only, disconnected from scoring. Added
  `generate_room_fingerprint()` (a new llava:13b prompt, JSON-schema
  constrained like the rest of the file) and a second poll in `main()`
  for `get_pending_fingerprint_regenerations`, submitting results via
  the existing `submit_room_fingerprint` action - purely additive,
  scoring logic (`process_job`) untouched. Delivered the updated
  `poller.py` to the user (never committed - embeds `WORKER_TOKEN`).
  See `D-2026-07-17-poller-fingerprint-generation` in `DECISIONS.md`.
- Added the Reward Tracker app (`apps/reward-tracker`): a parent-run
  earn/spend tally per kid per reward category, with Quick Tap, Table and
  History+Undo views, dark mode, and note presets. Wired into the shared
  Supabase backend (new `family_reward_categories` and `kid_reward_log`
  tables, four new `family-api` actions) instead of the standalone
  localStorage version it started as - see `D-2026-07-17-reward-tracker-app`.
  Linked from the root page and main README.
- Added a batch of Reward Tracker features: PIN protection on Spend/delete
  category/Reset/Kid-View-exit (5-minute unlock, toggleable in Settings),
  an Insights tab (weekly/monthly earned bars, all-time balance, top
  category per kid), a read-only Kid View (`?kid=<name>` for a single-kid
  tablet), per-kid emoji avatars in Settings, a full "Reset all reward
  history" action, and a 5-second Undo toast after every tap. Three new
  `family-api` actions (`verify_pin`, `get_reward_insights`,
  `reset_reward_history`) - see
  `D-2026-07-17-reward-tracker-pin-and-insights`.
- Added an AI-agent workflow scaffold: `CLAUDE.md` and
  `.github/copilot-instructions.md` stubs pointing at the existing
  `AGENTS.md`, plus 8 `.claude/commands/` skills (`add-task`,
  `pick-task`, `run-task`, `sweep-tasks`, `cleanup-branches`,
  `close-session`, `log-ai-lessons`, `plan-for-review`) adapted to this
  repo's existing governance docs and straight-to-`main` convention (no
  branches/PRs introduced) - see
  `D-2026-07-17-agent-workflow-scaffold`.

## 2026-07-16

- Restructured task tracking: renamed `ROADMAP.md` to `TASK_BOARD.md`,
  switched to a NOW/NEXT/LATER format with tags, status, and a "done
  when" condition per task, and folded in the AI-scoring quality/
  anti-cheat tasks (scoring consistency, structured output, room
  validation, room matching, photo freshness).
- Set up `AGENTS.md`, `DECISIONS.md`, and this changelog as the
  project's governance docs.
- Confirmed the home AI photo-scoring worker running end-to-end: the
  Ubuntu/Ollama box polls Supabase for pending photos, scores them
  with a local vision model, and posts results back. The AI
  photo-scoring feature is now fully live, not just built.
- Shipped photo freshness validation for AI scoring: the kid app now
  captures a photo's own timestamp before compression (which strips
  EXIF) and the edge function rejects stale/reused photos
  (`photo_too_old`). Added a real `rejected`/`failed` path to
  `submit_photo_score` (using the schema's existing but previously
  unused `'failed'` status) so anti-cheat rejections are distinct from
  a real low score, surfaced on both the kid app and parent dashboard.
  Verified via a disposable test family covering stale/missing
  timestamps, resubmission after a rejection, and an auto-approve
  regression check. Deployed as edge function v9.
- Delivered an updated `poller.py` to the user (not committed - it
  embeds the `WORKER_TOKEN` secret) consolidating the AI scoring-quality
  and anti-cheat work into one prompt: room-type detection, invalid/
  unusable-photo rejection, room matching against the existing
  reference photos (no stored fingerprint needed), explicit 1-10
  scoring ranges, and structured feedback (one encouraging sentence +
  exactly 3 specific actions). Redeploying it on the user's Ubuntu box
  is the one remaining step - see `docs/TASK_BOARD.md`.
- Live testing on the user's real hardware surfaced two real findings:
  the Ollama model tag has to match exactly (`llava:13b`, not `llava`)
  or every call 404s, and the single-prompt anti-cheat check did not
  reliably reject an obviously-wrong photo (shoes on outdoor pavement
  got scored as a bedroom). Neither is a repo bug - both are
  worker-side/model-capability findings.
- Added a `photo_hash` column and edge-function plumbing
  (`get_pending_photo_scores` returns the target's last-scored photo's
  hash as `previous_photo_hash`; `submit_photo_score` accepts and
  stores a new one on both the scored and rejected paths) so the
  worker can detect a reused photo. Deployed as edge function v10,
  verified via a Node script covering the round-trip and the "a
  rejected submission's hash never becomes the comparison point"
  edge case.
- Rebuilt `poller.py` as a layered pipeline: two deterministic, no-AI
  checks (blank/blurry detection via pixel and edge variance; reused-
  photo detection via perceptual hashing) run before the photo ever
  reaches the vision model, so the AI is only asked the judgment calls
  that actually need it. Delivered to the user; live confirmation of
  the AI layer's room-validity check specifically is still pending.
- Rebuilt `poller.py` again around a gate/scorer split after getting a
  second opinion from three independent outside reviews on that
  pending room-validity failure. The `llava:13b` vision step no longer
  decides validity itself - it only reports observed evidence (setting,
  visible items, room/invalid evidence, confidence) via Ollama's
  `format` JSON-schema parameter, and plain code applies the pass/fail
  rule. Added a `moondream` pre-gate (already-pulled model, only
  auto-rejects on a confident "not a room") ahead of the fuller gate.
  Delivered to the user; live confirmation on the real worker still
  pending. See `D-2026-07-16-gate-scorer-split` in `DECISIONS.md`.
- Logged five hardening ideas surfaced by that same review round
  (deterministic scene-classifier gate, reference-photo embedding
  similarity, newer local VLM evaluation, a daily anti-cheat capture
  token, a parent-review state for uncertain results) as 🟢 LATER on
  `docs/TASK_BOARD.md` rather than building them all in immediately.
- Confirmed the rebuilt worker running live: fixed an Ollama model-tag
  mismatch on the way (`llava` resolves to `llava:latest`, which was
  never pulled - the actual model is `llava:13b`), then verified both
  a real anti-cheat rejection and a real tidy-room score with 3
  specific actions.
- Fixed the "Score my room with AI" photo input opening a generic
  upload/gallery picker instead of the camera - added
  `capture="environment"` so mobile browsers launch the camera
  directly, matching the "take a fresh photo right now" intent of the
  freshness check.
- Replaced raw reference-photo comparison for room-identity matching
  with a one-time "room fingerprint": a text description of a room's
  fixed, structural features (walls, flooring, windows, fixed
  furniture) generated once by the worker from a kid's/room's
  reference photos, explicitly excluding bedding/linens/clutter since
  those are expected to change. Fixes a real false-rejection bug found
  in live testing - the raw-photo room-match check was rejecting a
  kid's own genuine room because the bedding looked different from the
  reference photos. Added a `room_fingerprint` column on `kids` and
  `family_rooms` (invalidated automatically whenever reference photos
  change), and a worker-token-gated `submit_room_fingerprint` action.
  Deployed as edge function v11, verified via Node script (8 checks
  covering pre-seeded/invalidated/regenerated fingerprint states and
  worker-token auth). Also hardened the room-validity gate's prompt
  with a new `illustration_or_fictional` category and example, after a
  stylized fantasy-creature image slipped past both `moondream` and
  the `llava:13b` gate and was only caught by the (now fingerprint-
  based) room-match step. See `D-2026-07-16-room-fingerprint` in
  `DECISIONS.md`.

- Shipped three follow-up AI-scoring features requested after the
  fingerprint fix went live: a parent-facing score history (up to 50
  resolved attempts, newest first, with a legit/rejected filter), a
  processing-time estimate for kids (a "usually takes about Xs" hint
  before submitting and a live-ticking "Xs so far" line while a score is
  pending, both meant to stop kids from re-submitting mid-score), and
  direct parent editing of a kid's/room's AI room fingerprint text. The
  editable fingerprint needed a `room_fingerprint_locked` flag so a
  parent's correction survives the existing auto-invalidate-on-photo-change
  behavior instead of silently reverting to AI auto-generation; clearing
  the text explicitly opts back into that. Added `update_room_fingerprint`
  and `get_photo_score_history` edge-function actions and an
  `ai_score_avg_seconds` figure (averaged over the last 10 *scored*
  requests) on `get_kid_state`/`get_family_room_state`. Deployed as edge
  function v12. The parent dashboard surfaces all three in one "AI
  Scoring" modal per kid/room card. Verified via Node script (backend)
  and Playwright (live UI against a disposable test family). See
  `D-2026-07-16-fingerprint-lock-and-parent-visibility` in
  `DECISIONS.md`.

- Made the parent dashboard installable as a PWA - it never had a
  manifest, icons, or service worker, unlike the other two apps, so
  Chrome had nothing to offer an "Install app" prompt from. Added
  `manifest.json`, `icons/` (reusing the existing house/checkmark
  icon), a service worker (`parent-dashboard-pwa-v1`) for offline
  caching, and an install-tip hint under the header, mirroring the
  bedroom-reset app's setup. Verified via Chrome DevTools Protocol
  (`Page.getAppManifest`, service worker registration) that the
  manifest parses with no errors and the worker registers correctly.

- Added a clickable thumbnail of the actual submitted photo next to every AI
  score display, so a parent or kid can compare the photo against the AI's
  comment instead of taking it on faith. Shows on the kid app's current-score
  card (visible even while a score is still pending), the parent dashboard's
  inline score line on each kid/room card, and every row in the score-history
  modal (capped to the 15 most recent rows there, to avoid generating a
  signed URL for every row in a long history on every load). Reuses the
  photo that's already uploaded and already had a signed URL generated for
  the AI worker - no new photo processing, just returning that URL and
  adding a small `<img>` that opens the existing lightbox on tap. Added
  `photo_url` to `getLatestPhotoScore` and `get_photo_score_history`.
  Deployed as edge function v14 (a first deploy attempt, v13, accidentally
  sent placeholder text instead of the real file and was immediately
  corrected). Verified via Node script (photo_url present and fetchable on
  both the kid's pending view and the parent's history/dashboard views) and
  Playwright against a disposable test family (thumbnail visible and
  clickable in all three locations, correct image loads in the lightbox).

## 2026-07-15

- Shipped self-hosted AI photo scoring: a kid can submit a room photo
  for scoring, a home-network worker scores it against a local vision
  model, and the effect on the app is configurable per family (off /
  informational / nudge / auto-approve with a threshold). Ships with
  worker-token authentication and shared points/streak-award logic
  reused from the existing Parent Check flow.
- Locked "what done looks like" reference photos to parent-only
  add/remove, enforced both in the UI and in the edge function.

## 2026-07-13

- Renamed all "Mum"/"mum" wording to family-agnostic "Parent"/"parent"
  across the database, edge function, and all three apps.
- Fixed the Android on-screen keyboard not appearing on the code-entry
  screen.
- Fixed broken photo removal on the parent dashboard; redesigned to a
  direct ✕ button on each photo tile instead of a lightbox delete flow.
- Added per-family icon picker (dashboard header + leaderboard) and a
  family-editable bedroom checklist.
- Added the app's favicon/PWA icons across all three apps.
- Added reference-photo tips (using AI to generate a tidy reference
  photo, using Squoosh to compress large images) to the parent guide.
- Added a short parent onboarding guide.
