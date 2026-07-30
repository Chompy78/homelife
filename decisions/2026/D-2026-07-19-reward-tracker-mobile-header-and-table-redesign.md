# D-2026-07-19-reward-tracker-mobile-header-and-table-redesign

Date: 2026-07-19
Status: Done

**Context:** The user supplied a detailed UI-improvement brief (a pasted design doc) asking for a
compact sticky header, spreadsheet-style sticky table headers/columns, and a View/Edit mode split
for the reward table, aimed at fixing a too-tall header and a cluttered table on mobile. The brief's
own mockups assumed a single "[Child ▼]" selector in the header, but the app already has two
different kid-selection models that don't map onto one selector cleanly - needed resolving before
writing any CSS.

**Options considered (with the user's answers):**
1. Child selector scope: one selector everywhere, vs. only for Quick Tap/Spin (which pick one active
   kid) with Table view showing no selector at all. **Chosen: Quick Tap/Spin only** - Table view
   already shows every kid as its own spreadsheet column simultaneously, which is what the doc's own
   sticky-column requirements need multiple columns *for*; forcing Table view down to one kid at a
   time would contradict the rest of the brief.
2. View/Edit mode scope: Table view only, vs. also Quick Tap's tile rows (same +/- clutter pattern).
   **Chosen: Table view only** - Quick Tap is inherently a fast-tap-to-add-points screen, not a
   read-then-edit one.
3. Per-kid running totals (shown today on each kid chip): keep a compact total next to the selector,
   vs. drop them. **Chosen: drop** - Table view's columns and the Insights tab already show totals;
   duplicating them in the compact header works against the header's whole point.
4. "Manage reward categories"/"Manage reward reasons" (previously permanent buttons under the
   table): move into the new overflow menu, vs. leave in place. **Chosen: move into the menu** -
   matches the doc's own "admin-style controls shouldn't take permanent space" instruction.

**Why border-collapse: separate, not collapse, on the sticky table:** `border-collapse: collapse`
has known rendering bugs with `position: sticky` cells (mainly Safari) where the shared border
between a stuck and non-stuck cell can vanish or double up during scroll. `border-spacing: 0` with
an explicit `border-right`/`border-bottom` per cell gets visually the same grid look without
depending on collapsed-border-and-sticky interaction at all.

**Why the sticky header's z-index needed to be low (20), not high:** the table's own sticky cells
(header row, left column, corner) only need to beat plain page content, so a modest z-index clears
that easily - but the app's existing modals sit much higher (settingsModal/catModal 60, confirmModal
70, pinModal 80). Giving the sticky app bar a high z-index (100, the first attempt) made it paint
*above* every modal, silently intercepting clicks on any modal content that happened to render
underneath the header's screen area - caught by the `test_spin_weight.js` regression test failing
with "element intercepts pointer events" on `#settingsModalClose`, not by visual inspection.

**Status:** Done.
