# Roadmap

Ideas that have been discussed and scoped but deliberately not built yet.
Each entry has enough detail that an AI assistant (or a human) picking this
repo back up cold can implement it without re-deriving the design.

## AI photo scoring (on hold - home AI not set up yet)

**Idea:** after a kid finishes a room, they take a photo, it gets scored by
the user's self-hosted AI (Home Assistant + Ollama, on their home network),
and the score/comment shows up next to the photo - informational only, a
complement to Mum Check, not a replacement for it (the PIN check stays the
source of truth for whether a room "counts").

**Status: not started.** Blocked on the user's home AI setup being ready.
Revisit when they say it's ready to wire up.

**Key constraint:** the Supabase edge function runs in the cloud and cannot
reach into a home network. The home network *can* reach out to Supabase.
So this has to be a **pull/poll** design - the home side polls for work,
not the cloud side pushing to home. No port forwarding, tunnel, or public
endpoint needed on the user's side.

### Architecture

**New table** `photo_score_requests`:
`id, family_id, kid_id (nullable), room_id (nullable), photo_path, status ('pending'|'scored'), score (int, nullable), comment (text, nullable), created_at, scored_at`
- RLS enabled, zero policies - same "only the edge function touches this"
  pattern as every other table (see root `README.md`).

**New kid-app flow:** "Submit today's photo for AI score" - a *separate*
action from the existing "what done looks like" reference photos
(`kid_reference_photos` / `family_room_photos`). Reference photos are a
static target the kid/parent sets once; this is a fresh photo of *today's*
actual result, submitted for scoring. Reuses the existing upload +
compress-in-browser pattern (`apps/shared/image.js`) and the same private
`reference-photos` Storage bucket.

**New edge-function actions**, gated by a **worker token** (a static secret
stored as a Supabase secret, *not* a session token - the poller isn't a
parent or kid device):
- `get_pending_photo_scores` - poller calls this, gets back pending
  requests with signed URLs for the submitted photo *and* the relevant
  1-3 reference photos, so the model has something to compare against.
- `submit_photo_score` - poller posts back `{request_id, score, comment}`,
  edge function writes it and flips status to `scored`.

**Home-side poller** (to build): a small script (Python is simplest for
talking to Ollama), triggered on a timer - either a plain cron job, or a
Home Assistant automation firing a shell/pyscript command every 1-2 min.
Each run:
1. Calls `get_pending_photo_scores` with the worker token (outbound HTTPS
   only).
2. For each pending item, downloads the submitted photo + reference
   photos, sends them to a local Ollama vision model (e.g. `llava`) with a
   prompt like: *"Compare this photo to the reference photos of a tidy
   [room]. Rate tidiness 1-10 and give one short encouraging sentence."*
3. Posts the result back via `submit_photo_score`.

**Display:** score + comment shown as a badge/note near the submitted
photo in the kid app and parent dashboard. Explicitly framed as fun
feedback, not a gate - Mum Check (PIN-confirmed, server-side) remains the
only thing that actually marks a room passed.

### What building this involves
- 1 migration (`photo_score_requests` + RLS-deny-all)
- Edge function additions: worker-token auth check + the 2 actions above
- Kid-app UI: camera/upload button for "today's photo" + score display
- The poller script itself, plus a short README covering Home
  Assistant/cron wiring and Ollama model setup

### Open questions for when this gets picked up
- Exact poll interval (start with ~60s, tune once running for real)
- Which Ollama vision model the user ends up running, and its prompt
  needs tuning once real photos are tested
- Whether score history is worth keeping (`photo_score_requests` rows
  already provide this for free, so probably just keep them rather than
  building a separate log table)

## Also deferred (smaller, discussed earlier)

- **Chooseable/uploadable custom icon per kid** (currently a fixed emoji
  picker only) and **per-family icon** (doesn't exist as a concept yet).
- **Further checklist customisation** beyond what shipped for shared
  rooms - the bedroom's 17-item checklist stays fixed by design; shared
  rooms already support parent add/remove of items
  (`manage_room_items` in `supabase/functions/family-api`).
