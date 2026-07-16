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
- Backfilled the pre-session service-role/session-token auth
  architecture into `DECISIONS.md` (`D-2026-07-13-service-role-session-auth`),
  after confirming the approach is still sound for this app's scale —
  flagged the tradeoff that it's the sole line of defense, with no
  RLS-policy backup, so every new edge-function action needs its
  permission check reviewed carefully.
- User confirmed the home AI worker is running end-to-end — the AI
  photo-scoring feature is fully live, not just built.
- Tackled the AI scoring-quality/anti-cheat task cluster. Simplified
  the original scope on inspection: dropped the planned "room
  fingerprint" storage (the model already gets reference photos in
  every scoring request, so it can compare directly), replaced planned
  EXIF-based freshness checks with a client-captured timestamp (our own
  compression strips EXIF, so it would never have worked), and used the
  schema's existing but unused `'failed'` status for anti-cheat
  rejections instead of overloading `score` with a fake `0`. Logged as
  `D-2026-07-16-ai-anti-cheat-simplification`.
- Shipped the repo side: migration `photo_score_freshness_and_rejection`
  (`photo_taken_at`, `rejection_reason` columns), edge-function changes
  (freshness check in `submit_photo_for_scoring`, a `rejected` path in
  `submit_photo_score`), kid-app timestamp capture and a distinct
  "not scored" state, parent-dashboard display for rejected scores.
  Deployed as edge function v9. Verified via a disposable test family
  (12 checks: stale/missing timestamp rejection, fresh photo accepted,
  duplicate-while-pending blocked, worker rejection sets `failed` with
  a reason, resubmission allowed after a rejection, real score still
  auto-approves, retried score submit stays a no-op, wrong worker token
  fails closed).
- Wrote and delivered an updated `poller.py` to the user (not committed
  - embeds `WORKER_TOKEN`) with one consolidated prompt covering
  room-type detection, invalid-photo rejection, room matching, explicit
  1-10 scoring ranges, and structured feedback (one sentence + exactly
  3 actions).
- Walked the user through getting it onto their actual server (WinSCP,
  then discovered their real layout - `/data/projects/homelife-poller/
  scripts`, not the `~/homelife-poller` originally assumed - and fixed
  the cron entry to match) and confirmed it runs.
- Found and fixed a real bug during live testing: the Ollama model tag
  has to match exactly (`llava:13b`, not `llava`) or every call 404s.
- Live-tested the new prompt against a real photo (a tidy room) - got
  back a real score with 3 specific actions, confirming the scoring
  path works. Then live-tested against an obviously-wrong photo (shoes
  on outdoor pavement) - the model scored it anyway instead of
  rejecting it, revealing the single-prompt anti-cheat check isn't
  reliable on `llava:13b`. Discussed why (small/older vision models are
  inconsistent at refusing vs. guessing) and why simple repeated-vote
  ensembling wouldn't fix a consistent failure, only an inconsistent one.
- Designed and shipped a layered fix: two deterministic, no-AI checks
  (blank/blurry detection via pixel/edge variance; reused-photo
  detection via perceptual hashing) that run before the photo ever
  reaches the model, narrowing what the AI is actually responsible for.
  Added a `photo_hash` column and edge-function plumbing
  (`previous_photo_hash` on `get_pending_photo_scores`, stored via
  `submit_photo_score`), deployed as edge function v10, verified via
  Node script. Rebuilt `poller.py` with the layered pipeline and
  delivered it. Logged as `D-2026-07-16-layered-anti-cheat-checks`.
  Confirming the two new checks and re-testing the AI layer's
  room-validity judgment on the real worker is still pending.
- Wrote a self-contained problem writeup (model/hardware, what was
  tried, what failed, what's being tried next) for the user to get a
  second opinion elsewhere.
- User brought back three independent outside reviews of that writeup.
  All three converged on the same root-cause diagnosis - "completion
  bias" (a model asked to both gatekeep and perform a task in the same
  call biases toward performing it) - and the same core fix (never let
  the model self-assert a `valid` boolean it has an incentive to bias;
  have it report evidence only, let code decide). Evaluated all three
  in detail, agreed with the core diagnosis and fix, and pushed back on
  or deferred the heavier suggestions (a trained CNN scene classifier,
  image-embedding similarity, new VLM downloads, a daily anti-cheat
  token, a formal parent-review state) as real new engineering/product
  scope rather than a quick follow-up.
- Rebuilt `poller.py` a third time around the agreed architecture: a
  `moondream` pre-gate, then a `llava:13b` perception-only gate
  (reports evidence, code decides pass/fail), then the scorer - all
  using Ollama's `format` JSON-schema parameter instead of regex-
  extracted prose JSON. Logged as `D-2026-07-16-gate-scorer-split`.
  Logged the five deferred ideas as 🟢 LATER tasks on
  `docs/TASK_BOARD.md`. Delivered the rebuilt `poller.py` to the user;
  live confirmation is the one thing left.

## Files touched

`AGENTS.md`, `DECISIONS.md`, `CHANGELOG.md`, `docs/TASK_BOARD.md`,
`docs/PARENT-GUIDE.md`, `README.md`, `supabase/functions/family-api/index.ts`
(+ migrations `rename_mum_to_parent`, `ai_photo_scoring`,
`photo_score_freshness_and_rejection`, `photo_score_hash`),
`apps/bedroom-reset/app.js`, `apps/bedroom-reset/service-worker.js`,
`apps/parent-dashboard/app.js`, `apps/parent-dashboard/styles.css`,
`assets/images/homelife_favicon.png`.

## Related

- All 13 entries in `DECISIONS.md`, dated 2026-07-13 through
  2026-07-16.
- All entries in `CHANGELOG.md`.

## Carried forward

- Confirming, on the user's real worker, that every layer of the
  rebuilt pipeline actually fires correctly - blank/blurry and
  duplicate checks with no AI call, `moondream`'s pre-gate, the
  `llava:13b` evidence-based gate, and the scorer - is the one item
  left on `docs/TASK_BOARD.md`, 🔴 NOW.
- Five hardening ideas sit on 🟢 LATER, deliberately deferred rather
  than built this round: a deterministic scene-classifier gate,
  reference-photo embedding similarity, evaluating newer local VLMs, a
  daily anti-cheat capture token, and a parent-review state for
  uncertain results.
