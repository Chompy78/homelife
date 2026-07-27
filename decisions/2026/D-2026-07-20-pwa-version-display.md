# D-2026-07-20-pwa-version-display

Date: 2026-07-20
Status: Done

**Context:** No device running any of the four PWAs had any visible way to confirm which build it was
actually on - the only version-like signal that exists at all is each app's own `CACHE_NAME` in its
`service-worker.js`, invisible to whoever's using the app. Wanted to surface it in the UI so a stale
cached device could actually be identified as such, without inventing a second version string to keep in
sync.

**Options:**
1. Duplicate the version as a separate constant in `app.js`/`index.html`, bumped alongside `CACHE_NAME`.
2. Have the page ask its active service worker for the version via `postMessage`/message-channel.
3. Have the page directly `fetch("./service-worker.js")` and regex out `CACHE_NAME` from the source text.

**Decision:** Option 3.

**Why:** Option 1 is exactly the kind of duplication this project has been actively removing all week
(shared `confirm.js`/`lightbox.js`/`escape.js`) - a second hand-typed copy is a second place to forget to
bump, defeating the point. Option 2 is the "correct" way to talk to a service worker but needs a
registration-ready check, a message round-trip, and still needs a fallback for the pre-install/first-load
case - real complexity for four apps that don't otherwise do any SW message-passing. Option 3 is a plain
`fetch` of a file already being served, works identically before and after install, and naturally reflects
whichever service worker instance is currently intercepting that fetch (the old one until it hands off to
a newly-activated one), which is exactly "what this device is actually running right now."

**Status:** Done.
