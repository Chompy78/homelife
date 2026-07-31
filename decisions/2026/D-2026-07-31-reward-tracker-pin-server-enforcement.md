# D-2026-07-31-reward-tracker-pin-server-enforcement

Date: 2026-07-31
Status: Done

**Context:** A full-repo code review found that reward-tracker's PIN-lock UI (`requirePin()` -
delete a category, delete a spin reason, Reset) was purely client-side. The mutating edge-function
actions themselves only checked `session.role === "parent"`, identical to every other
parent-session action - nothing tied the call back to a successful `verify_pin` check. Per
AGENTS.md's security boundary rule, this is exactly the "client-side UI restriction alone" pattern
that's explicitly called out as insufficient: anyone holding a valid parent session token (e.g. a
kid with access to an already-unlocked parent device, using devtools to call the API directly)
could skip the PIN screen entirely.

**Options:**
1. Leave it client-side-only - rejected, directly violates AGENTS.md's stated security posture.
2. Require the PIN/icons proof inline on every protected call (like `respond_to_trade`'s image
   field), with no "5 minute unlock" convenience - rejected: this silently breaks the existing,
   deliberately-designed UX (`PIN_UNLOCK_MS` / "An unlock lasts 5 minutes", documented in the
   Settings UI copy) without any product conversation about removing it.
3. Track a server-side "PIN recently verified until" timestamp per session, updated on each
   `verify_pin` call - workable, but adds new session-table state and doesn't address the fact
   that "PIN protection" itself was already a **per-device, `localStorage`-only** toggle
   (`pinProtectionOn()`) that the server had zero knowledge of - a family that had actually turned
   the feature off would start getting rejected.
4. Make PIN protection a **real per-family setting** (`families.pin_protection_enabled`, default
   true), and have the client remember the exact `{pin}`/`{icons}` payload that last passed
   `verify_pin()` (already tracked in-memory as part of the existing 5-minute unlock window) so it
   can re-attach that same proof to every protected call within the window. The edge function
   independently re-verifies it via a new `requireRecentPinIfEnabled()` helper - `verifyParentSecret()`
   unless the family has opted out. **Chosen.**

**Why:** Option 4 closes the actual gap (a bare parent token is no longer sufficient for
`reset_reward_history`/category-delete/spin-reason-delete) while preserving the exact existing UX
(same 5-minute unlock, no extra prompts) and, as a side effect, fixes a latent correctness issue
too: the old per-device toggle meant two devices on the same family could disagree about whether
PIN protection was even on. Making it family-wide and server-tracked is strictly more correct, not
just more secure. `get_family_auth_method` was extended to return `pin_protection_enabled` so the
client's Settings toggle reflects the real value on load; `update_family_settings` (already a
generic per-family patch action) gained the field rather than adding a dedicated endpoint.

**Why not enforce during the PIN modal round-trip itself:** the modal's own `verify_pin` call
already re-verifies server-side (unchanged) - the gap was specifically that a *second*, separate
API call (the actual delete/reset) trusted the modal having been shown at all, rather than trusting
its own verification of the proof. Fixing it required the destructive action's own handler to
verify, not the modal's.

**Status:** Done. Migration `add_pin_protection_enabled_to_families` applied; `family-api/index.ts`
updated (`requireRecentPinIfEnabled`, `get_family_auth_method`, `update_family_settings`, the three
destructive actions) and redeployed; `apps/reward-tracker/app.js` updated to thread the proof
through and sync the toggle server-side. Verified live against a disposable test family: delete
without PIN correctly rejected, with correct PIN accepted, and toggling protection off correctly
allows the unprotected path.
