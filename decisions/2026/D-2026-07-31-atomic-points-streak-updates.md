# D-2026-07-31-atomic-points-streak-updates

Date: 2026-07-31
Status: Done

**Context:** A full-repo code review found that `update_checklist_item`, `update_family_room_item`,
and the shared `awardBedroomPass`/`awardRoomPass` helpers (used by Parent Check and AI
auto-approve) all did a non-atomic read-modify-write on `kid_streaks`/`family_room_progress`:
fetch the row via one Supabase call, compute a new `total_points`/streak/date in JS, write it back
via a second call. A concurrent request for the same kid/room (rapid double-tap, two items
completing a checklist at once, or a Parent Check landing alongside an AI auto-approve) could read
before the other's write landed, silently losing a point award - or, worse, both could independently
decide the once-per-day completion bonus hadn't been claimed yet and both award it.

**Options:**
1. Leave as-is - rejected, a real (if narrow) correctness bug, and the codebase had already fixed
   the identical bug shape once before for spin credits (`grant_spin_credit_atomic`).
2. A plain atomic increment via `INSERT ... ON CONFLICT DO UPDATE SET total_points =
   total_points + delta` - works for the pure point-accumulation case, but doesn't solve the
   completion-bonus double-award: that decision ("has `last_bonus_date` already been claimed
   today?") still has to happen somewhere, and if it happens in JS before the atomic increment, two
   concurrent requests can still both decide "not yet claimed" before either writes.
3. Row-locked Postgres functions (`SELECT ... FOR UPDATE`, matching `grant_spin_credit_atomic`'s
   existing pattern) that do the full read-decide-write - including the once-per-day bonus
   check - inside one locked transaction. **Chosen**, for both the plain point-delta case
   (`apply_kid_points_delta_atomic` / `apply_room_points_delta_atomic`) and the fuller
   streak/pass-award case (`award_bedroom_pass_atomic` / `award_room_pass_atomic`, which also
   ports the current/best-streak and progress-log-insert logic into PL/pgSQL).

**Why:** Only the row lock genuinely closes the race - a second concurrent call blocks until the
first commits, then sees the already-updated `last_bonus_date`/streak and correctly does nothing
(or nothing extra). This mirrors the exact reasoning already documented for
`grant_spin_credit_atomic`. The award-pass functions additionally needed to reproduce the
current/best-streak carry-forward logic (same day vs. yesterday vs. gap) faithfully in SQL, plus
the `family_bedroom_items`/`kid_checklist_state` done/total count for the progress-log insert - a
larger port than a simple increment, but the same underlying pattern.

**Why UTC, not the family's local timezone:** the existing `todayStr()`/`yesterdayStr()` in this
file are UTC-based (`toISOString()`), not `Australia/Sydney`-based like several other date-default
columns in this schema - a separate, real day-boundary correctness gap, but *not* one this change
was scoped to fix. The new SQL functions deliberately match the existing UTC semantics exactly
(`(now() at time zone 'UTC')::date`) so this change is atomicity-only, not a silent behavior change
to when a "day" rolls over.

**Status:** Done. Migration `add_atomic_points_streak_functions` applied (4 new functions);
`family-api/index.ts`'s `update_checklist_item`, `update_family_room_item`, `awardBedroomPass`,
`awardRoomPass` rewired to call them; redeployed. Verified live against a disposable test family:
checking a bedroom item awards `ITEM_CHECK` points and the atomic RPC returns cleanly with no
errors.

