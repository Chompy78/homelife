# D-2026-07-16-layered-anti-cheat-checks

Date: 2026-07-16
Status: Open

**Context:** Live testing on the user's real Ubuntu/Ollama box (after
fixing an unrelated model-tag mismatch, `llava` vs `llava:13b`)
surfaced that the single consolidated prompt did not reliably reject
an obviously-invalid photo - a flat-lay of shoes on outdoor pavement
was scored as if it were a messy bedroom, inventing feedback about
shelves and closets that weren't in the photo. This isn't a prompt
wording bug so much as a real capability limit: small/older vision
models are known to be inconsistent at refusing to answer versus
guessing, and no amount of prompt tweaking reliably fixes that.

**Options:**
1. Keep iterating on the prompt wording alone, hoping to find phrasing
   `llava:13b` follows more reliably.
2. Try a bigger/different vision model - more capable, but a
   multi-gigabyte download of uncertain fit for the user's hardware,
   and no guarantee of actually fixing this class of failure.
3. Run the same compound question multiple times and vote - helps with
   *inconsistent* answers, not *consistently wrong* ones, and this
   failure looked confident and consistent, not wavering.
4. Add cheap, deterministic (no-AI) checks in front of the model for
   the failure modes that don't actually need visual judgment - blank/
   blurry photos (measurable directly from pixel data) and reused
   photos (a perceptual-hash comparison against the target's last
   scored photo) - so the model is only asked the judgment calls that
   genuinely need a vision model, narrowing what it has to get right.

**Decision:** Option 4, layered in front of the existing prompt (which
still handles room-type/room-matching, since those genuinely do need
visual judgment).

**Why:** Options 1-3 all still route every photo through the same
model for the same broad judgment call, so none of them address the
actual failure mode - a model that doesn't hedge on out-of-distribution
input. Option 4 doesn't try to make the model more reliable at things
it's bad at; it removes two whole categories of check (blank/blurry,
reused) from the model's job entirely, since those are measurable
facts, not judgment calls, and a deterministic check can't hallucinate.
That leaves the model responsible only for what actually requires
seeing and understanding an image (is this the right room, is it
tidy) - a narrower, more honest scope for what a local 13B vision
model can be trusted with.

**Status:** Repo side (schema `photo_hash` column, edge-function
plumbing) deployed as edge function v10, verified via Node script.
`poller.py` rebuilt with the layered pipeline and delivered to the
user - confirming the blank/blur and duplicate checks live, and
re-testing the AI layer's room-validity judgment specifically, is not
yet done (see `docs/TASK_BOARD.md`). The underlying model-capability
limitation is not "solved," only narrowed in scope - flagged as an
open risk for the `auto_approve` mode specifically.
