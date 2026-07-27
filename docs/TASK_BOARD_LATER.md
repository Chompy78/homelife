# Task Board — LATER

Open work only — see `CHANGELOG.md` for what's already shipped and
`DECISIONS.md` for why non-obvious choices were made. Every task
carries enough detail (tags, status, a concrete "done when") that it
can be picked up cold — by an AI assistant or a human — without
re-deriving the design. Bigger tasks also carry a **Design notes**
block with the technical detail (schema, files, endpoints) needed to
actually build them.

**Tags in use:** `ai-vision`, `prompt`, `validation`, `feature`, `ux`,
`infra`, `refactor`, `migration`. Reuse these rather than inventing
near-duplicates, so the list stays scannable by tag.

**Status values:** `open` (not started) · `in-progress` · `blocked`
(needs something external, e.g. a person/service) · `done`.

Split from `docs/TASK_BOARD.md` on 2026-07-28 by its existing NOW/NEXT/LATER bands. Read when the task at
hand needs it — never pruned, kept in full indefinitely.

---

## 🟢 LATER

### Cap stored AI-scoring photos per kid and per family
- **Tags:** infra, feature
- **Status:** open
- Reference photos are capped at 3 per kid/room and cleaned up when a
  parent removes one, but AI-scoring submission photos
  (`photo_score_requests` + their storage objects) have no cap and are
  never cleaned up - every "Score my room" attempt, scored or rejected,
  keeps its photo in storage forever. Not urgent at current usage (each
  photo is roughly 60-150KB, client-compressed), but genuinely
  unbounded - a family scoring daily accumulates thousands of small
  files with no ceiling over time. Now that submissions have a visible
  thumbnail (parent dashboard inline line, history modal, kid app
  current-score card), any cap needs to decide whether to keep the row
  but drop the file (older history entries still show score/comment/date,
  just no thumbnail) or prune the row entirely (loses the history entry).
- **Done when:** a per-kid (and/or per-family) cap on retained
  AI-scoring submission photos is enforced - either a rolling "keep the
  last N" cleanup triggered on each new submission, or a scheduled job
  pruning anything past a set age/count - and pruned entries degrade
  gracefully in the UI rather than showing a broken thumbnail.

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

### Port remaining apps (bedroom-reset, parent-dashboard, reward-tracker, leaderboard) using the migration template
- **Tags:** feature, migration
- **Status:** blocked (needs Migration M8 done)
- Break this into one task per app once the Migration M8 template exists -
  not detailed further yet since it depends entirely on what that template
  produces. Android-only until Migration iOS-3 passes; add an iOS build
  per app once it does.
- **Done when:** all 4 remaining apps are ported, PWA-enabled, and
  Capacitor-wrapped (Android, and iOS once cleared) using the M8 template.
