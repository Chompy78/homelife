# D-2026-07-18-reward-tracker-spin-wheel

Date: 2026-07-18
Status: Done

**Context:** The user asked for an actual spinning reward wheel a kid can
watch land on a random category, added to their tally, operated from the
parent app. One of the seeded default categories has always been called
"Spin twice" - almost certainly a holdover from a real physical prize
wheel this app's whole reward-tracker concept is modelled on (the app's
own icon is a ferris wheel, 🎡), where earning "Spin twice" meant literally
getting to spin the wheel two more times.

**Options for what landing on "Spin twice" should do:**
1. Tally it like any other category (+1 "Spin twice" on the kid's balance).
2. Treat it as a wheel mechanic, not a reward: trigger two bonus spins
   automatically instead of logging anything for that landing.

**Decision:** Option 2.

**Why:** A literal "+1 Spin twice" tally entry would be a reward that
does nothing and means nothing on its own - the name only makes sense as
an instruction to the wheel, not a prize. Auto-triggering two more spins
is what the category is actually for, and it's a satisfying "landed on
a bonus" moment for a kid watching, closer to what the original physical
wheel almost certainly did. If a family renames or deletes that category
the spinner just treats it as a normal wedge - the special case matches
on the label "spin twice" (case-insensitive), not a schema flag, so it
degrades gracefully.

**Status:** Done. New "🎡 Spin" mode in `apps/reward-tracker`: a
conic-gradient wheel built from `state.categories`, CSS-transform spin
(always rotates forward from wherever it currently sits, never snaps
back, so a chained bonus spin continues smoothly), landing calls the
existing `adjust_reward` via `tapReward()` with an automatic note - no
backend changes needed. A `MAX_SPINS_PER_ROUND` safety cap (25) guards
against every category somehow being named "Spin twice" at once, which
would otherwise loop forever. Verified via Playwright with `Math.random`
stubbed to a fixed sequence, forcing a "Spin twice" landing followed by
two real landings and confirming: exactly two bonus spins fired, no
literal tally for "Spin twice" itself, correct balances for the two real
landings, and the button disables for the whole chain. Bumped the
reward-tracker service worker cache to v9.
