# 2026-07-30 — Reading tracker: new app, schema, and a page-based bonus spin

**Focus:** Discussed reorganizing `parent-dashboard` (too admin-heavy, not
enough at-a-glance dashboard), then built a new `apps/reading-tracker` app
per-kid book/page tracking, nightly goals, and a bonus-spin trigger.

## Timeline

- User asked how to track kids' reading progress; discussed folding it into
  an existing app vs a new one. Recommended a new app, matching the
  bedroom-reset/reward-tracker/my-rewards pattern of one concern per app.
- User asked what's currently in `parent-dashboard` - walked through its
  sections (settings, add kid, bedroom checklist admin, add room, kid/room
  progress cards).
- User flagged it reads more like an admin/setup page than a dashboard, and
  asked about reorganizing it plus adding real at-a-glance tiles (room
  score, rewards earned, reading status).
- Since reading status didn't exist yet, asked the user how to sequence
  this - they chose to build a minimal reading tracker first, then come
  back to the dashboard reorg (logged as a `TASK_BOARD_NEXT.md` item, not
  done this session).
- Mid-build, the user refined the reading tracker spec: track book + current
  page, a per-kid nightly pages goal, log pages read by date/kid, a log of
  finished books, and (added again mid-turn) a per-kid customizable
  "bonus spin every N cumulative pages" trigger into Reward Tracker's
  existing spin mechanic.
- Designed and applied the schema via Supabase migrations: `kids` gained
  `reading_daily_goal_pages`, `reading_spin_threshold_pages`,
  `reading_pages_credited_for_spin`; new tables `kid_reading_books` and
  `kid_reading_log`; new Postgres function `credit_reading_spins_atomic`
  (parallel to the existing `grant_spin_credit_atomic`).
- Added 8 new `family-api` actions (`get_reading_state`,
  `set_reading_settings`, `start_book`, `finish_book`, `reopen_book`,
  `delete_book`, `log_reading_pages`, `undo_reading_log`) and deployed the
  function.
- Smoke-tested the API directly via curl against a disposable test family:
  redeem code, add kid, set settings, start a book, log pages twice
  (verified the pages-read delta and the spin-threshold crossing granted
  exactly 1 bonus spin), finish/reopen/delete, then cleaned up.
- Built the full `apps/reading-tracker` PWA (gate, kid picker, settings
  card, currently-reading book cards with inline page logging, finished
  books list) plus its own generated icon set, manifest, and service
  worker.
- Tested the built UI end-to-end in headless Chromium (Playwright) against
  a second disposable test family, routing the browser's Supabase calls
  through a Node-side relay since this sandbox's outbound HTTPS only works
  through its configured agent proxy, which the browser process can't reach
  directly. Confirmed login, settings save, book creation, page logging
  (with the bonus-spin toast), finish/reopen/delete all work; a couple of
  fixed-timeout checks in the test harness itself raced ahead of the network
  round trip, not real app bugs (confirmed by re-checking state via direct
  API calls afterward). Cleaned up both disposable test families.
- Opened and merged PR #2 for the above (user asked for both).
- User then asked for a substantial follow-up on the same app: editing a
  book's name/pages, viewing and editing the page-log entries, moving
  "Currently reading" above the Setup section, an at-a-glance
  ahead/behind-schedule banner just below the header, and Setup gaining a
  goal start date, which weekdays count toward it, and a reading-holidays
  list.
- Added `kids.reading_goal_start_date`/`reading_goal_days_of_week`, new
  table `kid_reading_holidays`, and family-api actions `edit_book`,
  `edit_reading_log`, `add_reading_holiday`, `delete_reading_holiday`;
  extended `set_reading_settings` and `get_reading_state` accordingly.
  Deployed the updated function.
- Rebuilt the reading-tracker UI: reordered sections, added the
  ahead/behind banner (computed client-side from the log plus goal
  settings/holidays), day-of-week checkboxes and a holidays list/add form
  in Setup, and per-book inline edit + an expandable page-log history with
  its own inline edit/delete per entry.
- Re-verified end-to-end via Playwright against fresh disposable test
  families. Caught and fixed two real bugs this way: (1) a `String()` vs
  bare `===` comparison bug where `editingLogId` (a DOM dataset string)
  never matched a log entry's `id` (a Postgres bigint/JS number), so the
  log-edit form silently never opened; (2) `kid_reading_books`/
  `kid_reading_log`/`kid_reading_holidays`'s `family_id`/`kid_id` foreign
  keys were missing `on delete cascade` (present on every other family/kid
  table), discovered when deleting a disposable test family failed with a
  foreign-key violation - fixed via migration, logged as
  `D-2026-07-30-reading-tracker-fk-cascade-fix`. Cleaned up all test
  families afterward.
- Since PR #2 was already merged before this follow-up started, restarted
  the branch from the latest `main` (`git checkout -B <branch> origin/main`)
  before committing the follow-up work, per this session's branch-per-PR
  workflow - confirmed the merge commit's tree was identical to the
  pre-merge commit's (a clean fast-forward-shaped merge), so the working
  tree's uncommitted edits carried over safely.

## Files touched

- `apps/reading-tracker/` - `index.html`, `app.js`, `styles.css` (reordered
  sections, book/log editing, ahead/behind banner, goal schedule +
  holidays UI), `manifest.json`, `service-worker.js` (CACHE_NAME bumped to
  v2), `icons/icon-192.png`, `icons/icon-512.png`
- `supabase/functions/family-api/index.ts` - reading tracker actions +
  `creditReadingSpins` helper, then `edit_book`/`edit_reading_log`/
  `add_reading_holiday`/`delete_reading_holiday` and extended
  `get_reading_state`/`set_reading_settings`
- Supabase migrations: `create_reading_tracker_schema`,
  `add_reading_bonus_spin_trigger` (an earlier, simpler
  `family_reading_log`-based design was applied then dropped once the
  real spec - books/pages/goals/spins - came in mid-session),
  `reading_tracker_goal_schedule_and_holidays`,
  `fix_reading_tracker_fk_cascade`
- `README.md` - new app entry, new tables, `kids` column additions (both rounds)
- `CHANGELOG.md`, `DECISIONS.md`, `docs/TASK_BOARD_NEXT.md`

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-07-30-reading-tracker-new-app.md`
- `DECISIONS.md` → `decisions/2026/D-2026-07-30-reading-tracker-fk-cascade-fix.md`

## Carried forward

- `TASK_BOARD_NEXT.md`: "Reorganize parent-dashboard into Setup vs
  Dashboard, add at-a-glance summary tiles" - the reorg itself is still
  open; reading status can now feed a real tile since `get_reading_state`
  exists.
- `TASK_BOARD_NEXT.md`: "Tag AI photo-score submissions as full-room vs
  section" - logged at the user's request (a separate, unrelated ask
  during this session); not implemented, just captured with design notes.
- No kid-facing reading view (mirroring `my-rewards`) was requested or
  built - only the parent-facing logging app.
