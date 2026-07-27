# D-2026-07-19-spin-credit-code-review-fixes

Date: 2026-07-19
Status: Done

**Context:** A high-effort multi-angle code review of the spin-credit system (8 finder agents, 12
verified candidates) confirmed 10 real findings, topped by a race condition three independent finder
angles converged on independently. All 10 were fixed in this pass.

**Fixes:**
1./2. **Atomic RPCs + a hard cap, not a bigger client-side loop.** `grantSpinCredit` and
   `consume_bonus_spins` used to do a plain SELECT then a computed UPDATE - a concurrent grant and
   consume for the same kid could interleave and silently lose an increment or wipe out a freshly
   granted spin. Replaced both with single Postgres functions (`grant_spin_credit_atomic`,
   `consume_bonus_spins_atomic`) that lock the kid row (`SELECT ... FOR UPDATE`) for the whole
   check+insert+increment sequence, so a racing grant and consume now serialize instead of
   interleaving. Separately, `consume_bonus_spins` handed back the kid's *entire* accumulated count in
   one shot, but the client's spin-chain loop caps at `MAX_SPINS_PER_ROUND` (25) - anything beyond
   that was already zeroed server-side and silently lost. Rather than teach the client to consume in
   batches, `grant_spin_credit_atomic` now clamps `bonus_spins` at `MAX_BONUS_SPINS = 20` (comfortably
   under 25, leaving room for one "Spin twice" chain), so the loss condition can't be reached at all.
2. **Block deleting a trigger_key-linked reason, don't expose trigger_key for editing.** A parent
   could delete the seeded "Tidy Room AI Score" reason with no warning, permanently and silently
   severing Bedroom Reset's auto-grant (its lookup is by `trigger_key`, so nothing else could ever
   find it again). `manage_spin_reasons`'s delete branch now rejects deleting a `trigger_key`-linked
   row; the manage UI shows it as "🔒 Linked" instead of a delete button. Deliberately did NOT expose
   `trigger_key` as a settable field - it's internal wiring, not something a parent needs to hand-edit.
3. **PIN-gate spin-reason deletion**, matching the existing category-delete/Reset/Kid-View-exit
   pattern - this destructive action had simply been missed when the feature was first built.
4. **Re-render the wheel when the Spin tab becomes visible.** `renderWheel()`'s wedge-label math reads
   `wheel.clientWidth`, which is 0 whenever `#spinView` has `display:none` on an ancestor - so any
   render that happened while a different tab was active (which is most of them) positioned labels for
   a hardcoded 300px fallback instead of the real `min(320px, 88vw)` wheel. Now the `modeSwitch`
   handler calls `renderWheel()` again specifically when switching to Spin, when the section is
   actually visible and can be measured correctly.
5. **Checked `res.ok` on every `manage_spin_reasons` call site** (add/update/delete), matching the
   error-toast pattern already established for the sibling `undo_reward_log`/`grant_spin_credit` flows
   in the same feature - these three had been missed.
6. **Resync instead of retry-loop on a 409.** The grant button's failure handler treated every error
   identically - on the specific `already_granted_this_period` conflict (two devices, or a manual
   grant racing Bedroom Reset's automated one), it now calls `loadState()` to flip to the real "Used"
   state instead of re-enabling a button that would just 409 again.
7. **`grant_spin_credit` now accepts `trigger_key` as an alternative to `reason_id`**, resolved
   server-side. The action's own doc comment and this feature's original design (D-2026-07-19-
   spin-credit-system) both describe it as "generic - any app can call it," but the only caller
   (Bedroom Reset) cheated by resolving `trigger_key` via direct DB access in the same file/process; a
   genuinely separate future caller had no public way to do that resolution. Now it does.
8. **Logged (not surfaced in the response) `grantSpinCredit`'s previously-discarded error** in
   `submit_photo_score`'s auto-approve branch - skips logging the benign, expected
   `already_granted_this_period` case, but a real `not_found` (e.g. a stale kid/reason at the exact
   moment of auto-approval) is no longer silently invisible.
9. **`Object.hasOwn` instead of `in`** in `spinSoundPreset()` - `in` walks the prototype chain, so a
   localStorage value like `"toString"` would pass as a "valid" preset name and later crash
   `playSpinTicks`/`playLandingChime` with a TypeError. Devtools-tampering-only in practice, but a
   one-line fix.

**Why fix the counter's atomicity instead of switching to a derived-from-rows count:** the reviewer
noted `kid_spin_credit_grants` already has full per-grant history, so `bonus_spins` could in principle
be derived (grants minus consumptions) rather than stored as a mutable counter, avoiding the race
class entirely. Not done here - the row-locked RPC fix is smaller, keeps the existing schema/API
shape, and closes the specific confirmed race without a data-model change; deriving the count is a
reasonable future refactor if more counter-style fields accumulate the same pattern, not warranted for
one column today.

**Status:** Done. Live-verified the two new RPCs directly (grant succeeds/caps correctly/rejects a
same-period repeat, consume zeroes and returns the right count) against a disposable test family, then
separately verified the deployed edge function end-to-end (`grant_spin_credit` resolving a
`trigger_key` with no `reason_id` supplied, and `manage_spin_reasons` correctly rejecting a delete on
the trigger_key-linked reason) against a second disposable family. Full Playwright regression suite
(11 files, including a new one targeting all 10 fixes) passes.
