# Task Board

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

---

## 🔴 NOW

### Confirm the fingerprint-based pipeline on the real worker
- **Tags:** ai-vision, prompt, validation
- **Status:** in-progress
- `poller.py` is now on its fourth iteration - see Design notes for the
  full layer order and the failure each iteration fixed. The two most
  recent rounds: (1) a gate/scorer split after `llava:13b` scored an
  obviously-wrong photo (shoes on pavement) instead of rejecting it -
  root cause was "completion bias" (a model asked to both gatekeep and
  perform a task in one call biases toward performing it), fixed by
  never letting the model self-report `valid: true/false`, only
  evidence, with code applying the pass/fail rule; (2) a room
  **fingerprint** system after the fix from (1) surfaced the opposite
  failure - the scorer's room-match step rejected the kid's own real
  room because the bedding looked different from the reference photos.
  Comparing raw photos every time meant normal day-to-day bedding
  variation (the whole point of a tidiness check) got read as "a
  different room." A fingerprint - a one-time, structural-only
  description (walls, flooring, windows, fixed furniture, explicitly
  *not* bedding/linens) generated once per kid/room and reused - fixes
  this by removing the noisy signal from the comparison entirely rather
  than hoping the model discounts it correctly every time.
- **Done when:** on the real worker, confirm: (a) blank/blurry rejected
  with no Ollama call at all, (b) a resubmitted photo rejected as a
  duplicate, (c) `moondream` fast-rejects an obviously non-room photo,
  (d) the `llava:13b` gate rejects a room-shaped-but-wrong photo (and,
  specifically, an illustrated/fictional image like a stylized fantasy
  creature - the case that slipped past both AI gates last round and
  was only caught by the room-match step), (e) a fingerprint gets
  generated on first use and logged, (f) a real photo of the kid's own
  room - **even with different bedding than the reference photos** -
  is NOT falsely rejected, and (g) a genuinely different room still is
  rejected.

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
   anything else falls through to the fuller gate rather than being
   trusted outright, since it's a much smaller model.
4. **`llava:13b` room-validity gate** - perception only. The model
   reports `literal_visible_items` / `room_evidence` /
   `invalid_evidence` / `confidence` and a `setting` category
   (`indoor_room` / `outdoor` / `close_up_object` /
   `illustration_or_fictional` / `unclear` / `other_invalid`) - never a
   bare `valid` boolean. Code decides: valid only if `setting ==
   "indoor_room"`, confidence `"high"`, `room_evidence` has ≥2 items,
   `invalid_evidence` empty. Few-shot examples include shoes-on-pavement,
   a dog, a close-up object, *and* a stylized fantasy-creature
   illustration (added after one slipped through - see below). Runs at
   `temperature: 0`.
5. **Room fingerprint** (generated lazily, cached) - if the target has
   no stored fingerprint yet, one `llava:13b` call over the reference
   photos produces a 3-5 sentence structural-only description, stored
   via `submit_room_fingerprint` and reused for every future job until
   reference photos change (`kids.room_fingerprint` /
   `family_rooms.room_fingerprint`, invalidated to `null` by
   `upload_reference_photo` / `delete_reference_photo` /
   `upload_family_room_photo` / `delete_family_room_photo`). If no
   reference photos exist at all, the submission is rejected with a
   message to ask a parent to add some first.
6. **`llava:13b` scorer** - only reached if all above pass. Compares
   the submission against the fingerprint text (room-identity, ignoring
   bedding/clutter) and, separately, against the raw reference photos
   (tidiness scoring 1-10 with explicit ranges, one encouraging
   sentence + exactly 3 specific actions).

All Ollama calls use the `format` JSON-schema parameter (constrained
output) instead of asking for JSON in prose and regex-extracting it.

**The illustration gap:** during testing, a stylized fantasy-creature
illustration (not even a real photograph) was scored instead of
rejected - it slipped past both `moondream` and the `llava:13b` gate,
and was only stopped by the (then raw-photo-based) room-match step.
The gate prompt now has an explicit `illustration_or_fictional`
category and a few-shot example for this case, but it's a real
reminder that these AI layers are not infallible even after the
gate/scorer split - see 🟢 LATER for the deterministic (non-AI)
hardening ideas that would close this kind of gap more reliably.

**Why a real `rejected` status instead of `score: 0`:** the schema
already allowed `status = 'failed'` and nothing ever set it - a real
status is clearer than teaching every consumer of `ai_score` that `0`
is a special sentinel.

**Freshness validation** (deployed - migration
`photo_score_freshness_and_rejection`): client-side compression
(`apps/shared/image.js`) strips EXIF, so the kid app captures
`file.lastModified` *before* compression and sends it as
`photo_taken_at`; rejected server-side if missing or >24h old. The
"Score my room with AI" file input also has `capture="environment"` so
mobile browsers open the camera directly rather than a gallery picker.

