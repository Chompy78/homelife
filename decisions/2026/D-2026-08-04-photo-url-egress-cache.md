# D-2026-08-04-photo-url-egress-cache

Date: 2026-08-04
Status: Done

**Context:** The user hit Supabase's 5GB/month Storage egress cap mid-month. Investigation traced most
of it to `parent-dashboard`, which auto-refreshes every 45s (`REFRESH_INTERVAL_MS`) and, on every tick,
tears down and rebuilds every kid/room card's photo grid and AI-score thumbnail from scratch. Every photo
URL comes from `family-api`'s `createSignedUrl()`, which mints a brand-new token on every call even when
the underlying file hasn't changed. A fresh URL string for the same unchanged photo makes the browser
treat it as a new resource, so it re-downloads the full image bytes rather than reusing its own
HTTP/image cache — meaning a dashboard tablet left open all day was silently re-downloading every visible
photo roughly 80 times/hour for no reason. `bedroom-reset` has the same pattern on a smaller scale
(reference-photo grid, AI-score thumbnail re-set on every `fetchAndReconcile()`/pending-score poll).

**Options:**
1. Do nothing code-side; just tell the user to stop leaving the dashboard tab open.
2. Lengthen `SIGNED_URL_TTL_SECONDS` and/or the poll interval — reduces frequency but doesn't fix the
   root cause, and a longer poll interval makes the dashboard feel less live.
3. Make Storage objects public and serve them via a stable (non-signed, cacheable) URL — bigger security
   posture change (this repo's convention is server-side enforcement of per-family/per-kid access; a
   public bucket would leak that boundary) and out of scope for what's actually broken.
4. Client-side cache: reuse the same signed URL string across renders for a given photo, keyed by the
   photo's own row id, for as long as that id is still valid — falls back to the fresh URL once the
   reuse window nears the server-side signed-URL TTL.

**Decision:** Option 4. Added `apps/shared/photo-cache.js` exporting `stablePhotoUrl(key, freshUrl)`,
which returns a cached URL for a given key if one was cached within the last 50 minutes (signed URLs are
valid 1 hour server-side), otherwise caches and returns the fresh one. Wired it into every place
`parent-dashboard/app.js` and `bedroom-reset/app.js` set an `<img>` src from a signed URL: reference-photo
grids (keyed by the photo row's `id`), and AI-score thumbnails (keyed by the `photo_score_requests` row
`id`, so a genuinely new submission still gets a fresh URL immediately). Lightbox click handlers were
updated to reuse the already-rendered `<img>`'s resolved `src`/`dataset.photoUrl` instead of re-reading
the original (fresh, uncached) URL off the API response, so opening the lightbox doesn't force a second
download of an image already on screen.

**Why:** The metadata poll itself (family-api's JSON response) was never the expensive part — it's small
text. The expensive part was blindly re-pointing `<img>` tags at brand-new URLs for files that hadn't
changed. Reusing the already-fetched signed URL for a given photo id lets the browser's own cache do its
job, cutting the dashboard's steady-state photo egress to near zero between actual photo changes, without
touching the security model (server-side signed URLs, family/kid scoping) or degrading how live the
dashboard feels. Bumped `CACHE_NAME` in both apps' `service-worker.js` (added `../shared/photo-cache.js`
to their asset lists) per this repo's convention, so already-installed devices pick up the fix.

**Status:** Done.
