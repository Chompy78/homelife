# D-2026-08-31-reading-goal-periods

Date: 2026-08-31
Status: Done

**Context:** A kid's nightly reading goal lived in three single-valued columns
on `kids` (`reading_daily_goal_pages`, `reading_goal_start_date`,
`reading_goal_days_of_week`), overwritten in place by `set_reading_settings`.
Two consequences, only the first of which was reported:

1. Past targets were invisible — a parent had to remember what a goal used to
   be, because nothing recorded it.
2. Worse, and unreported: changing a goal silently re-scored the past.
   `computeAheadBehind` multiplied the *current* goal across every counted day
   since the start date, so raising Iya from 15 to 25 would have re-scored two
   weeks she genuinely met at 15, manufacturing a deficit of hundreds of pages
   out of nothing.

**Options:**

1. Record goal changes for display only — show the history in Setup, keep
   scoring everything at the current goal.
2. Dated goal periods: each row is "from this date, N pages a night on these
   weekdays", running until the next begins. Ahead/behind scores each day at
   the goal in force that day.
3. Same as 2, but ask on every save whether the change is forward-dated or
   should replace the whole period.

Two sub-decisions: whether a period versions just the pages number or the
weekday set too, and whether periods are editable/back-fillable or accrue
read-only from now on.

**Decision:** Option 2. New table `kid_reading_goal_periods` (family_id,
kid_id, start_date, daily_goal_pages, days_of_week, unique on
(kid_id, start_date)), RLS on with zero policies like every other family
table. A period carries **both** the pages number and the weekday set, so
"25 a night, weekdays only, from 1 September" is one coherent record rather
than a number versioned against a weekday set that isn't. Periods are fully
editable — add, edit, delete — so a parent can back-fill goals from before
the app tracked them, which is exactly what "I have to remember" asked for.

`set_reading_settings` no longer accepts `goal_pages` / `goal_start_date` /
`goal_days_of_week` at all: it returns `goal_moved_to_periods` rather than
ignoring them, so a stale client fails loudly instead of appearing to save.
The `kids.reading_goal_*` columns are kept as a mirror of the period in force
today, maintained by `syncKidGoalMirror` as the single writer.

A migration seeded one period per kid from their existing settings, so the
ahead/behind figures were unchanged at the moment of the switch.

**Why:** Option 1 gives the visibility that was asked for and leaves the bug
that wasn't — the banner would still lie after any change, which is the part
that actually costs a parent trust in the number. Since the storage work is
identical either way (you need dated rows to display dated rows), scoring
against them too is nearly free.

Option 3's per-save prompt was tempting, given the page value multiplier uses
exactly that pattern. It was rejected because the two cases aren't
symmetrical: a page value is a property of a book that was always true, so
"apply to history" is a legitimate answer. A nightly goal is a decision made
on a date, and re-scoring the past at a new rate is essentially never what
someone means — a prompt would offer a wrong answer as an equal option, every
time, forever. Forward-dating is the right default, and the editable list
covers the rare genuine correction without a recurring dialog.

Versioning the weekday set alongside the pages number costs one column and
avoids an incoherent state: a parent who switches to "weekdays only" would
otherwise retroactively unscore every past weekend under the old goal too.

Keeping the mirror columns rather than dropping them avoids a destructive
schema change and keeps anything that still reads them seeing a sane current
value. Single-writer discipline is what stops it drifting — the reason
`set_reading_settings` rejects the goal fields instead of quietly accepting
them.

**Status:** Done.
