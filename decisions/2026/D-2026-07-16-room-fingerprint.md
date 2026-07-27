# D-2026-07-16-room-fingerprint

Date: 2026-07-16
Status: Done

**Context:** After the gate/scorer split shipped, live testing surfaced a
new failure - the opposite direction from the earlier ones. A real photo
of the kid's own actual room got rejected by the scorer's room-match
step with a reason citing bedding pattern, flooring, and wall-color
differences. The room-match check compares the submission against raw
reference photos on every request (per the earlier
`D-2026-07-16-ai-anti-cheat-simplification` reasoning); bedding/linens
naturally look different from day to day - that's the whole point of a
tidiness check - but the model was treating that surface-level
difference as evidence of a different room entirely.

**Options:**
1. Tighten the room-match prompt wording (clarify "same bed" means the
   frame/furniture, not the linens) and hope the model reliably
   distinguishes structural identity from surface appearance on every
   comparison, against every reference photo, every time.
2. Move room-identity matching off raw photo comparison entirely: have
   a parent's reference photos produce one written "fingerprint" -
   fixed/structural features only (walls, flooring, windows, fixed
   furniture), explicitly excluding anything that's supposed to change
   between messy and tidy - generated once, cached, and reused for
   every future room-match check instead of re-deriving it from noisy
   raw images each time.

**Decision:** Option 2 - this directly reverses the "no stored
fingerprint" call from `D-2026-07-16-ai-anti-cheat-simplification`.

**Why:** Option 1 is the same category of fix that's already failed
twice this session (asking the model to reliably apply a subtle
distinction on every single call, under time/token pressure, with no
structural guarantee it does so consistently). Option 2 removes the
noisy signal (bedding) from the comparison entirely, by construction,
rather than hoping the model correctly discounts it every time. It also
only costs one extra model call per reference-photo-set (not per
submission) since the fingerprint is generated once and cached -
cheaper in aggregate, not more expensive. The earlier reasoning for
skipping a fingerprint ("the model already gets reference photos in
every request, no need to precompute") assumed raw-photo comparison
would work reliably; that assumption is what live testing disproved.

**Status:** Done. Migration adds `room_fingerprint` to `kids` and
`family_rooms` (null = needs (re)generation), invalidated automatically
whenever reference photos change via `upload_reference_photo` /
`delete_reference_photo` / `upload_family_room_photo` /
`delete_family_room_photo`. New worker-token-gated
`submit_room_fingerprint` action stores it; `get_pending_photo_scores`
returns the current value (or `null`) per job. Deployed as edge
function v11, verified via Node script (8 checks: pre-seeded value
returned, invalidation on upload, invalidation on delete, fresh
submission stored and returned, bad-input and wrong-token rejected).
`poller.py` generates a fingerprint lazily on first use per
kid/room and reuses it thereafter; reference photos are still sent to
the scorer for the separate tidiness-comparison step, only the
room-identity check moved to fingerprint text. Delivered to the user;
live confirmation that it actually stops the bedding false-rejection is
pending.
