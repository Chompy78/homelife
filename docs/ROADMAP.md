# Roadmap

Ideas that have been discussed and scoped but deliberately not built yet.
Each entry has enough detail that an AI assistant (or a human) picking this
repo back up cold can implement it without re-deriving the design.

## AI photo scoring (Supabase side built - waiting on the home worker script)

**Idea:** a kid can snap a photo of their room and a self-hosted vision
model (Ollama, on the user's home network) scores it for tidiness.
Configurable per family: **off**, **informational** (just shows the
score), **nudge** (also suggests asking a parent to check once the score
clears a threshold), or **auto-approve** (a high enough AI score counts as
a pass on its own, same points as a PIN-confirmed Parent Check, no PIN
needed).

**Status: everything in Supabase is built and deployed.** What's left is
the home-side poller script (runs on the user's Ubuntu/Ollama box, outside
this repo) and setting one secret. See "To finish setup" below.

**Key constraint:** the Supabase edge function runs in the cloud and cannot
reach into a home network. The home network *can* reach out to Supabase.
So this is a **pull/poll** design - the home side polls for work, not the
cloud side pushing to home. No port forwarding, tunnel, or public endpoint
needed on the user's side.

### What's built

**Schema** (migration `ai_photo_scoring`):
- `families.ai_score_mode` (`'off' | 'informational' | 'nudge' | 'auto_approve'`, default `'informational'`) and `families.ai_score_auto_threshold` (1-10, default `8`) - set from the parent dashboard Settings card.
- `photo_score_requests`: `id, family_id, kid_id (nullable), room_id (nullable), storage_path, status ('pending'|'scored'|'failed'), score (1-10, nullable), comment (nullable), created_at, scored_at`. RLS enabled, zero policies - same "only the edge function touches this" pattern as every other table. A partial unique index caps it at **one pending request per kid/room at a time**, so a kid can't queue a pile of submissions while waiting on the worker.

**Kid-app flow:** a "📸 Score my room with AI" button (bedroom-reset app,
hidden entirely when a family's mode is `off`) - separate from the
existing "what done looks like" reference photos, which stay parent-only.
Photo is compressed client-side (`apps/shared/image.js`, `maxDim: 900,
quality: 0.6` - smaller than the reference-photo default since a vision
model doesn't need full resolution for a tidiness judgement) then uploaded
via `submit_photo_for_scoring`. While a request is pending, the kid app
polls every ~20s for a result (piggybacking on the existing
`fetchAndReconcile`, no separate polling infrastructure).

**Edge-function actions** (`supabase/functions/family-api/index.ts`):
- `submit_photo_for_scoring` (kid session) - uploads to
  `score-submissions/{kid_id or room-{room_id}}/...` in the existing
  `reference-photos` bucket, inserts a `pending` row. Rejects with
  `ai_scoring_disabled` if the family's mode is `off`, or `already_pending`
  if one's already queued for that kid/room.
- `get_pending_photo_scores` (**worker-token gated**) - returns up to 10
  pending jobs, each with a signed URL for the submitted photo *and* the
  kid's/room's existing reference photos, so the model has something to
  compare against.
- `submit_photo_score` (**worker-token gated**) - takes
  `{request_id, score, comment}`, marks the row `scored`. Idempotent: the
  update is guarded on `status = 'pending'`, so a retried/duplicate POST is
  a harmless no-op rather than double-awarding points. If the family's
  mode is `auto_approve` and `score >= ai_score_auto_threshold`, it awards
  the same points/streak as a PIN-confirmed Parent Check, via a shared
  helper (`awardBedroomPass` / `awardRoomPass`) also used by the normal
  PIN-checked path - logged as event type `ai_auto_pass` (not
  `parent_pass`) so it's always distinguishable in history from a real
  human check.

**Worker-token auth:** the poller isn't a parent or a kid, so it doesn't
get a session token - it authenticates with a separate static secret
(`WORKER_TOKEN`, an Edge Function secret, never shipped to any browser).
If the secret isn't set, every worker-gated call fails closed
(`{ok: false, error: "unauthorized"}`) regardless of what's sent.

**Parent-dashboard UI:** Settings card has an "AI room scoring" mode select
and a threshold number input (only shown for `nudge`/`auto_approve`).
Kid/room cards show the latest AI score inline. Activity history shows
`🤖 Auto-approved by AI` distinctly from `✅ Passed by a parent`.

### To finish setup

1. **Set the `WORKER_TOKEN` secret** in the Supabase dashboard (Project
   Settings → Edge Functions → `family-api` → Secrets, or
   `supabase secrets set WORKER_TOKEN=<value>` via the CLI). A generated
   value is sitting in this session's history - ask Claude to regenerate
   one if it's been lost, or generate your own (any long random string).
2. **Write the poller script** (Python is simplest for talking to Ollama)
   on the Ubuntu/Ollama box, triggered on a timer (cron, or a systemd
   timer - a standalone script is simpler than routing this through Home
   Assistant's automation engine). Each run:
   - POST `get_pending_photo_scores` with `{worker_token}` (outbound
     HTTPS only).
   - For each job, download `submitted_photo_url` + `reference_photos[].url`, send to a local Ollama vision model (e.g. `llava`) with a
     prompt like: *"Compare this photo to the reference photos of a tidy
     [room]. Rate tidiness 1-10 and give one short encouraging sentence."*
   - POST `submit_photo_score` with `{worker_token, request_id, score, comment}`.
3. **Turn a family's mode on** from their dashboard Settings once the
   worker is actually running - `informational` first to sanity-check the
   scores before ever turning on `auto_approve`.

### Open questions for when this gets picked up
- Exact poll interval (start with ~60s, tune once running for real)
- Which Ollama vision model ends up in use, and prompt tuning once real
  photos are tested
- Whether `auto_approve` should award fewer points than a real Parent
  Check pass (currently: same points, on purpose, to keep this simple -
  revisit if that undervalues the human check)

## Also deferred (smaller, discussed earlier)

- **Chooseable/uploadable custom icon per kid** (still a fixed emoji picker
  only). ~~Per-family icon~~ - done: a parent picks one from Settings
  (`families.icon`), shown on the dashboard header and the leaderboard.
- ~~Further checklist customisation~~ - done: the bedroom checklist is now
  per-family and parent-editable (`family_bedroom_items`, seeded with the
  original 17-item default), the same as shared rooms already were
  (`manage_bedroom_items` / `manage_room_items` in
  `supabase/functions/family-api`).
