// Supabase signed Storage URLs get a brand-new token every time the backend
// calls createSignedUrl(), even when the underlying photo hasn't changed.
// Apps that poll on a timer (parent-dashboard, bedroom-reset) rebuild their
// photo grids from scratch on every tick, so a fresh-but-different URL for
// the *same* file makes the browser treat it as a new resource and
// re-download the full image - the actual cause of runaway Supabase egress
// from photos that were never touched.
//
// This cache reuses the same URL string across renders for a given photo
// key, so unchanged photos are served from the browser's own image/HTTP
// cache instead of pulling bytes from Supabase again. Signed URLs are valid
// for 1 hour server-side (SIGNED_URL_TTL_SECONDS in family-api); we stop
// reusing a cached one after 50 minutes so a long-open tab never sits on a
// URL that's about to expire.
const REUSE_WINDOW_MS = 50 * 60 * 1000;
const cache = new Map(); // key -> { url, cachedAt }

export function stablePhotoUrl(key, freshUrl) {
  if (!freshUrl) return freshUrl;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.cachedAt < REUSE_WINDOW_MS) {
    return entry.url;
  }
  cache.set(key, { url: freshUrl, cachedAt: Date.now() });
  return freshUrl;
}
