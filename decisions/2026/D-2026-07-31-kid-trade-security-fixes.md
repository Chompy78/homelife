# D-2026-07-31-kid-trade-security-fixes

Date: 2026-07-31
Status: Done

**Context:** A full-repo code review of `respond_to_trade`/kid-to-kid trading (my-rewards) found two
related real bugs:

1. `respond_to_trade`'s accept path did a read-then-many-writes-then-write-status sequence, with
   the final `kid_reward_trades` status update having no `.eq("status", "pending")` guard - unlike
   `submit_photo_score` elsewhere in the same file, which guards its own terminal status update for
   exactly this reason. Two concurrent accept requests for the same trade (a double-tap, or a
   client retry after an ambiguous slow response) could both pass every check and both insert their
   `kid_reward_log` rows, duplicating the point transfer.
2. `set_kid_verify_image` unconditionally cleared `verify_fail_count`/`verify_locked_until` whenever
   a kid set a new secret picture - including while already locked out. A kid locked out from wrong
   guesses on `respond_to_trade` could immediately pick a new secret to wipe the lockout and retry,
   fully defeating it. Confirmed exploitable (not just theoretical) by reading the live handler.

**Options (per issue):**
- *Double-accept:* (a) leave the final status update unguarded and rely on the balance recheck
  alone - rejected, the balance check happens before the race window, not during it; (b) guard the
  final update the same way `submit_photo_score` does, in the same position (last) - insufficient
  here because the side effect (`kid_reward_log` insert) lives on a *different* table than the
  guarded row, so a losing request would already have inserted its ledger rows before discovering it
  lost; (c) **move the guarded, atomic claim (`.eq("status","pending")` compare-and-swap) to
  *before* the `kid_reward_log` inserts**, so a losing request never reaches them at all. **Chosen.**
- *Lockout bypass:* (a) leave `set_kid_verify_image` as-is and only add a client-side guard on the
  "change secret" link - rejected, doesn't close the actual server-side hole, only hides the UI
  path to it; (b) **block `set_kid_verify_image` entirely while `verify_locked_until` is in the
  future**, returning the same `{error:"locked"}` shape `respond_to_trade` already uses. **Chosen**,
  plus the matching client-side guard (so the UI doesn't even offer the option) for a coherent UX.

**Why:** Both fixes follow the same principle already established elsewhere in this file
(`grant_spin_credit_atomic`'s row lock, `submit_photo_score`'s guarded terminal update): a
security-relevant state transition must be verified *at the moment of the transition*, not inferred
from an earlier read. Ordering the trade claim before its side effects, and blocking the secret
change during an active lockout, both close their respective gaps completely rather than only
reducing their likelihood.

**Status:** Done. `family-api/index.ts`'s `respond_to_trade` and `set_kid_verify_image` updated and
redeployed; `apps/my-rewards/app.js` updated (`already_resolved` error handling for the trade race;
a matching lockout check on the "change secret" link).
