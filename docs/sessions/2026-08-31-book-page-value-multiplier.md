# 2026-08-31 — Per-book page value multiplier (reading tracker)

**Focus:** letting each book carry a multiplier so some books need more pages
read to be worth one normal page.

## Timeline

- User asked for a per-book multiplier on the reading tracker, and invited
  questions first. Read `apps/reading-tracker/app.js`, the `kid_reading_*`
  handlers in `supabase/functions/family-api/index.ts`, the live
  `credit_reading_spins_atomic` definition and the schema notes in
  `README.md` before asking, so the questions were about real forks rather
  than generic clarification.
- Three questions put to the user, all answered:
  1. **Format** — percentage (`50` = each page counts half) rather than a
     "pages per normal page" ratio or a difficulty band.
  2. **Scope** — weights the ahead/behind goal banner and the bonus-spin
     threshold; the book's own "page X of Y" progress stays real pages.
  3. **Retroactivity** — a change re-scores that book's whole history, with
     a confirmation dialog first.
- Applied two migrations: `add_page_value_percent_to_reading_books` (column,
  NOT NULL default 100, CHECK 1-1000, plus a column comment) and
  `weight_reading_spin_credit_by_page_value` (rewrote
  `credit_reading_spins_atomic` to weight each log entry by its book's
  percent, and documented in its header why an already-granted spin is
  never clawed back when a value is lowered).
- Edge function: added `parsePageValuePercent`, wired it into `start_book`
  and `edit_book`. `get_reading_state` needed no change — it already selects
  `*` from `kid_reading_books`. `deno check` passes.
- Client: page-value input on both the add-book row and the book editor;
  `pageValueFraction`/`countedPages`/`kidUsesPageValues` helpers;
  `computeAheadBehind` now sums counted pages and takes an optional override
  map (which is what lets the confirm dialog preview the change);
  log history renders `+40 → 20 counted`; the banner says "counted pages"
  only for a kid who actually has a weighted book.
- **Could not redeploy the edge function.** `mcp__Supabase__deploy_edge_function`
  needs the entire 2,700-line `index.ts` as literal tool input, and in this
  session Bash output above ~25KB is diverted to a file instead of returning
  into the session, so the file couldn't be read back whole to reproduce it.
  Stopped rather than risk a partial reconstruction overwriting a working
  production function. Logged as a `blocked` task on `TASK_BOARD_NOW.md`.
- Verified the shipped-and-live database half against a disposable test
  family (`ZZTEST_PageValue`, parent code `ZZPV-TEST`): 120 pages on a 50%
  book plus 30 on a 100% book = 150 raw but 90 counted, and the 100-page
  threshold correctly granted **0** spins where the old unweighted function
  would have granted 1; 60 more pages took the counted total to 150 and
  granted exactly 1; dropping the 50% book to 1% afterwards (weighted total
  91, below the 100 already credited) granted 0 and left `bonus_spins` at 1,
  confirming no clawback. Both CHECK bounds (0 and 1001) rejected. Test
  family deleted, cascade confirmed by a 0-row follow-up query.
- Unit-tested the client maths by extracting the pure helpers straight out of
  the shipped `app.js` via brace-matching (so the test runs against the real
  source, not a copy): 21 assertions covering per-book weighting, the raw-vs-
  counted difference, the override preview leaving state untouched, wording
  fallback for an all-normal kid, a book row missing the column entirely,
  fractional rounding, and every input-validation bound. All pass.
- Confirmed all 6 books in the live family sit at the default 100, so the
  change is behaviour-neutral for them until a value is deliberately set.
- Committed to `claude/book-reading-multipliers-y3l9vh` (not `main`) — the
  session's own branch instruction overrides this repo's usual
  commit-straight-to-`main` convention; flagged to the user.
- User then asked to merge. Fast-forwarded `main` (it hadn't moved since the
  branch point) and pushed; GitHub Pages deploy run #103 triggered. The
  front end was therefore live *ahead* of the edge function for a while,
  with the page value input showing in the real app and being silently
  ignored on save.
- **Resolved the deploy the same session, from the user's own machine.** The
  Supabase CLI wasn't installed on Windows, and `npm i -g supabase` is
  blocked by Supabase, so the working route was
  `npx supabase@latest login` then
  `npx supabase@latest functions deploy family-api --project-ref
  wumlrhswsyazbvmajhxg --no-verify-jwt`. The `--no-verify-jwt` flag matters:
  this repo has no `supabase/config.toml`, so without it the deploy would
  have switched JWT verification on and broken every app, since auth here is
  the function's own opaque token scheme, not Supabase Auth.
