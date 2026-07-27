# D-2026-07-17-reward-tracker-pin-and-insights

Date: 2026-07-17
Status: Done

**Context:** The user asked to add a batch of features from a list they'd
been keeping for the original standalone app: a PIN lock on Spend/Delete/
Reset, a fairness/Insights view, a read-only Kid View, per-kid emoji
avatars, and a 5-second Undo toast. One item on their list (G2, cloud sync
via a private GitHub Gist) was explicitly skipped after checking with the
user - it would have meant storing family reward data in a GitHub Gist,
which conflicts directly with this project's security model (zero-policy
RLS, server-side-only access) and is redundant now that the app is fully
Supabase-backed (that was the point of the earlier session's work).

**Options for where the PIN check lives:**
1. Client-side only - compare against a PIN typed into a settings field.
2. Server-side, via a new `verify_pin` action that checks the family's
   `parent_pin` column (same one bedroom-reset's Parent Check already uses),
   same pattern as every other reward-tracker action that only requires a
   parent session.

**Decision:** Option 2.

**Why:** The PIN was never meant to be this app's actual security boundary
- whoever has the parent code already has full authority over every
reward-tracker action, PIN or not. What it's actually for is stopping a
kid from tapping Spend on a device a parent left logged in. Given that,
checking server-side costs nothing extra (one more `family-api` action)
and keeps the "PIN never touches the client" rule consistent with the
rest of this codebase, rather than special-casing this one feature to
compare a hardcoded value in the browser.

**Options for Insights data:**
1. Reuse `get_reward_state`'s existing 100-row history cap and compute
   weekly/monthly totals client-side from whatever's in that window.
2. A new `get_reward_insights` action that aggregates weekly/monthly
   earned, all-time balance, and top category server-side over the *full*
   ledger, independent of the history-view row cap.

**Decision:** Option 2.

**Why:** A family that's been using this for months will have more than
100 log rows; computing "this month's total" from a capped, most-recent
window would silently under-count and get worse over time. A dedicated
query with no cap avoids that, and keeps the aggregation logic in one
place (the ledger-summing pattern already used by `getRewardBalances`)
rather than duplicating it in the browser.

**Status:** Done. New actions: `verify_pin`, `get_reward_insights`,
`reset_reward_history` (wipes the ledger, keeps categories - the ledger
design from the original build made this a one-line delete). PIN
protection defaults on, toggleable per-device in Settings; the unlock
(5 minutes) is in-memory only, so it always resets on reload. Kid View
supports `?kid=<name>` to scope it to one kid for a dedicated tablet.
Avatars reuse the existing `kids.avatar_emoji` column via `manage_kid`
rename - no schema change. Verified via a disposable test family (PIN
accept/reject, insights aggregation, reset) and two Playwright runs
against a mocked backend covering the full UI surface (PIN gate on
spend/delete/reset/Kid-View-exit with wrong-then-right PIN, the 5-minute
unlock persisting across actions, Insights bars and stats, avatar
picker, PIN-protection toggle, Kid View both full and `?kid=`-scoped, and
the 5-second undo toast) - no console errors, no regressions in the
quick-tap/table/history/category-management flows from the previous round.
