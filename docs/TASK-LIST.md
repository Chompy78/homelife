# Task List

Scoped, forward-looking work for this repo. Every task carries enough
detail (tags, status, a concrete "done when") that it can be picked up
cold — by an AI assistant or a human — without re-deriving the design.
Bigger tasks also carry a **Design notes** block with the technical
detail (schema, files, endpoints) needed to actually build them.

**Tags in use:** `ai-vision`, `prompt`, `validation`, `feature`, `ux`,
`infra`, `refactor`. Reuse these rather than inventing near-duplicates,
so the list stays scannable by tag.

**Status values:** `open` (not started) · `in-progress` · `blocked`
(needs something external, e.g. a person/service) · `done`.

---

## 🔴 NOW

### Get the home AI worker actually running
- **Tags:** infra, ai-vision
- **Status:** in-progress
- The Supabase side (schema, edge function actions, worker-token auth,
  kid-app UI, parent-dashboard settings) is fully built and deployed.
  What's left is entirely on the home-network side: the poller script
  that fetches pending photos and calls the local vision model. A full
  copy-paste setup walkthrough has been handed to the user (Ubuntu +
  Ollama + cron); confirming it's actually running end-to-end is the
  remaining step.
- **Done when:** a kid submits a photo via "Score my room with AI," the
  home worker picks it up, scores it, and the score shows up on the
  parent dashboard — with the family's mode still set to
  `informational` (not `auto_approve`) until this is proven reliable.

<details>
<summary>Design notes</summary>

**Key constraint:** the Supabase edge function runs in the cloud and
cannot reach into a home network. The home network *can* reach out to
Supabase. So this is a **pull/poll** design — the home side polls for
work, not the cloud side pushing to home. No port forwarding, tunnel,
or public endpoint needed.

**Schema** (migration `ai_photo_scoring`):
- `families.ai_score_mode` (`'off' | 'informational' | 'nudge' | 'auto_approve'`, default `'informational'`) and `families.ai_score_auto_threshold` (1-10, default `8`) — set from the parent dashboard Settings card.
- `photo_score_requests`: `id, family_id, kid_id (nullable), room_id (nullable), storage_path, status ('pending'|'scored'|'failed'), score (1-10, nullable), comment (nullable), created_at, scored_at`. RLS enabled, zero policies — same "only the edge function touches this" pattern as every other table. A partial unique index caps it at **one pending request per kid/room at a time**.

