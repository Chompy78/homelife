# 2026-07-31 — Full-repo code review, then fix everything it found

**Focus:** User asked for "a full code review" of the whole repo, then "start fixing them without
my input if possible." Ran a 5-agent parallel review, verified the findings personally, then fixed
all 17 confirmed issues end to end (frontend, backend, two new DB migrations, edge function
redeploy, live smoke test).

## Timeline

- Scoped the review with the user: whole repo (all 6 apps + `family-api` + shared/infra), not just
  recent changes.
- Fanned out 5 parallel review agents, each with `AGENTS.md` context and a specific area: the
  `family-api` edge function (the security boundary); reward-tracker + my-rewards; bedroom-reset +
  leaderboard; reading-tracker + parent-dashboard; shared helpers + CI/infra.
- Personally re-verified every high/critical finding by reading the actual code, running
  `scripts/compare-points.js`, parsing `compare-points.yml` with `python3 -m yaml`, and querying the
  live Supabase schema/functions - not just trusting the agents' reports. Reported 17 findings via
  `ReportFindings`, ranked by severity, with CONFIRMED/PLAUSIBLE verdicts.
- User asked to fix all of them autonomously. Worked through all 17 as tracked tasks:
  1. **Stored XSS** in `leaderboard`/`bedroom-reset`/`parent-dashboard` - none imported
     `apps/shared/escape.js`'s `escapeHtml()`, unlike every other app. Fixed every unescaped
     interpolation (family/kid/room names, checklist item labels).
  2. **`respond_to_trade` double-accept race** - moved the atomic `.eq("status","pending")` claim
     of the trade to *before* the `kid_reward_log` inserts, not after (the side effect lives on a
     different table than the guarded row, so guarding last wasn't enough here, unlike
     `submit_photo_score`'s pattern).
  3. **`compare-points.yml` invalid YAML** - the `on:`/`jobs:` blocks were flattened onto single
     lines since creation; reformatted to real YAML block structure, matching `deploy-pages.yml`.
  4. **`apps/shared/config.js` missing `POINTS`** - added, matching the backend exactly;
     `compare-points.js` now passes.
  5. **`reading-tracker` never registered its own service worker** - added the
     `navigator.serviceWorker.register()` call every sibling app already has.
  6. **PIN-gated reward-tracker actions had no server-side enforcement** - the biggest single
     change. Added `families.pin_protection_enabled` (new migration), a `requireRecentPinIfEnabled`
     helper, wired into the three destructive actions; reworked the client to thread the verified
     PIN/icons proof through to each protected call and sync the protection toggle server-side
     instead of a per-device localStorage flag. See `D-2026-07-31-reward-tracker-pin-server-enforcement`.
  7. **`todayStr()` UTC bug** in reading-tracker - switched to local-date computation.
  8. **`copyKidLink` broken on installed PWA** - regex now matches `/index.html` paths too.
  9. **Badge-toast swallowed alongside a level-up** - celebrations now queue and stagger instead of
     the badge one being silently dropped.
  10. **`my-rewards` `loadState()`/`refreshTradeState()` no sequencing guard** - added, mirroring
      reward-tracker's existing fix for the same bug class.
  11. **bedroom-reset's item-definitions cache unscoped** - token-scoped via the existing
      `roomStorageKey()` helper (cache key bumped v1→v2).
  12. **Non-atomic points/streak updates** - the second-biggest change. Four new row-locked Postgres
      functions (`apply_kid_points_delta_atomic`, `apply_room_points_delta_atomic`,
      `award_bedroom_pass_atomic`, `award_room_pass_atomic`), mirroring `grant_spin_credit_atomic`'s
      existing pattern; `awardBedroomPass`/`awardRoomPass` and the two `update_*_item` handlers
      rewired to call them. See `D-2026-07-31-atomic-points-streak-updates`.
  13. **reading-tracker: saving zero goal days-of-week** silently reverted to "all 7" - blocked
      client-side with an error toast.
  14. **parent-dashboard's `editingSettings` guard missing `publicToggle`** - added.
  15. **my-rewards: change-secret-picture had no lockout check** - and, on investigation, the
      server (`set_kid_verify_image`) was *actually exploitable*: it unconditionally cleared the
      lockout as a side effect of picking a new secret. Fixed server-side (block the action while
      locked) and client-side (matching guard). See `D-2026-07-31-kid-trade-security-fixes`.
  16. **Unescaped color values** in reward-tracker/my-rewards templates - escaped for defense in
      depth (already backend-validated, so not currently exploitable, but consistent with every
      other field).
  17. **"++16 points" typo** in bedroom-reset's parent-check toast - fixed to "+16".
- Bumped `CACHE_NAME` in every app whose cached assets changed (bedroom-reset v25,
  parent-dashboard v8, reward-tracker v20, my-rewards v7, reading-tracker v5).
- Applied 2 Supabase migrations (`add_pin_protection_enabled_to_families`,
  `add_atomic_points_streak_functions`) and redeployed `family-api` (now version 39) with all
  backend changes.
- Smoke-tested the live deployment against a disposable test family (`ZZTEST_ReviewSmoke`): PIN
  enforcement (delete without PIN → rejected, with correct PIN → accepted, toggling protection off
  → correctly permissive), and the atomic checklist-points RPC (points awarded correctly, no
  errors). First few calls hit transient 502s right after deploy (propagation delay, confirmed by
  retrying successfully ~20s later - not a code issue). Cleaned up the test family and verified no
  orphaned rows via cascade.
- User noticed a follow-up while reviewing the summary: `reward-tracker/app.js` still had
  `kid.avatar_emoji` unescaped at ~10 more `innerHTML` sites (kid chips, active-kid banner,
  spin-kid picker, table headers, insights, history, big-reward headers, undo toast, avatar
  settings, Kid View) - same bug class as finding #16, spotted but out of scope at the time. Fixed
  all of them; bumped `reward-tracker` service worker to v21.
- User then asked to check the rest of the repo for the same pattern. Walked every `innerHTML` call
  site in all 6 apps by hand (not just grepping known field names) rather than re-running the
  agents. Found two more: `reading-tracker`'s kid picker had the same unescaped `avatar_emoji`, and
  `parent-dashboard`'s AI-score displays (`aiScoreLineHtml`, the AI history modal) rendered the
  vision model's `comment`/`rejection_reason` unescaped - a much lower-probability vector (would
  need the model itself prompt-injected into emitting markup) but fixed for consistency. Confirmed
  everything else already escapes correctly, uses `.textContent`, or is server-validated/hardcoded
  data (badge/level titles from `shared/config.js`, signed Storage URLs, browser-generated weekday
  labels). Bumped `reading-tracker` to v6, `parent-dashboard` to v9.

