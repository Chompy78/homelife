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
