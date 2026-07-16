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
