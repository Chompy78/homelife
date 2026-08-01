# D-2026-08-01-day-boundary-timezone-perth

Date: 2026-08-01
Status: Done

**Context:** While closing out the 2026-07-31 full-repo review session, a follow-up check found that
every server-side "what date is it today" computation in `family-api` used UTC, not the family's
actual timezone (Australia/Perth, UTC+8, no daylight saving). This affected three column DEFAULTs
(`family_room_log.log_date`, `kid_reading_books.started_date`, `kid_progress_log.log_date`) and the
`todayStr()` helper used by reading-tracker's date fields (`start_book`/`finish_book`/
`log_reading_pages`), plus the day-boundary logic (`v_today`) inside all four atomic Postgres
functions added the day before (`apply_kid_points_delta_atomic`, `apply_room_points_delta_atomic`,
`award_bedroom_pass_atomic`, `award_room_pass_atomic`). Worse, the three column defaults were already
hardcoded to `'Australia/Sydney'` - the wrong city for this family, not just the wrong scheme (UTC vs.
local). Perth is 2-3 hours behind Sydney depending on daylight saving, so a family action taken late
at night could already be misattributed to the wrong calendar day even before considering the UTC
bug in the newer code paths.

**Options:**
1. Leave it as a known issue on the task board for a future session.
2. Fix only the go-forward computation logic (column defaults + `todayStr()` + the four atomic
   functions' `v_today`), leaving already-stored historical date values as they were computed.
3. Fix the go-forward logic *and* retroactively rewrite historical stored date values (e.g.
   `kid_streaks.last_pass_date`, existing `kid_progress_log.log_date` rows) to what they "would have
   been" under Perth time.

**Decision:** Option 2 - fixed all go-forward date computation to use `Australia/Perth`, left
historical stored data untouched.

**Why:** The user's instruction was to set "the default and all current ones" to Perth - read as
fixing the logic that produces dates going forward, not as a mandate to also rewrite history. Option
1 was rejected because the user asked for this to actually be fixed now, not deferred again. Option 3
was rejected as a scope decision made without being asked: rewriting historical rows requires
assuming what a stored UTC/Sydney-computed date "should have been" in Perth time, which isn't a pure
derivation for any row created before this session's date/atomic-function changes (award/bonus logic
has since changed shape) - it's a materially riskier and harder-to-reverse operation than what was
asked for, for a small number of legacy rows (this repo is early enough that historical volume is
low). Applying it without explicit confirmation risked silently corrupting real family data over a
concern (misattributed historical stats) far less severe than getting current day-boundary logic
right. Flagged to the user as a follow-up choice rather than assumed.

Changes made:
- Migration `fix_day_boundary_timezone_to_perth`: altered the 3 column DEFAULT expressions from
  `'Australia/Sydney'` to `'Australia/Perth'`, and `CREATE OR REPLACE`'d all 4 atomic functions'
  `v_today` computation from `(now() at time zone 'UTC')::date` to
  `(now() at time zone 'Australia/Perth')::date` (function bodies otherwise unchanged).
- `supabase/functions/family-api/index.ts`'s `todayStr()` rewritten to use
  `Intl.DateTimeFormat` with `timeZone: "Australia/Perth"` and `formatToParts()`, rather than
  `new Date().toISOString().slice(0, 10)` (always UTC). Built via `Intl.DateTimeFormat` rather than a
  fixed UTC+8 offset so it stays correct if Perth's offset ever changes (it doesn't observe daylight
  saving today, but that's a fact about the current rule, not something to hardcode).
- Redeployed `family-api` (now version 40); verified the deployed source is byte-identical to the
  local file via `get_edge_function` + diff (the safety-net methodology established during the
  2026-07-31 review's own redeploys).
- Live smoke-tested against a disposable test family (`ZZTEST_PerthTZ`): confirmed the 4 atomic
  functions' live Postgres source now reads `Australia/Perth`, confirmed the 3 column defaults now
  read `Australia/Perth` via `information_schema.columns`, and exercised `start_book`,
  `log_reading_pages`, and `update_checklist_item` end-to-end with no `started_date`/`log_date`
  supplied - all returned the correct current Perth-local date with no errors. Cleaned up the test
  family and verified no orphaned rows via cascade.

**Status:** Done. Historical stored date values from before this fix were deliberately left
unmodified - see Why above. If the user later wants those corrected too, that's a separate, explicit
follow-up, not assumed here.

## Follow-up: historical correction (2026-08-01, same day)

The user explicitly asked to correct the historical data too, closing the option left open above.

**Audit method:** every `date`-typed column in the schema with a `now()`-derived DEFAULT was
identified via `information_schema.columns` (confirmed exactly 3: `family_room_log.log_date`,
`kid_reading_books.started_date`, `kid_progress_log.log_date` - no others exist). For each, every row
across all 6 real families (test families excluded by name prefix) was compared against the Perth-local
date of that row's own `created_at` (a `timestamptz`, unaffected by the app-logic bug - it's always the
real UTC instant). A row was only a correction candidate if its stored date was auto-defaulted, not
user-entered - `kid_reading_books.started_date`/`kid_reading_log.log_date` can be explicitly supplied by
a parent, so those were additionally checked against the *old buggy default's* output (UTC-date-of-
`created_at`, the value the bug would actually have produced) before touching anything, to avoid
overwriting a parent's intentionally-backfilled date that merely happens to differ from Perth-today.

`kid_streaks.last_pass_date`/`last_bonus_date` and `family_room_progress`'s equivalents don't have
their own `created_at` (single row per kid/room, updated in place), so were checked by confirming they
already matched the corresponding (corrected) progress-log event's Perth date - i.e. derived from the
same real-world instant, not independently recomputed.

**Findings:**
- `kid_reading_books`, `kid_reading_log`: zero defaulted-and-wrong rows. The few rows that differ from
  today's Perth-date logic are legitimate parent-entered historical dates (backfilled log entries) -
  left untouched, correcting them would have overwritten real data with a wrong guess.
- `kid_streaks`, `family_room_progress`: every stored `last_pass_date`/`last_bonus_date` across all 6
  real families was already correct - by coincidence, every actual pass/bonus event in production
  history happened at a UTC instant where the UTC calendar date and the Perth calendar date were the
  same (none landed in the UTC 16:00-23:59 window where Perth is already the next day). Nothing to
  correct.
- `kid_progress_log`, `family_room_log`: exactly 2 rows total needed correction, both the *same*
  real-world event for The Gallaghers (`kid_progress_log` id 15, `family_room_log` id 4) - a
  `parent_pass` logged at `2026-07-13 15:39:00 UTC`. Under the old `Australia/Sydney` column default
  that was in effect at the time, `15:39 UTC + 10h (AEST) = 01:39 on 2026-07-14 Sydney` → wrongly
  stored as `2026-07-14`. Correct Perth date: `15:39 UTC + 8h = 23:39 on 2026-07-13` → `2026-07-13`.

**Correction applied:** migration `correct_historical_sydney_default_dates_to_perth` - two `UPDATE`
statements, each scoped by exact row `id` *and* the expected old value (`log_date = '2026-07-14'`) so
it's a safe no-op if re-run. Verified post-migration: both rows now read `2026-07-13`, and a repeat of
the full mismatch-detection query across both tables returns zero remaining mismatches for all 6 real
families.

No `kid_streaks`/`family_room_progress` row needed a corresponding change (see Findings above), so
`current_streak`/`best_streak` were never at risk of being thrown out of sync by this correction.
