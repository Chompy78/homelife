# D-2026-08-02-wire-fingerprint-into-scorer

Date: 2026-08-02
Status: Done

**Context:** `D-2026-07-16-room-fingerprint` decided to generate a
permanent, structural-only room fingerprint specifically so the
scorer's room-match step could stop comparing raw photos directly
(bedding included) and instead compare against fingerprint text,
fixing a false-rejection where a kid's own room got rejected over
ordinary bedding differences. `D-2026-07-17-poller-fingerprint-generation`
recorded that this never actually happened: fingerprint generation was
added to `poller.py` as new, additive code, wired only to the
dashboard's on-demand "Regenerate now" flow, and `SCORER_PROMPT` /
`llava_score()` kept comparing the submitted photo directly against
raw reference photos for room-match - untouched. This drift sat
undiscovered in this project's own documentation (`TASK_BOARD_NOW.md`
described the fingerprint as already feeding the scorer) until reading
the user's actual live `poller.py` this session
(`D-2026-08-02-fingerprint-prompt-permanence-tightening`) confirmed it
directly. The user then asked to close this gap for real.

**Options:**
1. Leave scoring as raw-photo room-match and treat the fingerprint as
   permanently parent-facing-only, accepting the original
   bedding-false-rejection risk remains live in scoring.
2. Wire the fingerprint into `SCORER_PROMPT`'s room-match step as
   `D-2026-07-16-room-fingerprint` originally intended: `llava_score()`
   takes the fingerprint text as an additional input, Step 1 (room
   match) compares the submitted photo against that text instead of
   the reference photos, Step 2 (tidiness) keeps comparing against the
   reference photos as before. Generate the fingerprint lazily inside
   `process_job()` on a target's first-ever scored submission if one
   isn't cached yet (mirroring the lazy-generation design already
   written into `TASK_BOARD_NOW.md` for a step that was never actually
   built), reusing the same `generate_room_fingerprint()` the
   dashboard's on-demand flow already calls.

**Decision:** Option 2 - the user asked for it directly.

**Why:** This closes the actual gap the fingerprint feature was built
to close in the first place; leaving it as parent-facing-only text
(option 1) keeps the original bug live in real scoring, which defeats
the point of having built the fingerprint at all. No edge function or
schema change is needed - `get_pending_photo_scores` in
`family-api/index.ts` already returns `room_fingerprint` per job
(confirmed by reading the live source), so this was purely a
`poller.py`-side wiring gap.

**Status:** Done, pending live confirmation. `llava_score()` now takes
a `fingerprint` argument and substitutes it into `SCORER_PROMPT` via
`str.replace()` (not `str.format()` - the prompt's JSON examples
contain literal `{ }` that would collide with format-string syntax).
`process_job()` now reads `job["room_fingerprint"]`; if absent, it
requires `job["reference_photos"]` to be non-empty (rejecting with "ask
a parent to add reference photos first" if not), generates one via the
existing `generate_room_fingerprint()`, submits it via
`submit_room_fingerprint` to cache it, and uses it for that job.
Diffed the edited file against the version delivered under
`D-2026-08-02-fingerprint-prompt-permanence-tightening` to confirm the
scope of the change, verified it compiles (`py_compile`), and
delivered it back to the user to drop in over their real `poller.py`.
Corrected `TASK_BOARD_NOW.md`'s fingerprint-pipeline design notes
(previously fixed to say "not wired in" earlier this session - now
flipped back to describe the real wiring) and closed out the "known
open risk" paragraph that flagged this gap. Needs: the user replaces
`poller.py` with the delivered version and live-confirms (a) a first
scored submission for a target with no cached fingerprint generates
one and scores correctly, (b) a real photo of a kid's own room with
different bedding than the reference photos is not falsely rejected,
and (c) a genuinely different room is still rejected.
