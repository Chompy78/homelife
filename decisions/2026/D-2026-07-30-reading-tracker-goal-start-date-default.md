# D-2026-07-30-reading-tracker-goal-start-date-default

Date: 2026-07-30
Status: Done

**Context:** The user reported that after setting up reading goals, the ahead/behind-schedule banner
still wasn't showing for any kid. Checking the live production data (`kids` table) showed one kid had
`reading_daily_goal_pages` and `reading_spin_threshold_pages` saved, but `reading_goal_start_date` was
still null. `computeAheadBehind()` (`apps/reading-tracker/app.js`) requires both a goal and a start date
before it returns anything, so the banner was silently hidden with no error or hint as to why - the
"Goal start date" input had no default value, unlike every other date input in the app (the log-date
input, the holiday-range inputs), so a parent filling in just "Pages per night goal" and clicking Save
had no reason to think a second field also needed attention.

**Options considered:**
1. Leave the field blank by default; document that a start date must be set explicitly for the banner
   to activate.
2. Default the displayed value to today (mirroring the log-date input's convention) whenever a kid has
   no saved start date, so the field is always populated with a sensible value ready to confirm.
3. Make `reading_daily_goal_pages` and `reading_goal_start_date` a single combined "on/off" toggle in
   the UI, removing the separate date field entirely and always using today as an implicit start.

**Decision:** Option 2 - `renderSettings()` now sets `goalStartDateInput.value = kid.reading_goal_start_date
|| todayStr()`. Saving without touching the date field persists today's date, immediately activating the
ahead/behind comparison from that point forward.

**Why:** Option 1 is what shipped originally and is exactly what caused the bug report - a field that's
easy to skip with no visible consequence until a parent notices something's missing, and no way to tell
why. Option 3 removes real flexibility (a parent might genuinely want a goal to start counting from an
earlier or later date than today, e.g. backfilling from when the habit actually started, or delaying
until after a holiday) for a problem that a sensible default already solves without losing that option -
the field stays editable, it's just no longer blank by default. This also matches the app's own existing
convention: `logDateInput` (page-log entries) and the big-rewards date fields elsewhere in this codebase
already default to today rather than empty.

**Status:** Done - verified via Playwright: a fresh kid with only "pages per night" set (start date
untouched) now saves a real start date and shows the banner immediately after reload.
