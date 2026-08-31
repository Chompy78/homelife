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

## Carried forward

- **The `family-api` redeploy** (task on `TASK_BOARD_NOW.md`). Until it
  lands, the page-value input reaches the backend and is ignored. The two
  migrations are already live and backwards-compatible, so the order of
  operations doesn't matter — redeploy and merge in either order.
- The branch is unmerged, so nothing is on GitHub Pages yet either.
