# D-2026-07-16-gate-scorer-split

Date: 2026-07-16
Status: Done

**Context:** The layered pipeline from `D-2026-07-16-layered-anti-cheat-checks`
still had the `llava:13b` vision-model step doing one compound job -
decide if the photo is valid, and if so, score it - in a single
prompt/completion. A second opinion was sought from three independent
outside reviews. All three converged on the same root-cause diagnosis,
different from the "OOD detection" framing used up to that point: this
is "completion bias" (sometimes called sycophancy) - asking one model
call to both gatekeep *and* perform a task biases it toward performing
the task even on input that should be rejected, because the model has
a strong prior toward completing the pattern it's given rather than
refusing. All three also converged on the same fix, independently.

**Options:**
1. Keep iterating on the single compound prompt's wording (more
   examples, stricter language, chain-of-thought instructions inside
   the same call).
2. Split into a perception-only gate call (reports observed evidence,
   never a self-asserted `valid` boolean) followed by a separate scorer
   call, with plain code - not the model - deciding pass/fail from the
   gate's evidence fields. Add a cheap `moondream` pre-gate ahead of
   that for the clear-cut cases, and switch to Ollama's `format`
   JSON-schema parameter (constrained output) instead of parsing JSON
   out of prose.

**Decision:** Option 2.

**Why:** Option 1 keeps the same structural problem - the model still
has an incentive to bias toward "yes, this is scoreable" as long as
it's the one deciding whether to continue. Removing the model's ability
to make that call at all (report evidence, let code apply the rule) is
a categorically different fix, not a stronger version of the same one.
The `format` JSON-schema switch is a straightforward correctness
improvement (constrained output beats regex-extracting from prose)
adopted regardless of the rest. The `moondream` pre-gate reuses a model
already pulled, at zero extra dependency cost, and only auto-rejects on
a *confident* no - it's a cheap first pass, not a sole authority.

**Status:** Done - `poller.py` rebuilt with this architecture and
delivered to the user (not committed to this repo - it embeds
`WORKER_TOKEN`). Not yet confirmed against the real worker (see
`docs/TASK_BOARD.md`, 🔴 NOW). Several other ideas surfaced by the same
review round (a deterministic scene-classifier gate, reference-photo
embedding similarity, evaluating newer local VLMs, a daily anti-cheat
capture token, a parent-review state) were deliberately not built this
round - logged as 🟢 LATER tasks rather than expanding scope further
before confirming this round actually works.
