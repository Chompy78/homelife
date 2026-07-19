# 2026-07-19 — Parent icon-picker as a PIN alternative

**Focus:** Add a family-chosen "3-of-9 icon picker" alternative to the
4-digit parent PIN, from a user-supplied design spec, across every app
that shares `families.parent_pin`.

## Timeline

- User pasted a full design spec for a "3-of-9 graphical password":
  a 3x3 grid of 9 fantasy icons, memorize any 3 (order-independent),
  grid shuffles every attempt to resist shoulder-surfing, explicitly
  "not bank-level security" - just raising the bar above casual
  access for a family with kids around age 8-10.
- Before coding, explored every existing `parent_pin` touchpoint across
  the repo (3 inline comparisons across reward-tracker and Bedroom
  Reset flows, all reading one shared family-level value) and asked
  the user two scope questions via AskUserQuestion: which apps/flows
  should support it, and whether it replaces the PIN outright. User
  confirmed: both apps' PIN-gated flows, and a per-family Settings
  choice rather than a hard replacement.
- Backend: migration adding `families.parent_auth_method` (`pin` |
  `icons`, default `pin`) and `families.parent_icons`; consolidated
  the three previously-duplicated inline PIN comparisons into one
  `verifyParentSecret` helper; added a role-agnostic
  `get_family_auth_method` action; extended `update_family_settings`
  to validate and store the chosen method/icons. Deployed the edge
  function (confirmed version 30, active, diffed byte-for-byte against
  disk before deploying).
- Parent dashboard: added the Settings UI to choose PIN vs. icon
  picker and pick the 3 icons, with a "don't clobber mid-edit" guard
  matching the existing settings-render pattern.
- Reward-tracker: PIN modal now renders the icon grid instead of the
  numeric pad when the family's method is `icons`, sharing one
  `submitParentSecret` call across all three PIN-gated actions
  (delete category, Reset, Kid View exit).
- Bedroom Reset: generalized `roomParentCheck`/`submitPin` into
  `submitSecret`, made `requestParentPin` fetch the family's method
  fresh on every open (no existing polling loop to piggyback on,
  unlike reward-tracker), and added the same icon grid alongside the
  existing numeric pad.
- Tested each app against disposable Supabase test families with
  mocked Playwright fixtures built from real API responses: icon grid
  renders correctly, wrong 3-icon combos show an error and reshuffle
  with no lockout (matching the existing PIN's no-lockout behaviour),
  correct combos work in any order (proving the set-comparison, not
  sequence-comparison, logic), and switching a family back to `pin`
  correctly shows the numeric pad again. Regression-checked
  reward-tracker's existing kid-theme test still passes unaffected.
- Bumped service worker cache versions in all three apps (own asset
  changes each): parent-dashboard v6, reward-tracker v11, bedroom-reset
  v21.

## Files touched

- `supabase/functions/family-api/index.ts` (deployed, version 30)
- Migration: `add_parent_icon_auth`
- `apps/parent-dashboard/{index.html,app.js,styles.css,service-worker.js}`
- `apps/reward-tracker/{index.html,app.js,styles.css,service-worker.js}`
- `apps/bedroom-reset/{index.html,app.js,styles.css,service-worker.js}`

## Related

- `D-2026-07-19-parent-icon-auth-alternative`
- CHANGELOG.md, 2026-07-19 entry

## Carried forward

- Nothing left open - all three frontends verified working, no known
  bugs. Icon set (Dragon/Castle/Crown/Potion/Treasure Chest/Pirate
  Ship/Owl/Crystal/Sword) is a hardcoded constant duplicated in the
  backend and each of the 3 frontends, matching this repo's existing
  convention for small shared constants (`KID_PALETTE`, `POINTS`) - a
  future icon-set change would need updating in all 4 places.