**Kid-app flow:** a "📸 Score my room with AI" button (bedroom-reset
app, hidden entirely when a family's mode is `off`) — separate from the
existing "what done looks like" reference photos, which stay
parent-only. Photo is compressed client-side (`apps/shared/image.js`,
`maxDim: 900, quality: 0.6`) then uploaded via `submit_photo_for_scoring`.
While a request is pending, the kid app polls every ~20s for a result.

**Edge-function actions** (`supabase/functions/family-api/index.ts`):
- `submit_photo_for_scoring` (kid session) — uploads to
  `score-submissions/{kid_id or room-{room_id}}/...` in the existing
  `reference-photos` bucket, inserts a `pending` row. Rejects with
  `ai_scoring_disabled` if the family's mode is `off`, or
  `already_pending` if one's already queued.
- `get_pending_photo_scores` (**worker-token gated**) — returns up to
  10 pending jobs, each with a signed URL for the submitted photo *and*
  the kid's/room's existing reference photos.
- `submit_photo_score` (**worker-token gated**) — takes
  `{request_id, score, comment}`, marks the row `scored`. Idempotent:
  guarded on `status = 'pending'`, so a retried POST is a no-op. If the
  family's mode is `auto_approve` and `score >= ai_score_auto_threshold`,
  awards the same points/streak as a PIN-confirmed Parent Check via
  `awardBedroomPass` / `awardRoomPass` — logged as `ai_auto_pass`.

**Worker-token auth:** the poller authenticates with a static secret
(`WORKER_TOKEN`, an Edge Function secret, never shipped to any
browser). If unset, every worker-gated call fails closed.

**Poller script contract:** POST `get_pending_photo_scores` with
`{worker_token}` → for each job, download `submitted_photo_url` +
`reference_photos[].url`, send to a local Ollama vision model with a
tidiness-rating prompt → POST `submit_photo_score` with
`{worker_token, request_id, score, comment}`.

**Open questions:** exact poll interval (started at ~2 min, tune once
running for real); which Ollama vision model ends up in use, and
prompt tuning once real photos are tested; whether `auto_approve`
should award fewer points than a real Parent Check pass (currently:
same points, on purpose — revisit if that undervalues the human check).
</details>

---

### Improve scoring consistency
- **Tags:** ai-vision, prompt
- **Status:** open
- The scoring prompt needs explicit ranges so messy rooms aren't scored
  too generously:
  - 1–3 = messy / unacceptable
  - 4–6 = partially tidy
  - 7–8 = good
  - 9–10 = excellent
- **Done when:** obviously messy test photos consistently score below 5.

### Require structured output from the model
- **Tags:** ai-vision, prompt
- **Status:** open
- Update the worker's prompt (see the poller contract above) so every
  response is `{score, comment}` where the comment always contains
  exactly 3 specific, actionable improvement steps — not just an
  encouraging sentence.
- **Done when:** every scored response includes exactly 3 actionable
  steps, and the edge function/UI can rely on that shape.

### Improve prompt strictness and clarity
- **Tags:** ai-vision, prompt
- **Status:** open
- Tighten the prompt so the model compares more strictly against the
  reference photos and doesn't overpraise incomplete cleaning.
- **Done when:** scoring and feedback reflect actual cleanliness on a
  small manual test set of real vs. staged photos.

### Detect room type before scoring (anti-cheat, layer 1)
- **Tags:** ai-vision, validation
- **Status:** open
- Extend the scoring prompt so the model first identifies whether the
  photo is actually a bedroom (or the relevant shared room) vs. some
  other scene. If not a match, short-circuit to score `0` rather than
  scoring the wrong thing.
- **Done when:** a non-bedroom photo submitted for a bedroom score is
  rejected/zeroed instead of scored normally.

### Reject invalid or unclear photos
- **Tags:** ai-vision, validation
- **Status:** open
- Detect and reject blank images, extreme closeups, and otherwise
  irrelevant/unusable photos before they consume a scoring request.
- **Done when:** unusable test photos don't get a real score back.

### Generate a room fingerprint from reference photos
- **Tags:** feature, ai-vision
- **Status:** open
- From each kid's/room's existing reference ("what done looks like")
  photos, extract simple identifying features — bed type, floor type,
  major objects, key visual landmarks — and store them in structured
  form (new column or table, e.g. `kids.room_fingerprint` /
  `family_rooms.room_fingerprint` as jsonb).
- **Done when:** every kid/room with reference photos has a stored
  fingerprint.

### Verify submitted photos match the known room (anti-cheat, layer 2)
- **Tags:** feature, ai-vision
- **Status:** open
- Depends on the fingerprint task above. Compare each newly submitted
  photo against the stored fingerprint for that kid/room; on mismatch,
  score `0` rather than scoring a photo of the wrong room (or someone
  else's room).
- **Done when:** a photo from a different room than the one being
  scored is rejected instead of scored normally.

---

## 🟡 NEXT

### Photo freshness validation
- **Tags:** feature, validation
- **Status:** open
- Extract the EXIF timestamp from submitted photos where available,
  and reject or flag photos older than a threshold (catches a kid
  reusing an old "tidy" photo instead of taking a new one).
- **Done when:** a reused/old photo is reliably flagged or blocked.

### Enforce actionable improvement suggestions
- **Tags:** ai-vision, ux
- **Status:** open
- Builds on "require structured output" above — this is about the
  *quality* of the 3 actions, not just their presence: specific and
  useful ("put the books back on the shelf"), not generic ("tidy up
  more").
- **Done when:** feedback reads as concrete and usable, not generic,
  across a small manual test set.

### Adjust tone for children
- **Tags:** ai-vision, ux
- **Status:** open
- Ensure the model's comment is simple, encouraging, and
  age-appropriate regardless of how low the score is — a low score
  should still feel motivating, not harsh.
- **Done when:** responses read as child-friendly on a manual review
  pass, including low-score cases.

### Consolidate validation + scoring into one prompt
- **Tags:** ai-vision, refactor
- **Status:** open
- Once the individual pieces above (room detection, photo validation,
  room matching, scoring, structured feedback) all exist, merge them
  into a single prompt/call rather than several separate model calls —
  cheaper and simpler than chaining requests.
- **Done when:** one prompt handles validation, matching, scoring, and
  feedback in a single response.

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

---

## ✅ Recently done (for context, not action)

- **Per-family icon** — a parent picks one from Settings
  (`families.icon`), shown on the dashboard header and the leaderboard.
- **Bedroom checklist customization** — per-family and parent-editable
  (`family_bedroom_items`, seeded with the original 17-item default),
  same as shared rooms (`manage_bedroom_items` / `manage_room_items` in
  `supabase/functions/family-api`).
- **AI photo scoring — Supabase side** — schema, edge function actions,
  kid-app UI, and parent-dashboard settings are all built and deployed;
  see the worker task at the top of NOW for what's still open.

---

## Overall "done" for the AI scoring quality/anti-cheat cluster

- Invalid photos are rejected before they're scored.
- Only the correct room/kid is accepted for a given scoring request.
- Scores are realistic (messy rooms score low, tidy rooms score high).
- Every response includes exactly 3 specific, actionable steps.
- Feedback is useful, consistent, and age-appropriate.
