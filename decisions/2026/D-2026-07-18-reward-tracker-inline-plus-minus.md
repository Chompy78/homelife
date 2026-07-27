# D-2026-07-18-reward-tracker-inline-plus-minus

Date: 2026-07-18
Status: Done

**Context:** Quick Tap required toggling a global "+ Earn / − Spend"
switch before tapping a category tile. The user reported the "− Spend"
button "does not work" - tracing it confirmed the switch's click handler
was in fact wired (the DOM-collision bug fixed in
`D-2026-07-18-reward-tracker-kid-theme-colours` was the root cause, not a
second bug), but the two-step flow itself was the real complaint: it's
easy to forget which mode is active and tap the wrong one. The user asked
for `+`/`-` to live directly on each reward row instead.

**Options:**
1. Keep the Earn/Spend mode switch, just fix its wiring.
2. Remove the switch entirely - each reward becomes a thin row (swatch +
   label + balance + its own `−`/`+` buttons), matching the Table view's
   existing per-cell button pattern. Grid auto-fits to 2+ columns on wide
   screens, 1 on mobile.

**Decision:** Option 2.

**Why:** A mode switch is a piece of state a parent has to remember is
set correctly before every tap - a chronic source of "I meant to spend
but it earned" mistakes, and exactly the kind of state that's easy to
break by accident (as the DOM-collision bug proved). Putting both
actions on the row removes the mode entirely: there's nothing to get
out of sync. It also reuses the same row shape the "make it more compact"
ask from earlier today was already pushing toward, so both requests
converged on one layout. Spend still requires the PIN via the same
`requirePin` gate as before - only which button starts that flow changed.

**Status:** Done. Removed `quickType` state and the Quick Tap
Earn/Spend switch; `.tileGrid`/`.tile` replaced with `.rewardRows`/
`.rewardRow` (CSS grid, `auto-fit, minmax(260px, 1fr)`). Verified via
Playwright, including the exact reported flow (tap `−` -> PIN prompt ->
note modal opens with "−1"). Bumped the reward-tracker service worker
cache to v7.
