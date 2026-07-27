# D-2026-07-17-reward-tracker-app

Date: 2026-07-17
Status: Done

**Context:** The user brought in a standalone "Reward Tracker" PWA they'd
built separately (single `index.html`, localStorage only, hardcoded to
three kid names with hardcoded colours) and wanted it added to this
monorepo, wired into the shared Supabase backend, and made consistent
with the rest of the suite. This meant deciding how it authenticates, how
its data is modeled, and whether it shares any of the existing
points/streaks/leaderboard system.

**Options for auth:**
1. Give it its own per-kid login like bedroom-reset (kid_code session).
2. Make it a parent-operated tool like the parent dashboard (parent_code
   session only) - a kid doesn't get their own reward-tracker session.

**Decision:** Option 2.

**Why:** The original app's own design intent was that kids can't quietly
adjust their own counts ("kids can't mess with counts if you leave it on
History view"). A parent-code gate matches that intent directly, and lets
one parent tap rewards for any of their kids from a single shared device
(a wall tablet), which is how the original was actually used. It also
reuses the *same* `homelife_parent_token` local storage key Parent
Dashboard uses, so a parent already logged into one is automatically
logged into the other on the same device (same origin, different path).

**Options for the data model:**
1. A `kid_reward_balances` table with running earned/spent totals,
   updated on every tap (mirrors `kid_streaks`'s running-total approach).
2. An append-only `kid_reward_log` ledger (kid, category, +1/-1, note,
   timestamp), with balances computed as a live sum at read time.

**Decision:** Option 2.

**Why:** A running-total table means Undo has to carefully reverse a
specific prior tap's effect on a shared counter, which is exactly the
kind of thing that drifts out of sync under a bug or a race. With a pure
ledger, Undo is just "delete that log row" and the balance is always
correct by construction - no separate state to keep in sync. The history
view the app already needed (for Undo) and the balances come from the
same table for free.

**Decision (currency):** Reward tallies are a separate currency from
`kid_streaks.total_points`, not merged into it or the public leaderboard.

**Why:** A reward category like "Macdonalds" or "$5 at the reject shop"
isn't the same kind of thing as a chore-completion streak - conflating
them would make the leaderboard compare families on an axis (what
rewards they've configured) that has nothing to do with chores done.

**Status:** Done. New tables `family_reward_categories` (parent-editable,
seeded with the original app's 9 default categories via a trigger on
family insert, same pattern as `family_bedroom_items`) and
`kid_reward_log`. Four new `family-api` actions: `get_reward_state`,
`adjust_reward`, `undo_reward_log`, `manage_reward_categories`. New app at
`apps/reward-tracker`, using the wheel icon from the original app as its
PWA home-screen icon while keeping the shared `apps/shared/icons`
favicon for the browser tab, matching every other app's convention.
Local JSON export/import and the per-category "Clear" button from the
original weren't carried over - data lives centrally in Supabase now, so
a browser-local backup isn't the safety net anymore, and Undo covers a
mis-tap instead. Verified against a disposable test family (categories
seed correctly, earn/spend/undo all adjust the ledger correctly, invalid
colors fall back to a default) before cleanup.