**Known open risk:** the two no-AI layers (blank/blur, duplicate) are
solid - direct measurements, can't hallucinate. The fingerprint system
removes one specific noisy signal (bedding) from one specific judgment
(room-match), but the AI layers overall are still vision-model
judgment underneath software rules, not proven infallible - see the
illustration gap above. Low-stakes for `informational`/`nudge` modes (a
parent's still in the loop); worth being cautious about before relying
on `auto_approve` for a family.
</details>

### Migration M2 - Vite/React/TS hello-world scaffold
- **Tags:** infra, migration
- **Status:** open
- Scaffold a minimal Vite + React + TypeScript app at `migration/hello-world/`,
  wired into the existing GH Pages deploy workflow
  (`.github/workflows/deploy-pages.yml`). Purely additive - no existing
  `apps/*` file is touched. This is the reusable base both for the Family
  Link proof-of-concept (M2b/M2c below) and, if that passes, the first real
  port (M3). See `D-2026-07-20-pwa-to-capacitor-migration-assessment` for
  the full option comparison behind this plan.
- **Done when:** `npm run build` in `migration/hello-world/` produces a
  working `dist/`, the GH Pages workflow publishes it at its own subpath,
  it loads correctly in a browser at that URL, and all 5 existing apps
  still deploy and load correctly after the workflow change.

<details>
<summary>Design notes</summary>

**Why this folder, not a separate repo:** isolation (the actual reason a
separate repo would help) is already free here - a new folder is trivially
`git rm -rf`-able if the Family Link test (M2c) fails, without touching any
real app. A separate repo would cost real coordination overhead (a second
`AGENTS.md`, a second deploy workflow) for a project that's ultimately
meant to live here once/if it graduates past proof-of-concept.

**The one shared-file risk:** `.github/workflows/deploy-pages.yml` currently
just uploads the whole repo (`path: ".""`) with no build step. Adding a
build step for `migration/hello-world/` is the only change here that
touches infrastructure the 5 live apps also depend on - verify all 5 still
deploy correctly, don't just check the new scaffold works.

**Vite `base` config:** must match the actual GH Pages subpath this will be
served at (e.g. `/homelife/migration/hello-world/`) or the deployed build
loads a blank page (a classic first-time Vite-on-GH-Pages mistake).
</details>

---

## 🟡 NEXT

### Migration M2b - Wrap the scaffold in Capacitor, build a debug APK
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M2 done)
- Add Capacitor (`@capacitor/core`, `@capacitor/android`) to the M2
  scaffold, `npx cap add android`, produce a debug APK. First real contact
  with Android Studio/SDK setup on this machine - budget real time if it's
  never had either installed.
- **Done when:** a debug APK builds and installs via `adb install` on an
  emulator or spare device, showing the scaffold's trivial screen.

### Migration M2c - Sideload on the child's tablet, verify Family Link independence (decision gate)
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M2b done)
- Install the M2b APK directly on the actual child tablet used day-to-day.
  Check Android Settings > Apps for its own entry, then the real test: mark
  it "Unlimited" in Family Link, exhaust the daily screen-time limit, and
  confirm it stays open while Chrome/browsing gets blocked.
- **Done when:** confirmed independently-controllable in Family Link on the
  real tablet. **If this fails,** stop here and re-evaluate the whole
  migration direction rather than continuing to Migration M3 - see the
  "when I would NOT choose this" section of
  `D-2026-07-20-pwa-to-capacitor-migration-assessment`.

### Migration M3 - Port first real app to React/Vite
- **Tags:** feature, migration
- **Status:** blocked (needs Migration M2c passing)
- Pick the smallest real app (`my-rewards` or `leaderboard`) and rebuild it
  as React components calling the same `callApi()`/`family-api` edge
  function, unchanged backend. Keep the vanilla version live and deployed
  until the port has been used for real for a few days.
- **Done when:** every current feature of the chosen app works identically
  to the live vanilla version, verified against a disposable Supabase
  family.

### Migration M4 - Add PWA support to the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M3 done)
- Replace the hand-rolled `manifest.json`/`service-worker.js` with
  `vite-plugin-pwa`, eliminating the manual `CACHE_NAME`-bump convention
  (see `AGENTS.md`'s "Project conventions") for this app going forward.
- **Done when:** install-to-homescreen and offline reload both work, and a
  rebuild auto-invalidates the old cache with no manual version bump.

### Migration M5 - Add Capacitor Android wrapper to the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M4 done)
- Repeat Migration M2b's Capacitor wrap, this time on the real ported app,
  reusing whatever setup/config pattern M2b established.
- **Done when:** `npx cap open android` gives a buildable project for this
  app.

### Migration M6 - Build/test a release-quality APK for the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M5 done)
- Produce a signed release APK - first time generating and safely backing
  up the signing keystore. Treat the keystore file with the same care as a
  production secret: never commit it, document *where* it's stored (not
  its contents) once a location is chosen.
- **Done when:** a signed APK installs and runs correctly on a real device.

### Migration M7 - Confirm the ported app on the tablet with Family Link
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M6 done)
- Production confirmation of what Migration M2c already proved on the
  throwaway scaffold - now on the actual real app the kid will use daily.
- **Done when:** the real app is independently controllable in Family Link
  on the child's tablet.

### Migration M8 - Extract reusable template + document the convention
- **Tags:** infra, migration, refactor
- **Status:** blocked (needs Migration M7 done)
- Generalize whatever's hardcoded to the first ported app into a
  copy-and-rename template; update `AGENTS.md`/`README.md` with the new
  build/deploy/Capacitor conventions, the way they currently document the
  existing no-build conventions.
- **Done when:** a second app built from the template takes noticeably less
  time than the first.

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
  produces.
- **Done when:** all 4 remaining apps are ported, PWA-enabled, and
  Capacitor-wrapped using the M8 template.
