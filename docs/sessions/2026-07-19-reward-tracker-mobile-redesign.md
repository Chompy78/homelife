# 2026-07-19 — Reward Tracker mobile header/table redesign

**Focus:** Implement a user-supplied UI brief: compact sticky header, spreadsheet-style sticky
table headers/columns, and a View/Edit mode split for Reward Tracker's Table view.

## Timeline

- User pasted a detailed markdown UI brief describing the current header as too tall on mobile and
  the reward table as hard to read while scrolling, asking for: a compact sticky app bar, three
  simultaneous sticky layers on the table (child header row, reward/category column, their shared
  corner cell), and a View Mode (read-only, default) / Edit Mode (+/- controls) split.
- Read the current `index.html`/`app.js`/`styles.css` before touching anything, and found the
  brief's own mockup (a single "[Child ▼]" selector in the header) doesn't map cleanly onto the
  app's real structure: Quick Tap/Spin pick one active kid via chips, but Table view already shows
  every kid as its own column simultaneously and ignores that selection entirely. Asked four
  clarifying questions via AskUserQuestion before writing code (child-selector scope, View/Edit mode
  scope, whether to keep per-kid totals in the compact header, where the admin management buttons
  should go). User picked the recommended option on all four (see
  `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`).
- Implemented: `header` became `position: sticky` with a much smaller footprint; kid picker chips
  now scroll horizontally in one row instead of wrapping, and dropped their per-kid total; a new
  overflow menu (☰) holds Kid View, Settings, dark mode, and the two category/reason management
  screens (previously permanent buttons); an Edit/Done button + "Editing" badge control a new
  `tableEditMode` state that toggles the table's +/- controls; the table itself switched to
  `border-collapse: separate` with `position: sticky` on the header row, first column, and their
  shared corner cell, inside a bounded-height `overflow: auto` container (needed so `position:
  sticky` sticks to the table's own scroll box, not the whole page).
- Wrote a new Playwright test (`test_reward_ui_redesign.js`) covering header height in both modes,
  View/Edit toggling, and - the actual crux of the feature - that the corner cell, header row, and
  left column all stay pinned to the scroll container's top-left after scrolling both directions.
  Passed on the first run.
- Regression-swept the existing reward-tracker Playwright suite (`test_icon_verify_rt.js`,
  `test_kid_theme.js`, `test_instant_tap.js`, `test_spin_weight.js`, `test_spinner.js`). Several
  failed initially - all but one were test-authoring fallout from moving buttons into the new menu
  (needed an extra `#menuBtn` click first) or from View Mode now hiding the +/- controls by default
  (needed an extra `#editModeBtn` click). Fixed those in the test files, not the app.
- One failure was a real app bug, not a test bug: the sticky header's z-index (100, chosen to beat
  the table's own internal sticky cells) was higher than every existing modal's z-index
  (settingsModal/catModal 60, confirmModal 70, pinModal 80) - so the header silently intercepted
  clicks on modal content wherever the two visually overlapped. Caught by
  `test_spin_weight.js` failing on `#settingsModalClose` with "element intercepts pointer events",
  not by looking at it. Fixed by lowering the header's (and the menu's) z-index to 20 - comfortably
  above plain page content and the table's own sticky cells, comfortably below every real modal.
- Found and fixed a second real bug via screenshot review (not caught by any Playwright check): the
  dark-mode toggle's existing `applyDarkMode()` set `darkModeBtn.textContent` directly, which used to
  be fine (icon-only button) but now clobbered the new "Dark mode" text label the menu item needed.
  Fixed by wrapping just the emoji in its own `<span id="darkModeIcon">` and updating that instead.
- Screenshotted Quick Tap, Table (view + edit), the overflow menu, and a scrolled Table view at a
  narrow mobile viewport (390px) to visually confirm the sticky behaviour and compact header before
  calling it done.

## Files touched

- `apps/reward-tracker/index.html` (header restructure, new overflow menu markup, dark-mode icon
  span, removed duplicate admin buttons from the Table view section)
- `apps/reward-tracker/styles.css` (sticky header, menu/menu-item styles, sticky table CSS,
  z-index fix)
- `apps/reward-tracker/app.js` (`tableEditMode` state, `updateHeaderForMode()`, menu open/close
  wiring, `renderTable()`/`renderKidPicker()` changes, `applyDarkMode()` fix)
- `apps/reward-tracker/service-worker.js` (cache bumped to v12)

## Related

- `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`
- CHANGELOG.md, 2026-07-19 entry

## Carried forward

- Nothing left open - verified via a new targeted Playwright test plus the full existing
  reward-tracker regression suite, all passing, plus a visual screenshot pass at a mobile viewport.
