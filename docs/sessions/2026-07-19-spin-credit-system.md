# 2026-07-19 — Bug fixes + spin-credit system

**Focus:** Fix two bugs the user found in the just-shipped mobile redesign, and build a cross-app
bonus-spin system from four related feature requests, all reported together as a numbered list.

## Timeline

- User reported six items after trying the mobile redesign: (1) the sticky header "scrolls down a
  little bit" before locking, (2) History's Undo button does nothing, (3) another app (e.g. Bedroom
  Reset) should be able to grant a kid a spin, (4) the wheel should be bigger with labels on the
  wedges and a centered/hideable SPIN button, (5) spin sound should be customizable, (6) named
  reasons should grant a limited number of bonus spins per period.
- Investigated (1) and (2) directly rather than guessing: reproduced (2) against a mock and confirmed
  the click/confirm/API chain worked fine in isolation, which narrowed it to either a real
  server-side failure being silently swallowed, or a layout issue specific to real data. Asked the
  user two rounds of narrow clarifying questions (mostly multiple-choice, since prose answers were
  coming back as one-word typos) to pin down exact repro conditions, since neither bug was
  reproducible from code reading alone.
- Root cause (1): `body` had 16px of padding, so the sticky header visibly traveled that distance
  before its `position: sticky; top: 0` engaged - not a rendering bug, just padding placed before the
  first sticky element. Fixed by moving that padding off the top.
- Root cause (2): `.historyMain` had no `min-width: 0`, so a history row with a long custom note
  refused to shrink and overflowed the row (and the page) instead of wrapping, pushing the Undo
  button outside the visible/tappable viewport. Also hardened both Undo paths (History's own button
  and the 5-second toast's) to show a visible error and re-enable the button on failure, instead of
  leaving it silently disabled forever.
- Asked four architecture questions before building (3)/(6), since they're the same underlying
  feature (a kid earning a limited, named-reason bonus spin) and getting the model wrong meant
  rebuilding it: whether bonus spins gate spinning or stay additive (additive - reuses the existing
  "Spin twice" chaining mechanic), per-reason limit shape (one cadence per reason, not count+period),
  whether the cross-app trigger should be generic or Bedroom-Reset-specific (generic - the user
  deliberately didn't pick a specific trigger event when offered the choice), and sound customization
  scope (presets, not file upload).
- Backend: migration adding `kids.bonus_spins`, `family_spin_reasons` (label/period/trigger_key),
  `kid_spin_credit_grants`, a seed trigger mirroring the existing reward-categories/notes pattern
  (seeds "Tidy Room AI Score" with `trigger_key = 'bedroom_ai_score'` and "Great Effort Award" for
  every family, backfilled for the 6 existing ones). New `manage_spin_reasons` (mirrors
  `manage_reward_notes`), `grant_spin_credit` (one function, callable by a parent for any kid or a kid
  for themselves only, shared by both the manual UI path and the automated Bedroom Reset path), and
  `consume_bonus_spins` (zeroes the count, returns how many to chain). Hooked Bedroom Reset's existing
  AI auto-approve branch in `submit_photo_score` to call the same `grantSpinCredit` helper, looked up
  by `trigger_key` (not label, so renaming the reason later doesn't break the link) - only on the
  individual-kid branch, not shared rooms, since `bonus_spins` has no natural target for a
  collective score.
- Deployed via a background subagent (byte-for-byte diff verified, version 31, active) while
  continuing frontend work in parallel.
- Frontend: bonus-spin row + consumption in `spin()` (seeds `spinsLeft` with `1 + consumed` instead of
  just `1`); a "tick yes" list under the wheel per configured reason, greyed out once used for its
  period; a new "Manage Bonus Spin Reasons" modal in the overflow menu. Wheel redesign: bigger
  (`min(320px, 88vw)`), wedge labels as children of `#wheel` itself (so they rotate with it during a
  spin for free, no separate animation needed), SPIN button moved into the wheel's hub and hidden
  (not just disabled) while spinning. Sound: replaced the on/off toggle with a preset `<select>`
  (Chimes/Arcade/Retro/Off), migrating any existing `"0"`/`"1"` stored value to `"off"`/`"chimes"`
  automatically so nobody's preference silently resets.
- Found two small bugs via screenshot/log review while building, both fixed inline since they were
  one-line and directly in code already being touched: `escapeHtml()` was being applied before
  `.textContent` in the spin-result message (textContent doesn't parse HTML entities, so `&amp;`
  showed up literally instead of `&`); the `.wheelLabel` radius needed computing in JS from the
  wheel's actual rendered size, not a CSS percentage (which resolves against the wrong box for a
  `transform: translate()`).
- Regression-swept the full existing reward-tracker Playwright suite after all the changes - several
  needed test-side fixes (new menu item shifted an expected count from 5 to 6; a new `await` before
  the spin animation starts raced an assertion with no wait) but no real app bugs beyond the two
  found above.
- Live-tested every new backend action against a disposable Supabase test family (`Spin Credit
  Test`/kid `Toby`): `manage_spin_reasons` add/update/delete, `grant_spin_credit`'s per-period cap
  (second grant in the same week correctly rejected), the kid-can-only-grant-to-self boundary (kid
  session granting a different kid's id correctly forbidden), and `consume_bonus_spins`. Cleaned up
  via cascading delete, verified zero rows left behind.
- Could not live-test the Bedroom Reset `submit_photo_score` auto-approve hook itself end-to-end -
  it's gated by `WORKER_TOKEN`, a secret that lives only in the Supabase project's own secret store
  and the self-hosted AI-scoring worker machine, neither reachable from this session. Verified by
  code review instead, calling the same already-verified `grantSpinCredit` helper - flagged as an
  open verification gap in `D-2026-07-19-spin-credit-system` rather than silently claimed as tested.

## Files touched

- `apps/reward-tracker/{index.html,app.js,styles.css,service-worker.js}`
- `supabase/functions/family-api/index.ts` (deployed, version 31)
- Migration: `add_spin_credits`

## Related

- `D-2026-07-19-spin-credit-system`
- CHANGELOG.md, 2026-07-19 entry

## Carried forward

- The Bedroom Reset AI-auto-approve → bonus-spin trigger has never been exercised end-to-end against
  a real `WORKER_TOKEN` call. Worth confirming for real the next time the AI-scoring worker runs
  against a family in `auto_approve` mode with a score at or above threshold.
