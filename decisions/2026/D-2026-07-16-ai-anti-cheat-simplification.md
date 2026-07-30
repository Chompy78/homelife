# D-2026-07-16-ai-anti-cheat-simplification

Date: 2026-07-16
Status: Done

**Context:** The task board scoped the AI scoring-quality/anti-cheat
cluster as ~10 separate tasks, including storing a "room fingerprint"
(extracted features from reference photos, saved to a new column) to
compare submitted photos against, and reading EXIF timestamps for
freshness checks. Building this out surfaced that some of that scope
wasn't actually needed, and one piece (EXIF) wouldn't have worked at
all.

**Options:**
1. Build it exactly as scoped: a fingerprint-extraction step, a new
   schema column to store it, comparison logic, and EXIF-based
   freshness checks.
2. Simplify: drop the fingerprint storage (the model already gets the
   room's reference photos in every scoring request, so it can compare
   directly, in the same call); replace EXIF with a client-captured
   timestamp; use the schema's existing but unused `'failed'` status
   for rejections instead of overloading `score` with a fake `0`; and
   collapse the ~8 prompt-related tasks (consistency, structured
   output, room detection, invalid-photo rejection, room matching,
   actionable feedback, child-friendly tone, consolidation) into one
   prompt from the start, since "consolidate into one prompt" was
   already the end state the original scoping was building toward.

**Decision:** Option 2.

**Why:** `get_pending_photo_scores` already returns the submitted photo
*and* the room's reference photos together - a fingerprint would have
been storing a lossy summary of information the model already receives
in full on every request, for no real benefit. On freshness: this
project's own client-side compression (`apps/shared/image.js`)
re-encodes photos through a canvas, which strips EXIF - so an
EXIF-based check would have silently never worked, since the only
place a photo exists in the pipeline is post-compression. Capturing
`file.lastModified` before compression sidesteps that entirely. On
`'failed'` vs `score: 0`: the schema already had a status value for
exactly this case; using it is more explicit than teaching every
consumer of `ai_score` that `0` is a special sentinel.

**Status:** Done for the repo-side pieces (freshness validation, the
`failed`/rejection path, exposing `rejection_reason` to both apps) -
deployed as edge function v9 and verified against a disposable test
family. The consolidated-prompt piece lives in `poller.py` on the
user's Ubuntu box, outside this repo - delivered but not yet confirmed
redeployed (see `docs/TASK_BOARD.md`).

**Superseded (partially):** the "no stored fingerprint" reasoning above
turned out to be wrong in practice - see `D-2026-07-16-room-fingerprint`.
Comparing against raw reference photos on every request meant ordinary
day-to-day bedding differences got read as evidence of "a different
room," causing real false rejections. The freshness (`lastModified`)
and `'failed'`-status decisions above still stand; only the
no-fingerprint call was reversed.
