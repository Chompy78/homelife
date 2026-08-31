# Task Board — NOW

Open work only — see `CHANGELOG.md` for what's already shipped and
`DECISIONS.md` for why non-obvious choices were made. Every task
carries enough detail (tags, status, a concrete "done when") that it
can be picked up cold — by an AI assistant or a human — without
re-deriving the design. Bigger tasks also carry a **Design notes**
block with the technical detail (schema, files, endpoints) needed to
actually build them.

**Tags in use:** `ai-vision`, `prompt`, `validation`, `feature`, `ux`,
`infra`, `refactor`, `migration`. Reuse these rather than inventing
near-duplicates, so the list stays scannable by tag.

**Status values:** `open` (not started) · `in-progress` · `blocked`
(needs something external, e.g. a person/service) · `done`.

Split from `docs/TASK_BOARD.md` on 2026-07-28 by its existing NOW/NEXT/LATER bands, following the same
pattern as AI_home_server (see `decisions/2026/D-2026-07-16-task-board-restructure.md` for this project's
own prior restructure, and AI_home_server's `RESTRUCTURE-SPEC-2026-07-27.md` for the split-file approach).
This file (NOW) is always read; see `TASK_BOARD_NEXT.md`/`TASK_BOARD_LATER.md` for further-out work.

---

## 🔴 NOW

### Redeploy `family-api` for the per-book page value multiplier
- **Tags:** infra, migration
- **Status:** blocked
- The 2026-08-31 page-value work is complete and committed on
  `claude/book-reading-multipliers-y3l9vh`, and its database half is
  already live (column `kid_reading_books.page_value_percent`, plus
  `credit_reading_spins_atomic` weighting per log entry). The edge
  function's half - `start_book` / `edit_book` accepting
  `page_value_percent`, and the `parsePageValuePercent` helper - is
  committed but **not deployed**, so until it is, the app's new input
  is accepted by the UI and then silently dropped by the backend.
- Blocked on the deploy itself, not on any decision: this session could
  not use `mcp__Supabase__deploy_edge_function`, which needs the whole
  2,700-line `index.ts` passed as literal tool input, because Bash
  output over ~25KB is diverted to a file rather than into the session,
  so the file couldn't be read back in one piece to reproduce.
  Earlier sessions (2026-07-27, 2026-08-02) did not hit that limit.
- Nothing is broken in the meantime: all 6 existing books sit at the
  column's default of 100, so both halves behave exactly as before the
  change until the redeploy lands.
- **Done when:** `family-api` is redeployed (either
  `supabase functions deploy family-api`, or the MCP tool from a
  session that can read the file whole), verified byte-for-byte via
  `get_edge_function` against the local file, and a book created
  through the real HTTP endpoint with `page_value_percent: 50` comes
  back with 50 rather than 100.

### Confirm the fingerprint-based pipeline on the real worker
- **Tags:** ai-vision, prompt, validation
- **Status:** in-progress
- `poller.py` is now on its fourth iteration - see Design notes for the
  full layer order and the failure each iteration fixed. The two most
  recent rounds: (1) a gate/scorer split after `llava:13b` scored an
  obviously-wrong photo (shoes on pavement) instead of rejecting it -
  root cause was "completion bias" (a model asked to both gatekeep and
  perform a task in one call biases toward performing it), fixed by
  never letting the model self-report `valid: true/false`, only
  evidence, with code applying the pass/fail rule; (2) a room
  **fingerprint** system after the fix from (1) surfaced the opposite
  failure - the scorer's room-match step rejected the kid's own real
  room because the bedding looked different from the reference photos.
  Comparing raw photos every time meant normal day-to-day bedding
  variation (the whole point of a tidiness check) got read as "a
  different room." A fingerprint - a one-time, structural-only
  description (walls, flooring, windows, fixed furniture, explicitly
  *not* bedding/linens) generated once per kid/room and reused - fixes
  this by removing the noisy signal from the comparison entirely rather
  than hoping the model discounts it correctly every time.
- **Done when:** on the real worker, confirm: (a) blank/blurry rejected
  with no Ollama call at all, (b) a resubmitted photo rejected as a
  duplicate, (c) `moondream` fast-rejects an obviously non-room photo,
  (d) the `llava:13b` gate rejects a room-shaped-but-wrong photo (and,
  specifically, an illustrated/fictional image like a stylized fantasy
  creature - the case that slipped past both AI gates last round and
  was only caught by the room-match step), (e) a fingerprint gets
  generated on first use and logged, (f) a real photo of the kid's own
  room - **even with different bedding than the reference photos** -
  is NOT falsely rejected, and (g) a genuinely different room still is
  rejected.

<details>
<summary>Design notes</summary>

**Layer order, cheapest and most trustworthy first:**
1. **Blank/blurry check** (`local_quality_check`, no AI) - grayscale
   pixel standard deviation catches blank/near-solid-color photos; a
   Laplacian (edge-detection) filter's variance catches blur. Direct
   measurements, not judgment calls.
2. **Reused-photo check** (`duplicate_check`, no AI) - a perceptual
   hash (`imagehash.average_hash`) compared against the target's last
   *scored* photo's hash (`photo_hash` column, round-tripped through
   `get_pending_photo_scores` as `previous_photo_hash`, stored via
   `submit_photo_score` on both scored and rejected rows -
   `getLatestPhotoHash` only ever looks at the last *scored* row, so a
   rejected submission's hash can never become the comparison point).
3. **`moondream` pre-gate** (cheap AI) - a narrow yes/no "is this
   indoors, showing a room?" Only auto-rejects on a *confident* no;
   anything else falls through to the fuller gate rather than being
   trusted outright, since it's a much smaller model.
4. **`llava:13b` room-validity gate** - perception only. The model
   reports `literal_visible_items` / `room_evidence` /
   `invalid_evidence` / `confidence` and a `setting` category
   (`indoor_room` / `outdoor` / `close_up_object` /
   `illustration_or_fictional` / `unclear` / `other_invalid`) - never a
   bare `valid` boolean. Code decides: valid only if `setting ==
   "indoor_room"`, confidence `"high"`, `room_evidence` has ≥2 items,
   `invalid_evidence` empty. Few-shot examples include shoes-on-pavement,
   a dog, a close-up object, *and* a stylized fantasy-creature
   illustration (added after one slipped through - see below). Runs at
   `temperature: 0`.
   **2026-08-02 fix** (`D-2026-08-02-gate-rejection-reason-bug`): the
   model's `reject_reason_if_invalid` field was required and
   non-nullable, so it had to write *something* even when it believed
   `setting` was `indoor_room` - if a stricter check (confidence not
   `high`, evidence count) then still failed, that affirmative
   room description got shown to the kid as their rejection reason,
   reading like a compliment instead of an explanation. Made the field
   nullable (matching `mismatch_reason` in the scorer below, which
   already did this correctly) and had `llava_gate()` build the reason
   from whichever specific criterion actually failed instead of trusting
   the model's freeform text whenever `setting == indoor_room`.
5. **Room fingerprint** (generated lazily, cached) - **history, kept for
   context:** for a stretch this was drift-disconnected from scoring -
   `D-2026-07-17-poller-fingerprint-generation` added generation as
   additive code wired only to the dashboard's on-demand "Regenerate
   now" flow, never to `process_job`/`llava_score`, and this task's own
   design notes weren't corrected to say so until 2026-08-02, when
   reading the user's actual live `poller.py` surfaced it directly. As
   of 2026-08-02 (`D-2026-08-02-wire-fingerprint-into-scorer`) this is
   fixed for real: if the target has no stored fingerprint yet,
   `process_job()` generates one lazily from the reference photos
   (rejecting with a message to add reference photos first if none
   exist), stores it via `submit_room_fingerprint`, and reuses it for
   every future job until reference photos change
   (`kids.room_fingerprint` / `family_rooms.room_fingerprint`,
   invalidated to `null` by `upload_reference_photo` /
   `delete_reference_photo` / `upload_family_room_photo` /
   `delete_family_room_photo`). The same `generate_room_fingerprint()`
   also still serves the dashboard's on-demand regeneration flow
   (`get_pending_fingerprint_regenerations`) - one function, two
   trigger paths.
   **2026-08-02 speed update**
   (`D-2026-08-02-poller-speed-improvements`): those same 4 upload/delete
   actions now also set `room_fingerprint_regen_requested_at`, so a
   fingerprint is usually generated eagerly (via the worker's existing
   regeneration poll) well before a kid's first submission, instead of
   the lazy path above always paying the extra AI call. The lazy path
   stays as a fallback for the rare race where a kid submits before that
   poll catches up. Reference photos themselves are now also cached on
   disk in `poller.py` (`fetch_reference_photo_b64()`, keyed by each
   photo's stable id) instead of being re-fetched from storage on every
   job - used by both this step and the scorer's tidiness comparison
   below.
   **2026-08-02 update:** the fingerprint text itself was also leaning
   on changeable details (bed cover) instead of permanent ones (floor,
   curtains, furniture type) - a plain "not bedding/linens" negative
   instruction wasn't strict enough. Fixed per
   `D-2026-08-02-fingerprint-prompt-permanence-tightening`: revised
   prompt (explicit include/exclude checklist) plus a keyword-filter
   backstop. Both fixes applied directly to the user's `poller.py` and
   delivered back to them - not yet confirmed live.
6. **`llava:13b` scorer** - only reached if all above pass. ROOM MATCH
   (Step 1) now compares the submitted photo against the fingerprint
   TEXT from step 5, not the raw reference photos, so ordinary bedding
   differences can't trip a false room-mismatch the way
   `D-2026-07-16-room-fingerprint` originally intended (and, until
   2026-08-02, never actually did - see step 5's history note).
   Tidiness scoring (Step 2/3, 1-10 with explicit ranges, one
   encouraging sentence + exactly 3 specific actions) still compares
   against the raw reference (tidy-state) photos, separately, in the
   same call.

All Ollama calls use the `format` JSON-schema parameter (constrained
output) instead of asking for JSON in prose and regex-extracting it.

**The illustration gap:** during testing, a stylized fantasy-creature
illustration (not even a real photograph) was scored instead of
rejected - it slipped past both `moondream` and the `llava:13b` gate,
and was only stopped by the (then raw-photo-based) room-match step.
The gate prompt now has an explicit `illustration_or_fictional`
category and a few-shot example for this case, but it's a real
reminder that these AI layers are not infallible even after the
gate/scorer split - see 🟢 LATER for the deterministic (non-AI)
hardening ideas that would close this kind of gap more reliably.

**Why a real `rejected` status instead of `score: 0`:** the schema
already allowed `status = 'failed'` and nothing ever set it - a real
status is clearer than teaching every consumer of `ai_score` that `0`
is a special sentinel.

**Freshness validation** (deployed - migration
`photo_score_freshness_and_rejection`): client-side compression
(`apps/shared/image.js`) strips EXIF, so the kid app captures
`file.lastModified` *before* compression and sends it as
`photo_taken_at`; rejected server-side if missing or >24h old. The
"Score my room with AI" file input also has `capture="environment"` so
mobile browsers open the camera directly rather than a gallery picker.

**Known open risk:** the two no-AI layers (blank/blur, duplicate) are
solid - direct measurements, can't hallucinate. The fingerprint system
(as of 2026-08-02, actually wired into the scorer - see step 5/6 above)
removes bedding as a room-match signal by construction, but the AI
layers overall are still vision-model judgment underneath software
rules, not proven infallible - see the illustration gap above, and
note the fingerprint's own text-generation step is itself an AI call
that could in principle still describe something changeable despite
the tightened prompt and keyword-filter backstop
(`D-2026-08-02-fingerprint-prompt-permanence-tightening`). Low-stakes
for `informational`/`nudge` modes (a parent's still in the loop); worth
being cautious about before relying on `auto_approve` for a family.
</details>

### Migration M2 - Vite/React/TS hello-world scaffold
- **Tags:** infra, migration
- **Status:** open
- Scaffold a minimal Vite + React + TypeScript app at `migration/hello-world/`,
  wired into the existing GH Pages deploy workflow
  (`.github/workflows/deploy-pages.yml`). Purely additive - no existing
  `apps/*` file is touched. This is the reusable base both for the Family
  Link proof-of-concept (M2b/M2c below) and, if that passes, the first real
  port (M3). See `D-2026-07-20-pwa-to-capacitor-migration-assessment` for
  the full option comparison behind this plan.
- **Done when:** `npm run build` in `migration/hello-world/` produces a
  working `dist/`, the GH Pages workflow publishes it at its own subpath,
  it loads correctly in a browser at that URL, and all 5 existing apps
  still deploy and load correctly after the workflow change.

<details>
<summary>Design notes</summary>

**Why this folder, not a separate repo:** isolation (the actual reason a
separate repo would help) is already free here - a new folder is trivially
`git rm -rf`-able if the Family Link test (M2c) fails, without touching any
real app. A separate repo would cost real coordination overhead (a second
`AGENTS.md`, a second deploy workflow) for a project that's ultimately
meant to live here once/if it graduates past proof-of-concept.

**The one shared-file risk:** `.github/workflows/deploy-pages.yml` currently
just uploads the whole repo (`path: ".""`) with no build step. Adding a
build step for `migration/hello-world/` is the only change here that
touches infrastructure the 5 live apps also depend on - verify all 5 still
deploy correctly, don't just check the new scaffold works.

**Vite `base` config:** must match the actual GH Pages subpath this will be
served at (e.g. `/homelife/migration/hello-world/`) or the deployed build
loads a blank page (a classic first-time Vite-on-GH-Pages mistake).
</details>

