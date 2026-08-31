# Homelife

Family apps, deployed as static sites on GitHub Pages. Multiple families can
use the same deployment - each family is isolated by a parent code and per-kid
codes, and can optionally share their stats on a public leaderboard.

## Apps

- [`apps/bedroom-reset`](apps/bedroom-reset) - kids' bedroom checklist PWA. A kid enters their code once (a parent gives it to them), then the tablet remembers them. PIN-gated Parent Check, streaks, points/levels/badges. A room switcher at the top also gives access to the family's shared rooms (kitchen, etc.) - any kid can open and help finish one.
- [`apps/parent-dashboard`](apps/parent-dashboard) - a parent enters their family's parent code once, then can see every kid's progress, manage kids (add/rename/remove, get their codes), add/remove shared rooms and edit their checklist items, change the family's confirmation PIN, and opt in to the public leaderboard.
- [`apps/leaderboard`](apps/leaderboard) - public, no code needed. Shows aggregate stats (total points, best streak, rooms passed) for families that have opted in. Never shows individual kids' names or checklist details, even for opted-in families.
- [`apps/reward-tracker`](apps/reward-tracker) - a parent enters their family's parent code (same one as the parent dashboard) and taps a reward category to earn or spend for any of their kids. Quick Tap, Table and History+Undo views, plus a Big Rewards tab for occasional ad-hoc rewards with their own reason/spend record. A separate currency from the bedroom-reset points/streaks system - not merged into it or the leaderboard.
- [`apps/my-rewards`](apps/my-rewards) - kid-facing: a kid enters their own kid code (same one as bedroom-reset) and sees their own reward balance, on their own device. Mostly read-only, except trading with a sibling (give some of one reward for some of theirs) - accepting is gated by a 4x4 picture-grid pick instead of a PIN.
- [`apps/reading-tracker`](apps/reading-tracker) - a parent enters their family's parent code (same one as the other parent-facing apps) and tracks each kid's reading: start a book (title, optional total pages, both editable later), log the page they're up to for a given date (pages read that entry is computed automatically as the delta from the last log, and is itself viewable/editable/deletable in a per-book history), mark books finished. Setup covers a per-kid nightly pages goal kept as a dated history (each entry is "from this date, N pages a night, on these weekdays" - changing the goal adds an entry rather than rewriting the past, and entries can be back-filled or corrected), reading holidays (date ranges excluded from the goal), and a per-kid "bonus spin every N cumulative pages" threshold - crossing it grants a Reward Tracker bonus spin automatically (same `bonus_spins` mechanic Bedroom Reset's AI auto-approve already uses). Each book also carries a page value % - how much one of its pages counts against a normal page (100 = normal, 50 = two of its pages count as one, 150 = each counts for one and a half) - which weights the goal and the spin threshold but never the book's own page-count progress. An at-a-glance banner shows whether a kid is ahead or behind their goal as of today, computed client-side from the log, goal settings, holidays and each book's page value.

## Shared

- [`apps/shared/config.js`](apps/shared/config.js) - the family-api URL and the levels/badges rules. No family or kid identity, checklist items, or point values live here anymore - those come from the backend so every family can customize them.
- [`apps/shared/api.js`](apps/shared/api.js) - a small `callApi(action, payload)` helper every app uses to talk to the backend, with a hard timeout so a bad connection fails fast instead of hanging.

## Backend

Data lives in a dedicated Supabase project ("homelife", `ap-southeast-2`).
Every family-data table (`families`, `kids`, `kid_checklist_state`,
`kid_streaks`, `kid_progress_log`, `sessions`, `kid_reference_photos`,
`family_reward_categories`, `family_reward_notes`, `kid_reward_log`,
`kid_reward_trades`, `kid_big_rewards`, `kid_reading_books`,
`kid_reading_log`, `kid_reading_holidays`) has
Row Level Security enabled with **zero policies** - meaning nothing is
reachable through the public API key at all, from any family. Reference
photos live in a private Storage bucket (`reference-photos`) with the same
"nobody but the edge function touches this" posture - every photo is served
through a short-lived signed URL, never a public link. The only thing that
can read or write any of this is the `family-api` Supabase Edge Function
([`supabase/functions/family-api`](supabase/functions/family-api)), which
uses the service role key (server-side only) and enforces per-family and
per-kid scoping in code, based on an opaque session token issued when a
parent code or kid code is redeemed.