## Files touched

- `apps/leaderboard/app.js`, `apps/bedroom-reset/app.js`, `apps/parent-dashboard/app.js`,
  `apps/reward-tracker/app.js`, `apps/my-rewards/app.js`, `apps/reading-tracker/app.js` - all the
  frontend fixes above, plus the two follow-up escaping passes
- `apps/bedroom-reset/service-worker.js`, `apps/parent-dashboard/service-worker.js`,
  `apps/reward-tracker/service-worker.js`, `apps/my-rewards/service-worker.js`,
  `apps/reading-tracker/service-worker.js` - `CACHE_NAME` bumps (reward-tracker to v21,
  parent-dashboard to v9, reading-tracker to v6 after the follow-ups)
- `apps/shared/config.js` - added `POINTS`
- `.github/workflows/compare-points.yml` - fixed YAML
- `supabase/functions/family-api/index.ts` - all backend fixes above, redeployed
- Supabase migrations: `add_pin_protection_enabled_to_families`, `add_atomic_points_streak_functions`
- `CHANGELOG.md`, `DECISIONS.md`, 3 new decision records

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-07-31-reward-tracker-pin-server-enforcement.md`,
  `decisions/2026/D-2026-07-31-atomic-points-streak-updates.md`,
  `decisions/2026/D-2026-07-31-kid-trade-security-fixes.md`
