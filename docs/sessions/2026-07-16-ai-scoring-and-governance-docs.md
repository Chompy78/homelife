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
- User confirmed it working live, then reported two issues: the "Score
  my room with AI" photo input opened a gallery picker instead of the
  camera, and asked to confirm the freshness metadata check was
  actually wired up (it was, from earlier this session). Fixed the
  camera issue with `capture="environment"` on the file input.
- User reported a real photo of their own room got rejected as a "room
  mismatch," and separately flagged that an earlier test photo (a
  stylized fantasy-creature illustration) had slipped past both AI
  gates and was only caught by that same room-match step. Diagnosed
  the mismatch as a real bug: the scorer compares raw reference photos
  every time, so ordinary bedding differences were being read as
  evidence of a different room.
- User proposed the fix directly: generate a room "fingerprint" once
  (parent uploads photos, AI derives fixed/stable features) instead of
  comparing live photos each time. Built it: migration adding
  `room_fingerprint` to `kids`/`family_rooms` (invalidated on any
  reference-photo change), a new `submit_room_fingerprint` worker
  action, `get_pending_photo_scores` returning the current value.
  Deployed as edge function v11, verified via Node script (8 checks).
  Rebuilt `poller.py` (fourth iteration) to generate a fingerprint
  lazily on first use and reuse it for room-identity matching, while
  still using raw reference photos for the separate tidiness-scoring
  step. Also hardened the gate prompt with an
  `illustration_or_fictional` category/example for the fantasy-creature
  case. This reverses part of the earlier
  `D-2026-07-16-ai-anti-cheat-simplification` decision - logged as
  `D-2026-07-16-room-fingerprint`, with a note added to the original
  entry explaining what changed and why. Delivered the rebuilt
  `poller.py`; live confirmation that it actually fixes the
  bedding-driven false rejection is pending.
- User asked for three more things on top of the fingerprint fix: a
  parent-facing history of AI score attempts with a legit/false filter,
  a processing-time estimate so kids stop re-submitting mid-score, and
  direct parent editing of the fingerprint text. Shipped all three.
  Backend: migration `room_fingerprint_locked` (a parent edit locks the
  fingerprint against the existing auto-invalidate-on-photo-change
  behavior; clearing the text unlocks it back to AI auto-generation),
  new `update_room_fingerprint` and `get_photo_score_history` actions,
  and an `ai_score_avg_seconds` figure (mean of the last 10 *scored*
  requests) added to `get_kid_state`/`get_family_room_state`. Deployed
  as edge function v12, verified via Node script (lock persistence
  through a photo upload, clear-resets-both-fields, history
  ordering/filtering, average-seconds math) against a disposable test
  family. See `D-2026-07-16-fingerprint-lock-and-parent-visibility`.
- Frontend: the kid app now shows "usually takes about Xs" before a
  submission and a live-ticking "Xs so far (usually about Xs)" line
  while one is pending. The parent dashboard gained a single "AI
  Scoring" modal per kid/room card combining the fingerprint editor and
  a filterable (all/legit/rejected) score history, opened from a new
  button next to the existing inline AI-score line. Bumped the
  bedroom-reset service worker cache to v17. Verified live with
  Playwright against a disposable test family (had to route the app's
  Supabase calls through Node's own `fetch` inside `page.route()`,
  since the sandboxed browser can't reach the outside network directly
  the way the host Node process can) - confirmed the fingerprint
  textarea prefills, all three history filters return the right counts,
  saving shows a confirmation, and the kid app's pending-state text
  contains both the live elapsed time and the average estimate.

- User reported they couldn't install the parent dashboard as a PWA on
  their Pixel/Chrome. Root cause: unlike the other two apps, it never
  had a `manifest.json`, icons, or service worker - nothing for Chrome
  to base an install prompt on. Added all three, reusing the existing
  house/checkmark icon and mirroring the bedroom-reset app's setup.
  Verified via Chrome DevTools Protocol that the manifest parses clean
  and the worker registers.
