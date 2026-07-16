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

### Confirm the layered anti-cheat checks on the real worker
- **Tags:** ai-vision, prompt, validation
- **Status:** in-progress
- The scoring-quality/anti-cheat work is now a **layered pipeline** in
  `poller.py`, cheapest/most-reliable checks first — see Design notes.
  Two rounds of real-world testing on the user's actual hardware
  (`llava:13b` on an Ubuntu/Ollama box) found real gaps that reshaped
  this design: (1) the model tag has to be the exact one `ollama list`
  shows (`llava:13b`, not `llava`) or every call 404s; (2) a single
  compound "is this valid, and if so score it" prompt did not reliably
  reject an obviously-wrong photo (a flat-lay of shoes on outdoor
  pavement got scored as if it were a messy bedroom). Neither is a bug
  in this repo - both are worker-side/model-side findings, addressed by
  adding two deterministic (no-AI) checks *before* the model ever sees
  the photo, so the AI is only responsible for the judgment calls that
  actually need a vision model.
- **Done when:** on the real worker, (a) a blank/near-solid-color or
  heavily blurred photo is rejected without an Ollama call at all
  (check the log for "no AI needed"), (b) resubmitting the same photo
  twice in a row is rejected as a duplicate, and (c) a photo of the
  wrong room (or something that isn't a room) still gets rejected by
  the AI layer with a specific reason - the AI layer's reliability
  after test (b) failed on a real photo is not yet re-confirmed.

<details>
<summary>Design notes</summary>

**Layer order, cheapest and most trustworthy first:**
1. **Blank/blurry check** (`local_quality_check` in `poller.py`, no AI)
   - grayscale pixel standard deviation catches blank/near-solid-color
   photos; a Laplacian (edge-detection) filter's variance catches blur.
   Both are direct measurements, not judgment calls, so they're more
   reliable than asking a model "is this blurry."
2. **Reused-photo check** (`duplicate_check`, no AI) - a perceptual
   hash (`imagehash.average_hash`) of the submitted photo compared
   against the target's last *scored* photo's hash (`photo_hash`
   column, round-tripped through `get_pending_photo_scores` as
   `previous_photo_hash` and stored via `submit_photo_score`). Catches
   a kid resubmitting the same photo (e.g. re-saving an old screenshot,
   which would otherwise get a fresh `photo_taken_at` and pass the
   freshness check). A rejected submission's hash is stored too, but
   `getLatestPhotoHash` only ever looks at the last *scored* row, so
   comparing against something that was itself already rejected can't
   happen.
3. **The vision model** (`llava:13b`) - only reached if 1 and 2 both
   pass. One consolidated prompt covering room validity (blank/unusable/
   wrong-room), tidiness scoring with explicit 1-3/4-6/7-8/9-10 ranges,
   and structured child-friendly feedback (one encouraging sentence +
   exactly 3 specific actions):
   ```json
   {"valid": false, "reject_reason": "..."}
   ```
   or
   ```json
   {"valid": true, "score": 7, "comment": "...", "actions": ["...", "...", "..."]}
   ```

**Why no stored "room fingerprint":** every scoring request already
returns the room's reference photos alongside the submitted photo, so
the model can judge "is this the same room" directly in the same call.

**Why a real `rejected` status instead of `score: 0`:** the schema
already allowed `status = 'failed'` and nothing ever set it - a real
status is clearer than teaching every consumer of `ai_score` that `0`
is a special sentinel.

**Freshness validation** (deployed - migration
`photo_score_freshness_and_rejection`): client-side compression
(`apps/shared/image.js`) strips EXIF, so the kid app captures
`file.lastModified` *before* compression and sends it as
`photo_taken_at`; rejected server-side if missing or >24h old.

**Known open risk:** the two no-AI layers are solid (they're direct
measurements), but the AI layer's room-validity judgment is only as
good as `llava:13b`'s willingness to say "this doesn't make sense" -
smaller/older vision models are known to be inconsistent at refusing
rather than guessing. This is a real limitation of the local model, not
something more prompt engineering can fully close. Low-stakes for
`informational`/`nudge` modes (a parent's still in the loop); worth
being cautious about before relying on `auto_approve` for a family.
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
