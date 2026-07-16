# 2026-07-16 — AI photo scoring build-out and governance docs

**Focus:** Shipped the self-hosted AI photo-scoring feature end to end
(Supabase side), handed off the home-worker setup as a copy-paste
guide, then set up this project's governance docs (`AGENTS.md`,
`DECISIONS.md`, `CHANGELOG.md`, `TASK_BOARD.md`, this session log).

## Timeline

- Explained how to create a parent code for a new family, then
  renamed all "Mum"/"mum" wording to family-agnostic "Parent"/"parent"
  across the DB, edge function, and all three apps.
- Created parent codes for several families on request: the Kellers
  (`KELR-7F3Q`), the von Czarneckis (`VONC-9K2H`, later renamed
  singular→plural), the Gallaghers (`GALL-4X8P`), the Penns
  (`PENN-6T2R`), plus a shared "Demo Playground" sandbox family
  (`DEMO-PLAY` / `DEMO-KID`) for anyone to try the app.
- Wrote a shareable parent onboarding guide; later added tips on using
  AI to generate a tidy reference photo and Squoosh to compress large
  images before upload.
- Fixed a reported bug: Android's on-screen keyboard never appeared on
  the code-entry screen (removed a programmatic `.focus()` call that
  was blocking it).
- Fixed a reported bug: removing a reference photo silently failed
  (a z-index bug hid the confirm dialog behind the lightbox) — redesigned
  the flow per the user's preference to a direct ✕ button on each
  dashboard photo tile instead of a lightbox-delete flow.
- Wired in a user-provided favicon image as the PWA icon/favicon across
  all three apps (worked around the environment having no filesystem
  access to inline-pasted images and no image-processing tools, by
  resizing via a headless-Chromium canvas).
- Answered advisory questions: what to consider setting up a home AI
  server (Ollama/Home Assistant) for this app, and whether the Claude
  Fable model would be useful for this project.
- Locked "what done looks like" reference photos to parent-only
  add/remove (client UI removed for kids; server-side role check
  enforced in the edge function — the actual security boundary).
- Designed and built the full AI photo-scoring pipeline after asking
  clarifying questions: schema, edge-function actions
  (`submit_photo_for_scoring`, `get_pending_photo_scores`,
  `submit_photo_score`), worker-token auth, kid-app "Score my room"
  UI, parent-dashboard mode/threshold settings. Verified via Node +
  Playwright tests against disposable test data, then deployed.
- Generated a `WORKER_TOKEN` secret and set it as a Supabase Edge
  Function secret; verified it live via a direct curl test
  (unauthorized without it, `{"ok":true,"data":[]}` with it).
- Wrote a detailed, copy-paste, beginner-friendly setup guide for the
  home Ubuntu/Ollama worker (published as an artifact, and delivered
  again as a standalone Markdown file per request) — kept out of the
  git repo since it embeds the `WORKER_TOKEN` secret.
- Renamed `docs/ROADMAP.md` → `docs/TASK-LIST.md` → `docs/TASK_BOARD.md`,
  restructuring it from a flat idea list into NOW/NEXT/LATER sections
  with tags, a status, and a "done when" condition per task, folding
  in AI scoring-quality/anti-cheat tasks from a file the user uploaded.
- Set up `AGENTS.md` (canonical instructions), `DECISIONS.md` (backfilled
  with 9 real decisions from this session), and `CHANGELOG.md`
  (backfilled with what actually shipped), per the user's request to
  use these consistently going forward.
- Created this `docs/sessions/` directory and convention.

## Files touched

`AGENTS.md`, `DECISIONS.md`, `CHANGELOG.md`, `docs/TASK_BOARD.md`,
`docs/PARENT-GUIDE.md`, `README.md`, `supabase/functions/family-api/index.ts`
(+ migrations `rename_mum_to_parent`, `ai_photo_scoring`), all three
apps under `apps/` (bedroom-reset, parent-dashboard, leaderboard),
`assets/images/homelife_favicon.png`.

## Related

- All 9 entries in `DECISIONS.md` dated 2026-07-13 through
  2026-07-16.
- All entries in `CHANGELOG.md`.

## Carried forward

- Confirming the home AI worker is actually running end-to-end is
  still open (`docs/TASK_BOARD.md`, 🔴 NOW) — the setup guide has been
  handed off but not yet confirmed working.
- The AI scoring-quality/anti-cheat task cluster is open, not started.
- Two open questions from the end of this session, not yet answered:
  whether to backfill the pre-session session-token/RLS auth decision
  into `DECISIONS.md`, and whether operational actions like parent-code
  creation should be tracked somewhere (this session log now covers
  that gap going forward).
