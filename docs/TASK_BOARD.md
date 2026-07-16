# Task Board

Open work only — see `CHANGELOG.md` for what's already shipped and
`DECISIONS.md` for why non-obvious choices were made. Every task
carries enough detail (tags, status, a concrete "done when") that it
can be picked up cold — by an AI assistant or a human — without
re-deriving the design. Bigger tasks also carry a **Design notes**
block with the technical detail (schema, files, endpoints) needed to
actually build them.

**Tags in use:** `ai-vision`, `prompt`, `validation`, `feature`, `ux`,
`infra`, `refactor`. Reuse these rather than inventing near-duplicates,
so the list stays scannable by tag.

**Status values:** `open` (not started) · `in-progress` · `blocked`
(needs something external, e.g. a person/service) · `done`.

---

## 🔴 NOW

### Confirm the layered anti-cheat pipeline on the real worker
- **Tags:** ai-vision, prompt, validation
- **Status:** in-progress
- `poller.py` is now a 5-layer pipeline, cheapest/most-reliable checks
  first — see Design notes. This is the third iteration of the AI-layer
  design: the first (one compound "validate then score" prompt) failed
  live-testing - `llava:13b` scored a photo of shoes on outdoor pavement
  as if it were a messy bedroom rather than rejecting it. A second
  opinion was sought (three independent reviews, converging on the same
  root cause) - the failure is a known VLM behavior where asking one
  model call to both gatekeep *and* perform a task biases it toward
  performing the task even on nonsensical input ("completion bias").
  The fix: never let the model self-report `valid: true/false` for a
  decision it has an incentive to bias; have it report only observed
  evidence, and let plain code apply the pass/fail rule.
- **Done when:** on the real worker, confirm each layer actually fires
  correctly: (a) blank/blurry rejected with no Ollama call at all
  (check the log for "no AI needed"), (b) a resubmitted photo rejected
  as a duplicate, (c) `moondream` correctly fast-rejects an obviously
  non-room photo, (d) the `llava:13b` gate rejects a room-shaped-but-
  wrong photo the pre-gate didn't catch, (e) a real tidy-room photo
  still comes back scored with 3 specific actions.

<details>
<summary>Design notes</summary>

**Layer order, cheapest and most trustworthy first:**
1. **Blank/blurry check** (`local_quality_check`, no AI) - grayscale
   pixel standard deviation catches blank/near-solid-color photos; a
   Laplacian (edge-detection) filter's variance catches blur. Direct
   measurements, not judgment calls.
2. **Reused-photo check** (`duplicate_check`, no AI) - a perceptual
   hash (`imagehash.average_hash`) compared against the target's last
   *scored* photo's hash (`photo_hash` column, round-tripped through
   `get_pending_photo_scores` as `previous_photo_hash`, stored via
   `submit_photo_score` on both scored and rejected rows -
   `getLatestPhotoHash` only ever looks at the last *scored* row, so a
   rejected submission's hash can never become the comparison point).
3. **`moondream` pre-gate** (cheap AI) - a narrow yes/no "is this
   indoors, showing a room?" Only auto-rejects on a *confident* no;
   anything else (yes, or low/medium-confidence no) falls through to
   the fuller gate rather than being trusted outright, since it's a
   much smaller model.
4. **`llava:13b` room-validity gate** - perception only. The model
   reports `literal_visible_items` / `room_evidence` /
   `invalid_evidence` / `confidence` - it is never asked for a bare
   `valid` boolean. Code decides: valid only if `setting ==
   "indoor_room"`, confidence is `"high"`, `room_evidence` has ≥2
   items, and `invalid_evidence` is empty. Includes few-shot examples
   of invalid photos (shoes on pavement, a dog, a close-up object) and
   runs at `temperature: 0`.
