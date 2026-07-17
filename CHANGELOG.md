# Changelog

The permanent record of what's shipped, newest date on top. See
`AGENTS.md` for when to add an entry — finished work lives here, not
on `TASK_BOARD.md`.

---

## 2026-07-16

- Restructured task tracking: renamed `ROADMAP.md` to `TASK_BOARD.md`,
  switched to a NOW/NEXT/LATER format with tags, status, and a "done
  when" condition per task, and folded in the AI-scoring quality/
  anti-cheat tasks (scoring consistency, structured output, room
  validation, room matching, photo freshness).
- Set up `AGENTS.md`, `DECISIONS.md`, and this changelog as the
  project's governance docs.
- Confirmed the home AI photo-scoring worker running end-to-end: the
  Ubuntu/Ollama box polls Supabase for pending photos, scores them
  with a local vision model, and posts results back. The AI
  photo-scoring feature is now fully live, not just built.
- Shipped photo freshness validation for AI scoring: the kid app now
  captures a photo's own timestamp before compression (which strips
  EXIF) and the edge function rejects stale/reused photos
  (`photo_too_old`). Added a real `rejected`/`failed` path to
  `submit_photo_score` (using the schema's existing but previously
  unused `'failed'` status) so anti-cheat rejections are distinct from
  a real low score, surfaced on both the kid app and parent dashboard.
  Verified via a disposable test family covering stale/missing
  timestamps, resubmission after a rejection, and an auto-approve
  regression check. Deployed as edge function v9.
- Delivered an updated `poller.py` to the user (not committed - it
  embeds the `WORKER_TOKEN` secret) consolidating the AI scoring-quality
  and anti-cheat work into one prompt: room-type detection, invalid/
  unusable-photo rejection, room matching against the existing
  reference photos (no stored fingerprint needed), explicit 1-10
  scoring ranges, and structured feedback (one encouraging sentence +
  exactly 3 specific actions). Redeploying it on the user's Ubuntu box
  is the one remaining step - see `docs/TASK_BOARD.md`.
- Live testing on the user's real hardware surfaced two real findings:
  the Ollama model tag has to match exactly (`llava:13b`, not `llava`)
  or every call 404s, and the single-prompt anti-cheat check did not
  reliably reject an obviously-wrong photo (shoes on outdoor pavement
  got scored as a bedroom). Neither is a repo bug - both are
  worker-side/model-capability findings.
- Added a `photo_hash` column and edge-function plumbing
  (`get_pending_photo_scores` returns the target's last-scored photo's
  hash as `previous_photo_hash`; `submit_photo_score` accepts and
  stores a new one on both the scored and rejected paths) so the
  worker can detect a reused photo. Deployed as edge function v10,
  verified via a Node script covering the round-trip and the "a
  rejected submission's hash never becomes the comparison point"
  edge case.
- Rebuilt `poller.py` as a layered pipeline: two deterministic, no-AI
  checks (blank/blurry detection via pixel and edge variance; reused-
  photo detection via perceptual hashing) run before the photo ever
  reaches the vision model, so the AI is only asked the judgment calls
  that actually need it. Delivered to the user; live confirmation of
  the AI layer's room-validity check specifically is still pending.
- Rebuilt `poller.py` again around a gate/scorer split after getting a
  second opinion from three independent outside reviews on that
  pending room-validity failure. The `llava:13b` vision step no longer
  decides validity itself - it only reports observed evidence (setting,
  visible items, room/invalid evidence, confidence) via Ollama's
  `format` JSON-schema parameter, and plain code applies the pass/fail
  rule. Added a `moondream` pre-gate (already-pulled model, only
  auto-rejects on a confident "not a room") ahead of the fuller gate.
  Delivered to the user; live confirmation on the real worker still
  pending. See `D-2026-07-16-gate-scorer-split` in `DECISIONS.md`.
- Logged five hardening ideas surfaced by that same review round
  (deterministic scene-classifier gate, reference-photo embedding
  similarity, newer local VLM evaluation, a daily anti-cheat capture
  token, a parent-review state for uncertain results) as 🟢 LATER on
  `docs/TASK_BOARD.md` rather than building them all in immediately.
- Confirmed the rebuilt worker running live: fixed an Ollama model-tag
  mismatch on the way (`llava` resolves to `llava:latest`, which was
  never pulled - the actual model is `llava:13b`), then verified both
  a real anti-cheat rejection and a real tidy-room score with 3
  specific actions.
- Fixed the "Score my room with AI" photo input opening a generic
  upload/gallery picker instead of the camera - added
  `capture="environment"` so mobile browsers launch the camera
  directly, matching the "take a fresh photo right now" intent of the
  freshness check.
