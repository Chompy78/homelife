# 2026-08-01 — Push the cross-project lesson, fix the Perth timezone bug

**Focus:** Two follow-ups carried over from closing out the 2026-07-31 full-repo review session:
actually push the drafted cross-project lesson (not just draft it), and actually fix the UTC/timezone
day-boundary bug found during that close-out (using Australia/Perth, the family's real timezone),
rather than just logging it as a future task.

## Timeline

- User asked to do both follow-ups for real: push the lesson, and fix the timezone bug end to end
  ("set to perth" - the family is Perth-based, not Sydney as the code had assumed).
- **A1:** Cloned `chompy78/ai-lessons-learned`, read `INDEX.md`, and pushed
  `inbox/2026-08-01-grep-the-mechanism-not-field-names.md` (commit `d973aae` to that repo's `main`) -
  the lesson distilled from the 2026-07-31 review's own experience: sweeping for a recurring bug
  pattern by grepping known field names misses instances the search never thought to include.
- **A2:** Found the day-boundary logic in `family-api` used UTC everywhere a "today" date was needed
  (3 column DEFAULTs, `todayStr()`, and the 4 atomic points/streak functions added the day before),
  and the column DEFAULTs were even hardcoded to `Australia/Sydney` - the wrong city. Applied
  migration `fix_day_boundary_timezone_to_perth` (3 column defaults + 4 RPC functions' `v_today`, all
  switched to `Australia/Perth`), rewrote `todayStr()` in `family-api/index.ts` to use
  `Intl.DateTimeFormat` with `timeZone: "Australia/Perth"` instead of a fixed UTC computation, and
  redeployed (now version 40).
- Verified the redeploy by re-fetching the live source via `get_edge_function` and diffing against
  the local file - byte-identical, same safety-net method used throughout the 2026-07-31 review's own
  redeploys.
- Live-smoke-tested against a disposable test family (`ZZTEST_PerthTZ`): confirmed the 4 atomic
  functions' live Postgres source and the 3 column defaults both now read `Australia/Perth`, then
  exercised `start_book`, `log_reading_pages`, and `update_checklist_item` with no date supplied -
  all returned the correct current Perth-local date with no errors. Cleaned up the test family;
  cascade delete left no orphaned rows.
- Deliberately did not rewrite already-stored historical date values under the old (UTC/Sydney)
  assumption - only the go-forward computation logic. Documented as a scope decision in
  `D-2026-08-01-day-boundary-timezone-perth`; flagged to the user in case historical correction is
  actually wanted as a separate follow-up.
- Also carried forward and committed the `docs/sessions/2026-07-31-full-repo-code-review-and-fixes.md`
  edit from the prior session's close-out, which had been left uncommitted after a permission denial
  on a direct `git commit` attempt during that session.

## Files touched

- `supabase/functions/family-api/index.ts` - `todayStr()` rewritten for Perth, redeployed (v40)
- Supabase migration: `fix_day_boundary_timezone_to_perth`
- `CHANGELOG.md`, `DECISIONS.md`, `decisions/2026/D-2026-08-01-day-boundary-timezone-perth.md`
- `docs/sessions/2026-07-31-full-repo-code-review-and-fixes.md` - carried-forward commit from the
  prior session's close-out
- `chompy78/ai-lessons-learned` (separate repo) -
  `inbox/2026-08-01-grep-the-mechanism-not-field-names.md`

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-01-day-boundary-timezone-perth.md`

## Carried forward

- Historical stored date values computed before this fix (under UTC or `Australia/Sydney`) were not
  retroactively corrected - see the decision record's Why. Revisit only if the user explicitly wants
  that data corrected too.
