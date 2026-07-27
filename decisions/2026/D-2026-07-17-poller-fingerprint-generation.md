# D-2026-07-17-poller-fingerprint-generation

Date: 2026-07-17
Status: Done

**Context:** While deploying the "regenerate now" fingerprint feature
(`D-2026-07-17-fingerprint-regenerate-now`), the user shared their
actual current `poller.py`. It doesn't generate or use room
fingerprints at all - `llava_score` compares the submitted photo
directly against raw reference photos every time, and never reads
`job["room_fingerprint"]`. The whole fingerprint concept had drifted to
a parent-facing-description-only field, disconnected from scoring,
some time after `D-2026-07-13`-era work assumed poller.py would use it
for matching. The "Regenerate now" button was consequently a no-op on
the worker side - nothing would ever poll for or clear a pending
request.

**Options:**
1. Add fingerprint generation to `poller.py` as new, purely additive
   code - a new prompt/function plus a second poll loop - without
   touching the existing scoring pipeline.
2. Drop the fingerprint feature entirely (columns, actions, UI) since
   poller.py's direct-comparison approach already replaced what it was
   for, and it's currently dead weight.
3. Leave it as-is and let the button silently do nothing.

**Decision:** Option 1, per the user.

**Why:** The user wants the fingerprint field to keep working as a
parent-facing description even though it no longer feeds scoring - it
still has value as something a parent can glance at to confirm which
room a kid/room target maps to. Keeping it additive (new function +
second poll, zero changes to `process_job`/`llava_score`) means zero
risk to the scoring pipeline that's actually working well.

**Status:** Done. `generate_room_fingerprint()` added (llava:13b,
JSON-schema-constrained like the rest of the file, prompt explicitly
told not to judge tidiness - purely structural description). `main()`
now also polls `get_pending_fingerprint_regenerations` and submits via
the existing `submit_room_fingerprint` action. Delivered to the user as
a file (not committed to the repo - embeds `WORKER_TOKEN`, same as
every prior `poller.py` handoff).