5. **`llava:13b` scorer** - only reached if all four above pass. Two
   jobs: confirm the photo matches the target's *own* reference photos
   (not just "a room" - catches e.g. a sibling's room), then score
   tidiness 1-10 with explicit ranges and write one encouraging
   sentence + exactly 3 specific actions.

All Ollama calls use the `format` JSON-schema parameter (constrained
output) instead of asking for JSON in prose and regex-extracting it -
more robust than the first iteration's approach.

**Why no stored "room fingerprint":** every scoring request already
returns the room's reference photos alongside the submitted photo, so
the scorer can judge "is this the same room" directly in the same call.

**Why a real `rejected` status instead of `score: 0`:** the schema
already allowed `status = 'failed'` and nothing ever set it - a real
status is clearer than teaching every consumer of `ai_score` that `0`
is a special sentinel.

**Freshness validation** (deployed - migration
`photo_score_freshness_and_rejection`): client-side compression
(`apps/shared/image.js`) strips EXIF, so the kid app captures
`file.lastModified` *before* compression and sends it as
`photo_taken_at`; rejected server-side if missing or >24h old.

**Known open risk:** the two no-AI layers are solid (direct
measurements, can't hallucinate). The AI layers are now narrower in
scope than before (the gate never decides validity itself, only
reports evidence), but this narrows the risk rather than eliminating
it - it's still ultimately vision-model judgment underneath the
software rule. Low-stakes for `informational`/`nudge` modes (a parent's
still in the loop); worth being cautious about before relying on
`auto_approve` for a family. See 🟢 LATER below for further hardening
ideas that were deliberately deferred rather than built into this
round.
</details>

---

## 🟢 LATER

### Chooseable/uploadable custom icon per kid
- **Tags:** feature, ux
- **Status:** open
- Kids currently pick from a fixed emoji avatar list. Letting a parent
  upload or a kid choose a genuinely custom icon/photo is a nice-to-have,
  not requested yet.
- **Done when:** a parent can set a custom image as a kid's avatar and
  it shows consistently across the dashboard and leaderboard.

### Deterministic scene-classifier as the very first gate
- **Tags:** ai-vision, validation, infra
- **Status:** open
- Repeatedly identified (independently, by three outside reviews) as
  the single highest-ROI addition: a tiny pretrained CNN classifier
  (indoor/outdoor, or a Places365-style scene classifier) running
  *before any Ollama call at all*. No hallucination risk since it's not
  generative - just a probability distribution over scene classes. The
  shoes-on-pavement test photo would have been caught here with zero
  AI-judgment involved. Deliberately not built this round: needs
  sourcing a suitable small pretrained model plus a lightweight
  inference runtime (e.g. `onnxruntime`), which is a genuinely new kind
  of dependency for this project, not a prompt/schema change.
- **Done when:** an outdoor or clearly-non-room photo is rejected by
  this classifier alone, before `moondream` or `llava` are ever called.

### Reference-photo similarity via image embeddings
- **Tags:** ai-vision, validation
- **Status:** open
- A pretrained image-embedding model (CLIP/SigLIP/DINOv2 family) run
  once per reference photo and once per submission, compared via cosine
  similarity. Complements the existing perceptual-hash duplicate check
  (which catches "the exact same photo") by catching "a photo that
  isn't even the same *kind* of place" - would likely flag the shoes
  photo as low-similarity to the room's reference cluster without
  needing any generative model judgment at all. Lighter to add than the
  scene-classifier idea above (no fine-tuning needed, just a pretrained
  embedding extractor), but still a new dependency.
- **Done when:** a submission with low embedding similarity to a
  target's reference photos is flagged or rejected before scoring.

### Evaluate newer local vision models as gate/scorer
- **Tags:** ai-vision
- **Status:** open
- `llava:13b` works but is an older architecture. Worth benchmarking
  `llama3.2-vision:11b` and `minicpm-v` (the latter specifically noted
  for lower hallucination rates on Object HalBench - directly relevant
  to this project's failure mode) as drop-in replacements for either
  the gate or the scorer, once the current layered pipeline's reliability
  is established as a baseline to compare against. Not done this round
  per the same reasoning three independent reviews converged on: test
  whether the *architecture* fix (gate/scorer split) already solves
  this before spending a multi-GB download on a model swap.
- **Done when:** at least one alternative model has been run against a
  small curated test set (a handful of valid and deliberately-invalid
  photos) and compared against the current `llava:13b` pipeline's
  false-accept rate.

### Daily capture-flow anti-cheat token
- **Tags:** feature, ux
- **Status:** open
- Idea from outside feedback: have the parent dashboard show a daily
  random word/color/object, and require it to be visible in the
  submitted photo (e.g. "put the blue card on the bed"). Makes reusing
  an old photo far harder regardless of how good the AI checks are,
  since a fixed old photo can't satisfy a per-day-changing physical
  requirement. Real product/UX scope (parent needs to see and possibly
  set the token, kid needs on-screen instructions), not a backend
  tweak - deliberately not built this round.
- **Done when:** a kid can't get a photo scored without the current
  day's token visible in frame, and a parent can see what today's
  token is.

### Parent-review state for uncertain AI scores
- **Tags:** feature, ux
- **Status:** open
- Currently every submission ends as either `scored` or `failed`
  (binary). A third state - route low-confidence or ambiguous results
  to an explicit "needs a parent to look" queue, rather than forcing a
  binary auto-decision - was suggested as a more conservative default,
  especially relevant for `auto_approve` mode. Real new status/UI
  surface (not just a prompt change), deliberately deferred.
- **Done when:** a low-confidence AI result shows up somewhere a parent
  can review and manually resolve it, distinct from a normal score.
