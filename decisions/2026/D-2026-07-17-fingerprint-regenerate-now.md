# D-2026-07-17-fingerprint-regenerate-now

Date: 2026-07-17
Status: Done

**Context:** Room fingerprints regenerate lazily - only as a side effect of
the worker processing a submitted photo-scoring job. A parent clicking
"Clear (let AI regenerate)" therefore sees nothing happen until a kid
next submits a photo, which reads as broken (see the same-day fix for
the confirm-modal stacking bug reported in the same flow). User asked
for an explicit "regenerate now" action that doesn't wait for a kid.

**Options:**
1. Have the parent dashboard call the AI worker directly somehow (e.g. a
   webhook to the home server). Not viable - the home server has no
   public inbound endpoint, and exposing one just for this would be a
   real new attack surface for a cosmetic convenience feature.
2. Add a `room_fingerprint_regen_requested_at` timestamp column, set by
   a new parent-facing action, and a new worker-polled endpoint
   (`get_pending_fingerprint_regenerations`) that the worker checks
   alongside its existing photo-scoring poll. `submit_room_fingerprint`
   (already used by the lazy path) clears the timestamp when a fresh
   fingerprint lands, so both paths converge on the same completion
   signal.

**Decision:** Option 2.

**Why:** Keeps the pull-only architecture from
`D-2026-07-13-service-role-session-auth` intact - the cloud still never
reaches into the home network, the worker still just polls a bit more
often. A timestamp (not a boolean) doubles as "how long has this been
pending" for free, and reusing `submit_room_fingerprint` as the single
completion signal means no new worker-side concept for "which kind of
job just finished" - a fresh fingerprint value satisfies either an
explicit request or a lazy one.

**Status:** Done on the Supabase side. Migration
`room_fingerprint_regen`, new actions `request_fingerprint_regeneration`
(parent-gated, requires ≥1 reference photo, resets and unlocks the
fingerprint same as Clear) and `get_pending_fingerprint_regenerations`
(worker-gated, self-heals a request whose reference photos got deleted
before the worker got to it rather than looping on it forever).
`submit_room_fingerprint` now clears the timestamp on any successful
write. Parent dashboard shows a pending state (disabled buttons,
"⏳ Regeneration requested...") and polls every 8s for up to ~3 minutes
while the modal is open, swapping in the new fingerprint the moment it
lands. Deployed as edge function v19, verified via Node script and
Playwright (including simulating the worker's completion mid-poll by
writing the DB row directly, since the real `WORKER_TOKEN` isn't
available in this session and regenerating it would break the user's
live worker). `poller.py` itself - the actual new polling loop and
fingerprint-only generation call - still needs updating; the user's
current copy isn't in this session's context (never committed, embeds
the token), so it needs to come from them before it can be edited
precisely rather than reconstructed from memory.