- Replaced raw reference-photo comparison for room-identity matching
  with a one-time "room fingerprint": a text description of a room's
  fixed, structural features (walls, flooring, windows, fixed
  furniture) generated once by the worker from a kid's/room's
  reference photos, explicitly excluding bedding/linens/clutter since
  those are expected to change. Fixes a real false-rejection bug found
  in live testing - the raw-photo room-match check was rejecting a
  kid's own genuine room because the bedding looked different from the
  reference photos. Added a `room_fingerprint` column on `kids` and
  `family_rooms` (invalidated automatically whenever reference photos
  change), and a worker-token-gated `submit_room_fingerprint` action.
  Deployed as edge function v11, verified via Node script (8 checks
  covering pre-seeded/invalidated/regenerated fingerprint states and
  worker-token auth). Also hardened the room-validity gate's prompt
  with a new `illustration_or_fictional` category and example, after a
  stylized fantasy-creature image slipped past both `moondream` and
  the `llava:13b` gate and was only caught by the (now fingerprint-
  based) room-match step. See `D-2026-07-16-room-fingerprint` in
  `DECISIONS.md`.

- Shipped three follow-up AI-scoring features requested after the
  fingerprint fix went live: a parent-facing score history (up to 50
  resolved attempts, newest first, with a legit/rejected filter), a
  processing-time estimate for kids (a "usually takes about Xs" hint
  before submitting and a live-ticking "Xs so far" line while a score is
  pending, both meant to stop kids from re-submitting mid-score), and
  direct parent editing of a kid's/room's AI room fingerprint text. The
  editable fingerprint needed a `room_fingerprint_locked` flag so a
  parent's correction survives the existing auto-invalidate-on-photo-change
  behavior instead of silently reverting to AI auto-generation; clearing
  the text explicitly opts back into that. Added `update_room_fingerprint`
  and `get_photo_score_history` edge-function actions and an
  `ai_score_avg_seconds` figure (averaged over the last 10 *scored*
  requests) on `get_kid_state`/`get_family_room_state`. Deployed as edge
  function v12. The parent dashboard surfaces all three in one "AI
  Scoring" modal per kid/room card. Verified via Node script (backend)
  and Playwright (live UI against a disposable test family). See
  `D-2026-07-16-fingerprint-lock-and-parent-visibility` in
  `DECISIONS.md`.

- Made the parent dashboard installable as a PWA - it never had a
  manifest, icons, or service worker, unlike the other two apps, so
  Chrome had nothing to offer an "Install app" prompt from. Added
  `manifest.json`, `icons/` (reusing the existing house/checkmark
  icon), a service worker (`parent-dashboard-pwa-v1`) for offline
  caching, and an install-tip hint under the header, mirroring the
  bedroom-reset app's setup. Verified via Chrome DevTools Protocol
  (`Page.getAppManifest`, service worker registration) that the
  manifest parses with no errors and the worker registers correctly.

- Added a clickable thumbnail of the actual submitted photo next to every AI
  score display, so a parent or kid can compare the photo against the AI's
  comment instead of taking it on faith. Shows on the kid app's current-score
  card (visible even while a score is still pending), the parent dashboard's
  inline score line on each kid/room card, and every row in the score-history
  modal (capped to the 15 most recent rows there, to avoid generating a
  signed URL for every row in a long history on every load). Reuses the
  photo that's already uploaded and already had a signed URL generated for
  the AI worker - no new photo processing, just returning that URL and
  adding a small `<img>` that opens the existing lightbox on tap. Added
  `photo_url` to `getLatestPhotoScore` and `get_photo_score_history`.
  Deployed as edge function v14 (a first deploy attempt, v13, accidentally
  sent placeholder text instead of the real file and was immediately
  corrected). Verified via Node script (photo_url present and fetchable on
  both the kid's pending view and the parent's history/dashboard views) and
  Playwright against a disposable test family (thumbnail visible and
  clickable in all three locations, correct image loads in the lightbox).

## 2026-07-15

- Shipped self-hosted AI photo scoring: a kid can submit a room photo
  for scoring, a home-network worker scores it against a local vision
  model, and the effect on the app is configurable per family (off /
  informational / nudge / auto-approve with a threshold). Ships with
  worker-token authentication and shared points/streak-award logic
  reused from the existing Parent Check flow.
- Locked "what done looks like" reference photos to parent-only
  add/remove, enforced both in the UI and in the edge function.

## 2026-07-13

- Renamed all "Mum"/"mum" wording to family-agnostic "Parent"/"parent"
  across the database, edge function, and all three apps.
- Fixed the Android on-screen keyboard not appearing on the code-entry
  screen.
- Fixed broken photo removal on the parent dashboard; redesigned to a
  direct ✕ button on each photo tile instead of a lightbox delete flow.
- Added per-family icon picker (dashboard header + leaderboard) and a
  family-editable bedroom checklist.
- Added the app's favicon/PWA icons across all three apps.
- Added reference-photo tips (using AI to generate a tidy reference
  photo, using Squoosh to compress large images) to the parent guide.
- Added a short parent onboarding guide.
