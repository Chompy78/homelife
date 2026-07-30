# D-2026-07-18-reward-tracker-kid-theme-colours

Date: 2026-07-18
Status: Done

**Context:** In Quick Tap, nothing distinguished "which kid am I currently
tapping for" beyond the small selected-state on the kid picker chip -
easy to miss, especially with several kids. The user asked for it to be
obvious who a tap affects, suggested a per-kid colour "theme" that's
randomly assigned but customizable, plus separately asked for the Quick
Tap tiles to take up less space and for a warning on reward categories
nobody has ever used.

**Options (kid colour):**
1. Keep the existing client-side scheme (`KID_PALETTE[index % length]`,
   recomputed from a kid's position in `state.kids` on every render).
2. A new `theme_color` column on `kids` (shared table), randomly assigned
   from a curated palette when a kid is added (avoiding a sibling's
   colour where possible), overridable via `manage_kid`'s existing
   `rename` sub-action.

**Decision:** Option 2.

**Why:** The index-based scheme meant a kid's colour silently changed
whenever a sibling was added or removed before them in sort order -
identity that shifts based on unrelated changes is confusing, and it
can't be customized at all. Storing it on `kids` makes it stable and
lets a parent override it from Settings, same pattern as `avatar_emoji`.
Existing kids were backfilled with the exact colour they already
rendered as (position-based into the same palette) so nobody's colour
visibly changed by this migration - only newly-added kids get a genuinely
random assignment. Scoped the persisted column to the shared `kids`
table (correct normalization - it's kid identity, not reward-tracker
data) but only wired the UI into Reward Tracker for now; other apps
(bedroom-reset, parent-dashboard) could adopt it later without a schema
change.

**Decision (unused-category warning + compact tiles):** Added a
zero-usage check (`earned + spent === 0` across every kid) computed
client-side from data the app already has (`state.balances`), surfaced
as a summary line plus a per-row "Unused" badge in Manage Categories -
no new backend query needed. Shrank `.tile` significantly (row layout,
much smaller padding, no fixed min-height) since with per-kid colour
theming taking over the "who" signal, tiles no longer needed to be huge
to stay identifiable.

**Status:** Done. Migration `add_kids_theme_color`. Also fixed a real
bug found while building the active-kid banner: `#reasonsTypeSwitch`
(added in `D-2026-07-18-reward-tracker-custom-reasons`) reused the
`.earnSpendSwitch` class and sat earlier in the DOM than Quick Tap's own
switch, so `document.querySelector(".earnSpendSwitch")` had been
silently binding the Quick Tap Earn/Spend toggle's click handler to the
wrong element since that feature shipped. Fixed by giving Quick Tap's
switch a unique id.
