# D-2026-08-02-poller-speed-improvements

Date: 2026-08-02
Status: Done

**Context:** User asked whether the bedroom photo-scoring pipeline could be
made faster. Two concrete opportunities surfaced while reviewing the live
`poller.py` and `family-api/index.ts`: (1) reference photos are fetched
fresh from Supabase storage and re-base64-encoded on *every* scoring job
and every fingerprint generation, even though the same handful of photos
get reused until a parent changes them; (2) a room fingerprint is only
ever generated lazily, the first time a kid submits a photo after
reference photos change - adding an extra AI call's worth of latency to
whichever submission happens to be first, rather than being ready ahead
of time.

The user also asked whether tidiness scoring's reference-photo comparison
could be converted to a text description (like the room fingerprint) to
speed things up further. Declined that specific idea: room identity
(D-2026-07-16-room-fingerprint) is a good fit for a text summary because
it's a small set of discrete, describable facts (flooring, walls,
furniture type). Tidiness is a genuinely visual judgment ("does this look
as neat as the reference photo") that's hard to fully capture in words
without losing exactly the detail the scorer needs - converting it to
text risks the same category of accuracy loss this project has already
hit twice (a compressed instruction/description standing in for
something that actually needed the full picture). The photo-caching fix
below gets most of the same speed benefit without that risk, since it
only removes redundant network fetches, not any visual information.

**Options:**
1. Leave both as-is (no caching, lazy-only fingerprint generation) -
   correct but slower than necessary, and the first submission after any
   reference-photo change pays an avoidable extra AI call.
2. Cache reference photo bytes on disk in `poller.py`, keyed by each
   photo's stable database id (not its signed URL, which rotates every
   request via `SIGNED_URL_TTL_SECONDS`) - no invalidation logic needed,
   since a deleted/replaced photo gets a new row/id and its old cache
   file is simply never looked up again.
3. Make fingerprint regeneration eager: have `upload_reference_photo` /
   `delete_reference_photo` / `upload_family_room_photo` /
   `delete_family_room_photo` also set
   `room_fingerprint_regen_requested_at` (the same signal
   `request_fingerprint_regeneration` already uses), so the worker's
   existing `get_pending_fingerprint_regenerations` poll picks it up on
   its next run instead of waiting for a kid's first submission.

**Decision:** Options 2 and 3, both applied.

**Why:** Both are additive, low-risk, and reuse existing
infrastructure rather than inventing new mechanisms - option 3
literally reuses the exact column/poll/function
`request_fingerprint_regeneration` already relies on, just triggered
from two more call sites. Option 2 is a pure cache with a
correctness-by-construction invalidation story (id-keyed, no explicit
expiry needed). Neither changes scoring behavior or accuracy - option 2
sends the model the exact same images, just fetched once instead of
repeatedly; option 3 only changes *when* a fingerprint gets generated,
not what it says.

**Status:** Done.
- `poller.py`: added `fetch_reference_photo_b64()` (disk cache under
  `~/.cache/homelife-poller/reference_photos`, overridable via
  `HOMELIFE_POLLER_CACHE_DIR`), wired into both `llava_score()` and
  `generate_room_fingerprint()`. Verified with a stubbed-network unit
  test - 2 lookups of the same photo id (with a deliberately different
  URL, simulating signed-URL rotation) produced exactly 1 network call
  and identical cached content both times. Applied directly and
  delivered back to the user (poller.py lives in the separate
  `jrc-homelab/hs-homelife-poller` repo, not this one).
- `supabase/functions/family-api/index.ts`: the 4 upload/delete actions
  now also set `room_fingerprint_regen_requested_at` (respecting the
  existing `room_fingerprint_locked` guard, unchanged). Deployed as
  edge function v41; verified byte-identical via `get_edge_function`
  (md5 match). Live-smoke-tested against a disposable test family
  (`ZZTEST_FingerprintEager`): `upload_reference_photo` set
  `room_fingerprint_regen_requested_at` to a real timestamp;
  `delete_reference_photo` did the same after the flag was manually
  cleared. Test family and its uploaded photo cleaned up afterward (the
  photo via the API's own `delete_reference_photo`, so storage was
  removed properly, not just the DB row).
