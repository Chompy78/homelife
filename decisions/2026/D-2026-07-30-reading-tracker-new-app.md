# D-2026-07-30-reading-tracker-new-app

Date: 2026-07-30
Status: Done

**Context:** The parent wanted to track what each kid is reading: current book and page, a per-kid
nightly pages goal (different per kid), logging pages read for a given date and kid, a log of finished
books, and a bonus reward-tracker spin triggered once a kid crosses a customizable (per-kid) cumulative
pages threshold. This came up while discussing reorganizing `parent-dashboard` into clearer
setup-vs-dashboard sections - the question was whether reading tracking belonged inside that
reorganization or was its own thing.

**Options considered:**
1. Add reading fields/UI directly into `parent-dashboard`, alongside its existing settings and
   bedroom-checklist admin sections.
2. Build reading tracking as its own new app (`apps/reading-tracker`), following the same pattern as
   `reward-tracker`/`my-rewards`/`bedroom-reset` - each scoped to one concern, with its own admin UI
   colocated with its own daily-use UI.
3. Build a generic, pluggable "admin + dashboard" framework now, so reading (and any future tracker)
   automatically gets consistent admin/dashboard slots inside `parent-dashboard`.

**Decision:** Option 2. New app `apps/reading-tracker`, with its own gate (parent code), kid picker,
settings (nightly goal + bonus-spin threshold), current-books log-pages flow, and finished-books list.
Backend: new `kid_reading_books` (one row per book, `reading`/`finished` status) and `kid_reading_log`
(one row per "page reached" entry, `pages_read` computed server-side as the delta from the prior entry)
tables, plus three new `kids` columns (`reading_daily_goal_pages`, `reading_spin_threshold_pages`,
`reading_pages_credited_for_spin`). The bonus-spin trigger reuses the existing `bonus_spins` column and
atomic-increment pattern (a new `credit_reading_spins_atomic` Postgres function, parallel to
`grant_spin_credit_atomic`) rather than inventing a separate reward mechanism - crossing the threshold
increments the same counter Reward Tracker's wheel already consumes.

**Why:** `reward-tracker` already demonstrated that a feature's own admin (its reward categories, notes,
spin reasons) lives inside that feature's own app, colocated with where it's used daily, rather than
being centralized into `parent-dashboard` - `parent-dashboard`'s admin sections are for things that are
genuinely cross-cutting (family settings, adding a kid) or specifically about the bedroom-reset checklist
it already owns. Reading tracking is a new, independent concern with no natural home in either of those,
so Option 1 would have bolted an unrelated data model onto an app already flagged (in the same
conversation) as overloaded with disconnected admin sections - making that problem worse, not better.
Option 3 designs a generalized plugin architecture for a need inferred from a single example (this is the
first tracker built after bedroom-reset/rewards, not evidence of a pattern needing generalization yet) -
speculative architecture the project's own conventions explicitly warn against ("don't design for
hypothetical future requirements"). If a third or fourth tracker later shows the same shape repeating,
that's the point to revisit whether a shared framework earns its cost - not before.

The bonus-spin trigger deliberately reuses `bonus_spins`/the atomic-increment pattern instead of a new
reward currency: `bonus_spins` is already a cross-app mechanic (Bedroom Reset's AI auto-approve grants
one via `trigger_key`-linked `family_spin_reasons`), so reading tracking becomes a third caller of the
same well-tested mechanism rather than a fourth incompatible reward system. It doesn't reuse
`family_spin_reasons` itself, though: that table caps a reason to once per calendar period
(daily/weekly/monthly), which doesn't fit "every N cumulative pages, repeatable, no period cap, threshold
customizable per kid" - forcing it into the period-capped shape would have meant either lying about what
the period represents or bolting a second unrelated meaning onto that column.

**Status:** Done.