This is what makes it safe for unrelated families to share the same
deployment: there's no shared secret whose leak would expose everyone, and no
RLS policy to get subtly wrong. Points, streaks and PIN checks are also
computed server-side now (not just displayed client-side), so a kid can't
open dev tools and fake their own progress - which matters once a leaderboard
is comparing families against each other.

Tables:

- `families` - name, public display name, parent_code, parent_pin, icon, is_public (leaderboard opt-in), ai_score_mode (`off`/`informational`/`nudge`/`auto_approve`), ai_score_auto_threshold (1-10)
- `kids` - name, avatar, kid_code, theme_color (identity colour used by the reward tracker; randomly assigned when added, customizable), belongs to a family. Also carries the reading tracker's per-kid settings: `reading_daily_goal_pages`, `reading_goal_start_date` and `reading_goal_days_of_week` - since 2026-08-31 these are a **mirror** of the goal period in force today (see `kid_reading_goal_periods`), not where a goal is set; `syncKidGoalMirror` in the edge function is their only writer, `reading_spin_threshold_pages` (grant a Reward Tracker bonus spin every this-many cumulative *weighted* pages read - null means off), `reading_pages_credited_for_spin` (how many of those weighted pages have already been cashed in, so the same pages never grant twice)
- `family_bedroom_items` - the family's own bedroom checklist (category + label per item), fully editable by a parent from the dashboard. Seeded with a 17-item default checklist automatically when a family is created (a database trigger, so it works even though families themselves are created by raw SQL - see "Onboarding a new family" below); a kid's checklist total is however many items their family currently has, not a fixed number
- `kid_checklist_state` - today's checkbox state per kid (bedroom only - personal), keyed against the family's current `family_bedroom_items`
- `kid_streaks` - current streak, best streak, total points, total passes, last parent-check result (bedroom only)
- `kid_progress_log` - append-only history of resets and parent checks, used by the parent dashboard and leaderboard
- `sessions` - opaque tokens issued on code redemption, mapping a device to a family (and a kid, for kid sessions)
- `kid_reference_photos` - metadata for each kid's up-to-3 "what done looks like" bedroom photos
- `family_rooms` / `family_room_items` - shared rooms (kitchen, etc.) belonging to a family, not one kid, and their checklist items - both fully editable by a parent from the dashboard
- `family_room_state` / `family_room_progress` / `family_room_log` / `family_room_photos` - the shared-room equivalents of the kid_* tables above. Progress here is a single row per room (the whole family's, not any one kid's) - deliberately parallel to, not merged with, the kid_* tables, so bedrooms keep working exactly as before
- `family_reward_categories` - the family's own customizable list of reward types (label + color), used by the reward tracker. Seeded with 9 defaults automatically when a family is created (same trigger pattern as `family_bedroom_items`)
- `family_reward_notes` - the family's own customizable list of preset "reasons" (per earn/spend type) shown in the reward tracker's note modal. Seeded with the original hardcoded defaults automatically when a family is created (same trigger pattern); a reason is copied as free text onto a `kid_reward_log` row at tap time, not referenced by id, so deleting one never touches existing history
- `kid_reward_log` - append-only ledger for the reward tracker: one row per +1/-1 tap (kid, category, note, timestamp). Balances (and the earned/spent split) are a live sum over this table, computed by the edge function - not a stored running total, so Undo is just deleting the row
- `kid_reward_trades` - a kid-to-kid trade proposal (from_kid, to_kid, what's given, what's wanted back, status). Accepting writes four `kid_reward_log` rows (each kid loses what they gave, gains what they received); declining/cancelling just changes status, no ledger writes. `kids.verify_image`/`verify_fail_count`/`verify_locked_until` back the picture-grid verification a kid does to accept - see [`apps/my-rewards`](apps/my-rewards)
- `kid_big_rewards` - ad-hoc "big" rewards (1-2/month/kid), separate from the category tap tally: a reason and earned date recorded when earned (`status: pending`), then what it was spent on and a spent date recorded later (`status: spent`). Unlike `kid_reward_log`, a row is updated in place rather than only ever inserted/deleted, since "still waiting to be spent" is itself worth showing
- `photo_score_requests` - a kid's "score my room" submission for the self-hosted AI photo-scoring feature: family_id, kid_id or room_id, storage_path, status (`pending`/`scored`/`failed`), score (1-10), comment, timestamps. A partial unique index caps it at one pending request per kid/room at a time. See [`docs/TASK_BOARD.md`](docs/TASK_BOARD.md) for the full design
- `kid_reading_books` - one row per book a kid is reading or has finished: title, optional total_pages, status (`reading`/`finished`), started_date, finished_date, `page_value_percent`. Title, total_pages and page_value_percent are editable in place (`edit_book`) rather than delete-and-recreate. `page_value_percent` (NOT NULL, default 100, CHECK 1-1000) is how much one page of that book counts against a "normal" page - 50 means two of its pages equal one normal page, 150 means each page counts for one and a half. It weights only the goal's ahead/behind maths and the bonus-spin threshold; the book's own "page X of Y" progress always shows real pages. It lives on the book rather than frozen onto each log row, so changing it re-scores that book's whole history at once (the app confirms with the before/after schedule figures before saving)
- `kid_reading_log` - one row per "what page are you up to" entry for a book, on an explicit date a parent enters. `pages_read` is computed by the edge function as the delta from that book's most recent earlier entry (0 baseline if it's the first), so a parent only ever types the page reached, never a page count. Crossing a kid's `reading_spin_threshold_pages` on insert grants a Reward Tracker bonus spin via the same `bonus_spins` column/atomic-increment pattern as the AI auto-approve spin trigger - counted in *weighted* pages, each entry scaled by its book's `page_value_percent` (so `reading_pages_credited_for_spin` is in that same weighted unit; lowering a book's value afterwards can put the weighted total below what's already credited, which the function handles by granting nothing rather than revoking a spin). A logged entry is editable (`edit_reading_log`, recomputes `pages_read` the same way) or deletable, but neither recomputes any other entry that treated it as its own "prior" page - an accepted limitation for a nightly-log use case, not worth a full recompute for a rare correction
- `kid_reading_goal_periods` - a kid's nightly reading goal as a dated history: each row is `start_date` + `daily_goal_pages` + `days_of_week` (null/empty = every day), in force until the next period's start date. Changing a goal adds a period rather than overwriting one, so nights already logged keep the goal that applied at the time - the ahead/behind banner scores each day against the period covering it. Rows are freely editable and back-fillable (`manage_reading_goal_periods`), unique on (kid_id, start_date). The `kids.reading_goal_*` columns are now a read-only mirror of the period in force today, written only by the edge function's `syncKidGoalMirror`
- `kid_reading_holidays` - a per-kid list of date ranges (school holidays, sick days, etc) excluded when the reading-tracker app computes a kid's "ahead/behind schedule" banner client-side from `reading_daily_goal_pages`/`reading_goal_start_date`/`reading_goal_days_of_week` plus the log

