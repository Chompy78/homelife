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

### Redeploy the updated worker prompt (consolidated scoring + anti-cheat)
- **Tags:** ai-vision, prompt, validation
- **Status:** in-progress
- The whole scoring-quality/anti-cheat cluster (consistency, structured
  output, room detection, invalid-photo rejection, room matching,
  actionable feedback, child-friendly tone) collapsed into **one
  consolidated prompt** for the home worker script — see Design notes.
  The repo side (freshness validation, and a real `failed` status for
  rejections) is built, deployed, and verified. What's left is entirely
  on the user's Ubuntu/Ollama box: replacing `poller.py` with the
  updated version (handed to the user directly, not committed here —
  it embeds the `WORKER_TOKEN` secret) and confirming it live.
- **Done when:** a photo of the wrong room (or something that isn't a
  room at all) gets rejected with a specific reason instead of scored,
  and a real tidy-room photo comes back with a score plus exactly 3
  specific actions - using the *new* poller, not the old one.

<details>
<summary>Design notes</summary>

**Why no stored "room fingerprint":** every scoring request already
returns the room's reference photos alongside the submitted photo
(`get_pending_photo_scores`), so the model can judge "is this the same
room" directly in the same call - no need to pre-compute and store a
fingerprint. This replaced what was originally scoped as two separate
tasks (generate + compare a fingerprint).

**Why a real `rejected` status instead of `score: 0`:** the schema
already allowed `status = 'failed'` and nothing ever set it. Overloading
`score` with a fake `0` would have meant every consumer of `ai_score`
had to know `0` is special-cased - a real status is clearer and the UI
already branches on `status` anyway.

**One consolidated prompt, not several model calls:** the worker sends
one prompt covering validity (blank/unusable/wrong-room), tidiness
scoring with explicit 1-3/4-6/7-8/9-10 ranges, and structured
child-friendly feedback (one encouraging sentence + exactly 3 specific
actions), and expects back either:
```json
{"valid": false, "reject_reason": "..."}
```
or
```json
{"valid": true, "score": 7, "comment": "...", "actions": ["...", "...", "..."]}
```
The poller then calls `submit_photo_score` with either
`{request_id, rejected: true, reason}` or `{request_id, score, comment}`
(actions get folded into the comment string server-side has no opinion
on that shape - it's just text, truncated to 280 chars).

**Freshness validation** (already deployed - migration
`photo_score_freshness_and_rejection`): client-side compression
(`apps/shared/image.js`) re-encodes photos through a canvas, which
strips any EXIF timestamp - so freshness can't be read from the
uploaded file. Instead the kid app captures `file.lastModified` *before*
compression and sends it as `photo_taken_at`; `submit_photo_for_scoring`
rejects with `photo_too_old` if it's more than 24h old, or
`photo_timestamp_required`/`photo_timestamp_invalid` if it's missing or
nonsensical. Verified via a disposable test family covering: stale
photo rejected, missing timestamp rejected, fresh photo accepted,
duplicate-while-pending rejected, worker rejection sets `status=failed`
with a stored `rejection_reason`, resubmission allowed after a failure
(the partial unique index only blocks `status='pending'`), a real score
still auto-approves correctly, and a retried score submit stays a
no-op (idempotency regression check).
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
