# D-2026-07-27-reward-tracker-big-rewards

Date: 2026-07-27
Status: Done

**Context:** The family wanted a way to record ad-hoc "big" rewards - things bigger and rarer (1-2 per
month per kid) than a category tap in the existing Quick Tap tally, each with its own reason (when
earned) and what-it-was-spent-on (when spent later), both dated.

**Options considered:**
1. Two independent, unlinked log rows (an "earn" entry and a "spend" entry), mirroring
   `kid_reward_log`'s append-only ledger model.
2. A single record per big reward that moves through a lifecycle: `pending` (earned, reason + date) ->
   `spent` (what it went on + date), updated in place rather than only ever inserted/deleted.
3. Fold big rewards into the existing `family_reward_categories`/`kid_reward_log` tally as just another
   category, distinguished by a flag.

**Decision:** Option 2 - a new `kid_big_rewards` table, one row per big reward, with a `status` column
(`pending`/`spent`) and separate `add_big_reward` / `spend_big_reward` / `undo_big_reward_spend` /
`delete_big_reward` edge function actions. Free text only (reason, spent_on) - no dollar or point amount.
No PIN gate on editing/deleting (matches how low-frequency and low-stakes this is - a parent already has
full access via the parent code, same as every other reward-tracker action). Surfaced as a new "🎁 Big"
tab in `reward-tracker` (add/spend, parent-only) and read-only in `my-rewards` (a kid sees their own
pending + spent big rewards on their card).

**Why:** Option 1 loses the "this reward is still waiting to be spent" concept entirely - there'd be no
way to show a kid (or parent) which earned rewards haven't been cashed in yet, which is exactly the
detail that makes this worth a dedicated feature instead of just another category tap. Option 3 conflates
two different kinds of currency: the tap tally is a running balance summed live over an append-only
ledger (Undo = delete the row), while a big reward is a one-off event with its own narrative (why it was
earned, what it became) that doesn't compose with a balance at all - forcing it into that shape would
either fake a fractional balance or lose the reason/spent-on text. Option 2's "row updated in place"
departs from `kid_reward_log`'s immutable-ledger convention, but that's the right shape here: a big
reward genuinely has one lifecycle (earned -> spent), not two independent events to reconcile.

**Status:** Done.
