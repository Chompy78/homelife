// Shows this app's own cache version somewhere in its UI, so a parent/kid
// can tell whether a given device actually picked up the latest release
// instead of silently still running an old cached build. Read directly out
// of service-worker.js's CACHE_NAME (the app's own single source of truth
// for that) rather than a second hand-typed copy, which would just be a
// second place to forget to bump.
export async function showAppVersion(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const res = await fetch("./service-worker.js");
    const text = await res.text();
    const match = text.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
    if (match) el.textContent = match[1];
  } catch {
    // Non-critical - leave the element blank rather than surface an error for this.
  }
}