The actual reference photo images (both kids' and shared rooms') live in one private Storage bucket, `reference-photos`.

## Onboarding a new family

There's no public sign-up page by design - you create each family so you
control who's on the platform. To add one, run this in the Supabase SQL
editor (or ask Claude to run it), then send the parent their `parent_code`:

```sql
insert into families (name, display_name, parent_code, parent_pin)
values ('The Smiths', 'The Smiths', '<generate an 8-char code>', '<a 4-digit PIN of their choosing>')
returning id, parent_code;
```

They redeem that code once in the parent dashboard, then use "Add a kid"
there to create each kid's own code - no further SQL needed.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which
publishes the whole repo to GitHub Pages. Once live:

- Kids' app: `https://<your-username>.github.io/homelife/apps/bedroom-reset/`
- Parent dashboard: `https://<your-username>.github.io/homelife/apps/parent-dashboard/`
- Leaderboard: `https://<your-username>.github.io/homelife/apps/leaderboard/`

The edge function deploys separately (via the Supabase MCP tool or `supabase
functions deploy family-api`), not through the GitHub Pages workflow -
redeploy it after editing `supabase/functions/family-api/index.ts`.

## Project docs

- **[`AGENTS.md`](AGENTS.md)** - canonical instructions for working on
  this repo (conventions, file-editing rules) - read this first.
- **[`docs/TASK_BOARD.md`](docs/TASK_BOARD.md)** - open work only:
  what's next, what's blocked, and full design detail for bigger items
  like the AI photo-scoring anti-cheat work.
- **[`CHANGELOG.md`](CHANGELOG.md)** - the permanent record of what's
  shipped, newest on top.
- **[`DECISIONS.md`](DECISIONS.md)** - why non-obvious choices were
  made, in the same Context/Options/Decision/Why format throughout.
- **[`docs/sessions/`](docs/sessions/)** - a chronological log, one
  file per working session.
