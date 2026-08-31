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

## Carried forward

- Nothing outstanding. The feature is complete: migrations applied, front end
  live on Pages, `family-api` at v44.