- User asked for a thumbnail of the actual submitted photo next to
  every AI score, so text feedback can be checked against what was
  really submitted. Asked two clarifying questions (where it should
  show, how to handle thumbnails on a long history) via
  `AskUserQuestion`; both were dismissed, so went with the stated
  sensible defaults (everywhere useful; capped to the 15 most recent
  history rows) and confirmed that was right before proceeding. Added
  `photo_url` to `getLatestPhotoScore` and `get_photo_score_history`,
  reusing the same signed-URL machinery already used to hand the photo
  to the AI worker - no new photo processing needed. Shows on the kid
  app's current-score card (even while pending), the parent dashboard's
  inline score line, and the history modal; clicking any of them opens
  the existing lightbox. First deploy attempt (v13) accidentally sent
  placeholder text instead of the real file - caught immediately via a
  live sanity check and corrected as v14. Verified via Node script and
  Playwright against a disposable test family; the Playwright script's
  own JSON-relay route handler was corrupting binary image bytes with
  `.text()`, which looked like a rendering bug in the app at first -
  fixed the test harness (route by content-type, use `.arrayBuffer()`
  for images) and confirmed the thumbnails render correctly.
- User asked how photo count/size affects the app, Supabase, and the
  user experience. Answered in depth (compression settings per photo
  type, the 3-photo reference cap vs. the uncapped/never-cleaned-up
  AI-scoring submissions, storage/egress implications, AI worker
  payload cost, why the history-thumbnail cap exists) and flagged the
  one open risk: unbounded storage growth from scoring submissions.
  User asked for it to be tracked - added "Cap stored AI-scoring
  photos per kid and per family" to `docs/TASK_BOARD.md` under 🟢
  LATER, including the real design tradeoff it'll need to resolve
  (drop-the-file-but-keep-the-row vs. prune the row) now that
  submissions have visible thumbnails.
- User asked for confetti celebrations - milestones plus an occasional
  random one, explicitly "not too much". `confettiBurst()` already
  existed (room-complete, level-up) but badges earned and parent
  Pass/Great Job had none. Added confetti to all three, plus a rare
  (~1-in-12) toast-free flash on an ordinary checklist tick for a bit
  of unprompted delight. While verifying live, found that two
  milestones landing in the same update (e.g. a badge unlocked by the
  same points that triggered a level-up) stacked two confetti bursts
  and silently overwrote the more exciting toast text with the plainer
  one - fixed by having `applyStreak` report whether it already
  celebrated something, so the caller skips its own. Verified every
  trigger live via Playwright against a disposable test family,
  including that dedup case. Bumped the bedroom-reset service worker
  cache to v19.

## Files touched

`AGENTS.md`, `DECISIONS.md`, `CHANGELOG.md`, `docs/TASK_BOARD.md`,
`docs/PARENT-GUIDE.md`, `README.md`, `supabase/functions/family-api/index.ts`
(+ migrations `rename_mum_to_parent`, `ai_photo_scoring`,
`photo_score_freshness_and_rejection`, `photo_score_hash`,
`room_fingerprint`, `room_fingerprint_locked`),
`apps/bedroom-reset/app.js`, `apps/bedroom-reset/index.html`,
`apps/bedroom-reset/service-worker.js`, `apps/parent-dashboard/app.js`,
`apps/parent-dashboard/index.html`, `apps/parent-dashboard/styles.css`,
`assets/images/homelife_favicon.png`.

## Related

- All 15 entries in `DECISIONS.md`, dated 2026-07-13 through
  2026-07-16.
- All entries in `CHANGELOG.md`.

## Carried forward

- Confirming, on the user's real worker, that the full fingerprint-
  based pipeline works end to end - including the specific case that
  motivated it: a real photo of the kid's own room, with different
  bedding than the reference photos, should now be accepted rather
  than rejected (`docs/TASK_BOARD.md`, 🔴 NOW).
- Five hardening ideas still sit on 🟢 LATER, deliberately deferred: a
  deterministic scene-classifier gate, reference-photo embedding
  similarity, evaluating newer local VLMs, a daily anti-cheat capture
  token, and a parent-review state for uncertain results.
