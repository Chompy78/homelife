# 2026-07-30 — Reward spinner: ask which kid on SPIN instead of a header picker

**Focus:** Small UX tweak to the reward-tracker Spin tab: kids no longer show in the sticky
header on that tab; pressing SPIN now asks which kid it's for first.

## Timeline

- User asked for a tweak to the reward spinner: on the Spin tab, kids shouldn't appear in the
  header - instead pressing SPIN should ask which child, then spin.
- Reviewed `apps/reward-tracker/app.js`/`index.html`/`styles.css`: the header's `kidPickerRow` was
  shared between Quick Tap and Spin (`updateHeaderForMode()`), driving a single `selectedKidId`
  also used by the bonus-spin row, the "earn a bonus spin" reasons list, and the "Spinning for X"
  banner.
- Implemented: `updateHeaderForMode()` now shows `kidPickerRow` for Quick Tap only. Added a
  "Spin for who?" modal (`#spinKidModal`, reusing the existing `.catModal`/`.catCard` shell) with
  one big tappable button per kid. `spin()` now awaits `askWhichKidToSpin()` before doing anything
  else; the chosen kid becomes `selectedKidId` (re-rendering the banner/bonus row/reasons list),
  then the rest of the existing spin flow runs unchanged. Cancelling the modal re-enables the SPIN
  button and does nothing else.
- Bumped `apps/reward-tracker/service-worker.js` `CACHE_NAME` (v17 → v18) since JS/HTML/CSS all
  changed. Updated the Spin wheel section of `apps/reward-tracker/README.md` to describe the new
  flow instead of "spun for whichever kid is selected".
- Logged the design choice (`D-2026-07-30-spin-tab-ask-kid-on-spin`) since it revisits part of
  `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`'s "one shared header picker for
  Quick Tap/Spin" call - Quick Tap keeps its header picker, only Spin changes.

## Files touched

- `apps/reward-tracker/app.js` - `updateHeaderForMode()`, new `spinKidModal` wiring, `spin()`
- `apps/reward-tracker/index.html` - new `#spinKidModal` markup
- `apps/reward-tracker/styles.css` - `.spinKidGrid`/`.spinKidBtn` styles
- `apps/reward-tracker/service-worker.js` - `CACHE_NAME` bump
- `apps/reward-tracker/README.md` - Spin wheel section updated
- `CHANGELOG.md`, `DECISIONS.md`, `decisions/2026/D-2026-07-30-spin-tab-ask-kid-on-spin.md`

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-07-30-spin-tab-ask-kid-on-spin.md`
- Revisits `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`
