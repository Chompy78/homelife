# 2026-08-18 — Reward spinner: pick the kid first, SPIN spins immediately

**Focus:** Fixing the reward-tracker Spin tab, reported as hard to use and repeatedly
re-triggering a spin on any interaction.

## Timeline

- User reported the Spin flow: pressing SPIN prompts for the child, then spins, "but it keeps
  triggering a spin when I interact with it". Asked for the reverse order - pick a child shown on
  the tab, then press SPIN.
- Traced the repeated-spin symptom to the `#spinKidModal` added by
  `D-2026-07-30-spin-tab-ask-kid-on-spin`. It reuses the `.catModal` shell, which centres its card
  in the viewport, putting the kid buttons over `.spinBtn` (absolutely centred in `.wheelWrap`).
  Choosing a kid hid the modal inside the same tap, so the resulting click - including touch's
  synthesized one - fell through onto the SPIN button now exposed underneath.
- Also noted `spin()`'s first statement was `await askWhichKidToSpin()`, so `spinning` wasn't set
  until after an await: two quick presses could both clear the `if (spinning)` guard.
- Implemented option 3 of the new decision: `updateHeaderForMode()` shows `kidPickerRow` for both
  Quick Tap and Spin again; deleted `#spinKidModal`, `renderSpinKidGrid()`, `askWhichKidToSpin()`
  and the cancel handler; `spin()` now sets `spinning`/disables the button synchronously and spins
  for `selectedKidId` straight away. Kid chips are `disabled` while `spinning` (with a
  `.kidChip:disabled` style), re-rendered at the start and end of a spin round, so a kid can't be
  switched mid-animation and get another kid's result.
- Bumped `CACHE_NAME` (v21 → v22) since JS/HTML/CSS all changed — this is also what the in-app
  version tag reads, via `apps/shared/version.js`.
- Updated the Spin wheel section of `apps/reward-tracker/README.md`, and marked
  `D-2026-07-30-spin-tab-ask-kid-on-spin` Superseded in both its record and the `DECISIONS.md`
  index.
- Repo-wide grep for `spinKid` after the change: no references left.

## Files touched

- `apps/reward-tracker/app.js` — `updateHeaderForMode()`, `renderKidPicker()`, `spin()`; removed the
  kid-modal element refs and plumbing
- `apps/reward-tracker/index.html` — removed `#spinKidModal` markup
- `apps/reward-tracker/styles.css` — removed `.spinKidGrid`/`.spinKidBtn`/`.spinKidAvatar`; added
  `.kidChip:disabled`
- `apps/reward-tracker/service-worker.js` — `CACHE_NAME` v21 → v22
- `apps/reward-tracker/README.md` — Spin wheel section
- `CHANGELOG.md`, `DECISIONS.md`, `decisions/2026/D-2026-08-18-spin-kid-picker-before-spin.md`,
  `decisions/2026/D-2026-07-30-spin-tab-ask-kid-on-spin.md` (status only)

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-18-spin-kid-picker-before-spin.md`
- Supersedes `D-2026-07-30-spin-tab-ask-kid-on-spin`; re-establishes the shared Quick Tap/Spin
  header picker from `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`

## Carried forward

- No edge-function or schema change was involved, so nothing to redeploy beyond the normal Pages
  push. Installed devices pick the change up on the `CACHE_NAME` bump.
- Not verified on a physical phone this session — the ghost-click cause is removed structurally
  (no overlay opens over the wheel at all), but worth a quick confirm on the user's device.