- **First redeploy shipped the wrong code, and the smoke test caught it.**
  The CLI uploads the local working tree, not `origin/main`, and the user's
  clone predated the merge — so v43 was the *old* function. Detected within a
  minute: `start_book` with `page_value_percent: 50` returned 100, and
  `edit_book` with 1001 returned `nothing_to_update` (an empty patch, i.e.
  the field wasn't recognised at all) rather than `bad_page_value_percent`.
  A `git pull` followed by the same deploy command produced v44, correct.
  Worth remembering: verifying a deploy by its *behaviour* rather than by the
  CLI's success message is what made this a two-minute detour instead of a
  silent no-op nobody noticed until a parent tried to set a page value.

## Files touched

- `supabase/functions/family-api/index.ts` — `parsePageValuePercent`,
  `start_book`/`edit_book`, reading-section header comment
- `apps/reading-tracker/app.js` — weighting helpers, `computeAheadBehind`,
  banner wording, book card, log history, add-book handler, confirm dialog
- `apps/reading-tracker/index.html` — page value input + hint
- `apps/reading-tracker/styles.css` — input widths, `.pageValueTag`,
  `white-space: pre-line` on the confirm modal so a two-part prompt reads
- `apps/reading-tracker/service-worker.js` — `CACHE_NAME` v6 → v7
- `README.md`, `CHANGELOG.md`, `DECISIONS.md`,
  `decisions/2026/D-2026-08-31-book-page-value-multiplier.md`,
  `docs/TASK_BOARD_NOW.md`

## Related

- `CHANGELOG.md` → 2026-08-31 entry
- `DECISIONS.md` → `D-2026-08-31-book-page-value-multiplier`

## Verification after the deploy (v44, live)

Against a disposable family (`ZZTEST_Deploy43`, parent code `ZZD4-TEST`),
through the real HTTPS endpoint rather than SQL:

- `start_book` with `page_value_percent: 50` → stored 50; with the field
  omitted → 100.
- `edit_book` 50 → 150 → `{"ok":true}`; 1001 and 0 both →
  `bad_page_value_percent` (not the empty-patch `nothing_to_update` the old
  build returned).
- `get_reading_state` returns `page_value_percent` on every book.
- End to end across both halves: with a 100-page spin threshold, logging to
  page 60 of a 150% book (90 counted) granted 0 spins, and the next log to
  page 80 (+20 real, 30 counted, 120 total) granted exactly 1 — where the
  raw total of 80 pages would have granted none.

Test family deleted afterwards; cascade confirmed, zero orphan log rows, and
all 6 real books still at the default 100.

## Follow-on: the nightly goal readout

- User raised a second, related problem: the pages-per-night goal was only
  visible as a form input in the Setup card, so logging a night's reading
  meant remembering it or scrolling — made worse by the page value work,
  since on a weighted book the goal no longer equals pages physically turned.
  Asked about a range.
- Checked the live data before asking anything, which changed the questions:
  Eira has 1 book and a 25/night goal, **Iya has 2 books** on a 15/night goal,
  and Indie has a book but no goal at all. So multi-book and no-goal both had
  to be handled, and a per-book target number couldn't be assumed meaningful.
- User chose a plain readout over a computed target page or a catch-up range,
  and chose to repeat it per book card. Logged as
  `D-2026-08-31-nightly-goal-readout`.
- Implemented as `nightlyGoalLabel(kidId)` rendered above each unfinished
  book's log row. Four cases resolved beyond the plain number, all lookups
  rather than arithmetic: no goal → nothing rendered; future start date →
  says when it begins; inside a reading holiday → says so; weekday outside
  the goal → says tonight isn't a goal night. A kid with any weighted book
  gets "counted pages", reusing `kidUsesPageValues` so the wording matches the
  ahead/behind banner.
- 12 assertions against helpers extracted from the shipped `app.js`, using the
  three real goal setups as fixtures — including that one kid's holiday
  doesn't leak into another's line, and that a holiday starting tomorrow
  doesn't apply tonight. The 21 page-value assertions were re-run for
  regressions. All pass. `CACHE_NAME` v7 → v8.
- Front-end only: no schema change, no edge function change, so **no Supabase
  redeploy needed** for this one.

## Follow-on 2: goal *history* — the readout was the wrong feature

- The goal readout above turned out to answer the wrong question. What was
  meant was **historical** targets: what the goal used to be, which the app
  had never recorded. Re-read the schema before designing anything this time.
- Investigating surfaced a second, unreported problem sitting behind the
  first. `kids.reading_daily_goal_pages` is a single mutable number, and
  `computeAheadBehind` multiplied it across *every* counted day since the
  start date. So changing a goal silently re-scored the past: raising Iya
  from 15 to 25 would have re-scored two weeks she genuinely met at 15,
  inventing a deficit of hundreds of pages. The visibility gap and the
  correctness bug had the same root cause and the same fix.
- User chose dated periods (forward-effective), each carrying pages *and*
  weekday set, fully editable so past goals can be back-filled. Logged as
  `D-2026-08-31-reading-goal-periods`, which also records why the per-save
  "forward or retroactive?" prompt used for page values was rejected here:
  a page value is a property of a book that was always true, so retroactive
  is a legitimate answer; a nightly goal is a decision made on a date, and
  offering "re-score the past" as an equal option every time would be
  offering a wrong answer forever.
- New table `kid_reading_goal_periods`, RLS on with zero policies per the
  project's security convention, unique on (kid_id, start_date). Migration
  seeded one period per kid from existing settings — Eira (25/night from
  29 Aug, Mon-Sat) and Iya (15/night from 17 Aug, every day) — so no figure
  moved at the moment of the switch.
- `set_reading_settings` now **rejects** `goal_pages`/`goal_start_date`/
  `goal_days_of_week` with `goal_moved_to_periods` rather than ignoring them,
  so a stale client fails loudly instead of appearing to save. The
  `kids.reading_goal_*` columns became a mirror of the period in force today,
  with `syncKidGoalMirror` as their single writer — that single-writer rule is
  what stops the mirror drifting, and is why rejecting rather than accepting
  matters.
- Setup card restructured: the goal fields left the Save form entirely and
  became a dated list with add/edit/delete, modelled on the existing reading
  holidays list. The add form defaults its date to today, so "change the goal
  from now on" is the easy path and back-filling is the deliberate one — the
  opposite default would make silently rewriting history the easy mistake.
- Guarded `loadState` with `state = { goal_periods: [], ...res.data }`.
  GitHub Pages and the edge function deploy separately, so there is always a
  window where the browser has the new client and the old function; without
  the default, `kidGoalPeriods` would throw on every render. With it, the app
  degrades to "no goal set" and books stay fully loggable.
- 33 assertions against helpers extracted from the shipped `app.js`, replacing
  the two earlier suites. The load-bearing one: 8 days at 10/night plus 3 at
  30/night expects 170, where a single flat 30/night period expects 330 — the
  exact deficit the old model invented. Plus period boundaries, future-dated
  periods, per-period weekday sets, holidays spanning a period change, page
  values still weighting the actuals, and tonight's readout following the
  timeline rather than the newest row. All pass.

## Verification after the goal-period deploy (v45, live)

Against a disposable family (`ZZTEST_GoalPeriods`, parent code `ZZGP-TEST`),
through the real HTTPS endpoint:

- `set_reading_settings` with `goal_pages` → `goal_moved_to_periods` (rejected,
  not silently ignored); with `spin_threshold_pages` alone → still saves.
- Add two periods (15/night every day, then 25/night weekdays only); all-seven
  days stored as null per the existing convention. `get_reading_state` returns
  the timeline in order.
- Rejections all correct: duplicate start date → `period_already_starts_that_day`,
  bad date → `bad_start_date`, zero pages → `bad_goal`, weekday `9` →
  `bad_days_of_week`, another family's period id → `not_found`, unknown action →
  `unknown_period_action`.
- Update 25 → 40 works; updating onto an occupied start date is rejected.
- **Mirror behaviour**, the part most likely to rot: with two periods the
  kid row showed 25 pages and weekday set from the *current* period but the
  start date from the *earliest* — as designed. Deleting the newer period
  reverted it to 15. Moving the only period into the future cleared
  `reading_daily_goal_pages` to null while keeping the future start date.
  Deleting the last period cleared everything.
- Test family deleted; zero orphan period rows, both real kids' periods intact
  and their mirrors matching.

A schema wrinkle surfaced during that last check: the new `days_of_week` was
`integer[]` while `kids.reading_goal_days_of_week` is `smallint[]`, so the two
couldn't be compared without a cast even though one mirrors the other.
Harmless at runtime, but a trap for exactly the verification query that found
it — narrowed to `smallint[]` in a follow-up migration.

## Carried forward

- **`family-api` needs another redeploy** for the goal-period endpoints
  (`manage_reading_goal_periods`, and `goal_periods` in `get_reading_state`).
  Same command as before, from an up-to-date clone:
  `npx supabase@latest functions deploy family-api --project-ref
  wumlrhswsyazbvmajhxg --no-verify-jwt`. **Done** — deployed as v45 and
  verified above. Nothing outstanding.
