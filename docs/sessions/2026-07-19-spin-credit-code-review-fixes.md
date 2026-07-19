# 2026-07-19 — Code review of the spin-credit system, and fixing all 10 findings

**Focus:** Run a thorough multi-angle code review of the spin-credit feature shipped earlier the same
day, verify every candidate finding, then fix everything that survived verification.

## Timeline

- User asked for a code review of the just-shipped spin-credit/bug-fix commit. Ran the `code-review`
  skill at high effort: 8 independent finder agents (3 correctness angles, 3 cleanup angles, an
  altitude angle, a conventions angle) against the diff, each surfacing up to 6 candidates.
- Notably, three separate finder agents (a line-by-line scan, a cross-file tracer, and an altitude
  check) independently converged on the same root cause from different angles: `grantSpinCredit` and
  `consume_bonus_spins` both did a plain SELECT-then-UPDATE on `kids.bonus_spins` with no row lock or
  transaction, letting concurrent calls interleave and silently lose or wipe an increment. That kind of
  convergence from independent angles is a strong signal a finding is real.
- Deduped down to 12 distinct candidates and ran one verifier agent per candidate (each reading the
  actual live file, not just the diff, and reasoning about realistic trigger scenarios). 11 CONFIRMED,
  1 REFUTED - a candidate about `manage_spin_reasons`'s delete potentially orphaning
  `kid_spin_credit_grants` rows was refuted by directly querying the live database's FK constraints,
  which showed `ON DELETE CASCADE` already handles it correctly.
- Reported the 10 confirmed findings (one dropped from the 11 since two verifier results described the
  same underlying issue from slightly different framings) via `ReportFindings`, ranked most severe
  first. User asked to fix them all.
- Fixed all 10:
  1/2. New migration adding `grant_spin_credit_atomic`/`consume_bonus_spins_atomic` Postgres functions
     (`SELECT ... FOR UPDATE` row lock around the whole check+insert+increment/zero sequence), plus a
     `MAX_BONUS_SPINS = 20` clamp baked into the grant function so a kid's bonus count can never exceed
     what the client's 25-spin safety cap can actually redeem in one chain.
  3. `manage_spin_reasons`'s delete branch now rejects deleting a `trigger_key`-linked reason; the
     manage UI shows those rows as "🔒 Linked" with no delete button.
  4. Wrapped the spin-reason delete handler in `requirePin(...)`, matching the category-delete pattern.
  5. `modeSwitch`'s click handler now calls `renderWheel()` again specifically when switching to the
     Spin tab, so wedge labels are sized from the wheel's real rendered width instead of a stale
     0-width-triggered 300px fallback.
  6. Added `res.ok` checks + `showErrorToast` to all three `manage_spin_reasons` frontend call sites.
  7. The grant button's failure handler now distinguishes `already_granted_this_period` (resyncs via
     `loadState()`) from a generic failure (re-enables for a retry).
  8. `grant_spin_credit` now accepts a `trigger_key` param, resolved server-side to a `reason_id` -
     previously only Bedroom Reset's in-process direct-DB-access call could use trigger_key at all,
     contradicting the action's own "generic, any app can call it" documentation.
  9. `submit_photo_score`'s auto-approve branch now logs (not surfaces in the response) a genuine
     `grantSpinCredit` failure, skipping the benign/expected `already_granted_this_period` case.
  10. `spinSoundPreset()` uses `Object.hasOwn` instead of the prototype-chain-walking `in` operator.
- Deployed the updated edge function via a background subagent (byte-diff verified, version 32,
  active) while writing and running new/updated Playwright tests in parallel.
- Wrote a new targeted test (`test_review_fixes.js`) covering the wheel-label sizing fix, the
  grant-button resync fix, and the trigger_key lock/PIN-gate fixes together, plus updated
  `test_spin_weight.js` (sound preset rename) and `test_spin_reasons.js` (now needs the PIN modal
  before the delete confirm) for regressions the fixes themselves caused in the test setup, not the app.
  Full 11-file suite passes.
- Live-verified the two new RPCs directly via SQL against a disposable test family (`RPC Test`/kid
  `Rex`): a grant succeeds and increments, a second grant for the same reason within the period is
  rejected, the cap correctly clamps at 20 even when a fresh reason's grant would otherwise push it to
  21, and consume correctly zeroes and returns the prior count.
- Live-verified the deployed edge function's new behavior against a second disposable family (`Fix
  Verify`/kid `Vee`): `grant_spin_credit` called with only a `trigger_key` (no `reason_id`) correctly
  resolves and grants; `manage_spin_reasons` correctly rejects deleting the trigger_key-linked reason
  with `reason_linked_to_another_app`.
- A stop hook flagged uncommitted changes mid-session (while a deploy was still running in the
  background) - did a quick RPC-level SQL sanity check first (since that's independent of the edge
  function redeploy finishing), then proceeded to write docs and commit/push once the deploy
  completed and the full-stack checks passed too.

## Files touched

- `supabase/functions/family-api/index.ts` (deployed, version 32)
- Migrations: `add_atomic_bonus_spins_rpcs`, `fix_grant_spin_credit_atomic_window`,
  `drop_stale_grant_spin_credit_overload`
- `apps/reward-tracker/{app.js,service-worker.js}`

## Related

- `D-2026-07-19-spin-credit-code-review-fixes`
- CHANGELOG.md, 2026-07-19 entry

## Carried forward

- Nothing left open from this review pass. The cleanup/reuse/efficiency findings the finder agents also
  surfaced (duplicated CRUD scaffolding across `manage_spin_reasons`/`manage_reward_categories`/
  `manage_reward_notes`, a sequential-instead-of-parallel round trip in `get_reward_state`, an
  unbounded `kid_spin_credit_grants` table scan) were not part of the 10 reported/confirmed findings
  this pass fixed - they're real but lower-priority, worth a future pass if this file's growth starts
  to hurt.
