# 2026-07-20 — First git tag, PWA version-display idea

**Focus:** Created the repo's first git tag; discussed (not yet built) showing each PWA's cache version in
its own UI.

## Timeline

- User asked how to create a GitHub tag, then asked to actually tag the current state. No existing tags or
  version numbers existed anywhere in the repo (no `package.json`, no manifest `version` fields) to reuse,
  so asked the user to pick a scheme - they chose semantic versioning starting at `v1.0.0`.
- Created an annotated tag `v1.0.0` locally on `e94e638` (the fix-everything commit) and attempted
  `git push origin v1.0.0` - failed with `HTTP 403` from the git relay this session's credentials go
  through, even though the same relay had handled every branch push to `main` that day without issue.
  Per this environment's proxy guidance (403s shouldn't be retried or routed around), did not keep
  retrying - flagged it as likely a permissions scope gap (branch push allowed, tag push not) and reported
  it rather than guessing at a workaround.
- Talked the user through creating the tag directly on github.com instead (Releases → "Choose a tag" →
  type `v1.0.0`, target `main`, publish). User did this themselves and confirmed.
- Verified the tag landed on the remote pointing at the correct commit (`e94e638`) via
  `git ls-remote --tags`. The locally-created annotated tag object didn't match GitHub's (different tag
  object type - GitHub's was a lightweight tag), so `git fetch --tags` refused to overwrite it; deleted the
  stale local tag and re-fetched to adopt GitHub's as the authoritative one. No further action needed.
- Explained, in plain English, what the four apps' `service-worker.js` `CACHE_NAME` strings actually are
  (per-app cache-busting counters, not a real version number, not tied to git) - this came up because the
  user had been told there was nothing in the repo to reuse as a tag name.
- User asked whether it'd be useful to surface that version number in each app's own UI, so they could
  visually confirm which build a given device is actually running. Agreed it's a real gap (no current way
  to tell if a tablet's service worker actually picked up an update) and recommended showing it somewhere
  low-key (footer or Settings) sourced from the existing `CACHE_NAME` rather than a second hand-typed
  copy, since two copies is exactly the kind of thing that quietly drifts apart. Not built yet - user was
  asked whether to build it for one or all four apps and hasn't answered; see Carried forward.

## Files touched

None - this session was git/GitHub operations and conversation, no code changes.

## Related

- No `DECISIONS.md` entry: picking `v1.0.0` as the first tag name was a one-off administrative choice
  with no real "options considered" weight, not a design decision in the sense `DECISIONS.md` is for.
- No `CHANGELOG.md` entry: tagging isn't a shipped feature or fix, and nothing else shipped this session.

## Carried forward

- **Open question for the user:** whether to build the PWA-version-display idea (show `CACHE_NAME` in
  each app's own UI, single-sourced from the service worker), and if so, for one app first or all four.
  See below for a formatted candidate task.
