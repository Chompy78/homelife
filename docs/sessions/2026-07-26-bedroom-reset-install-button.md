# 2026-07-26 — bedroom-reset PWA install button

**Focus:** Added a real "Install App" button to bedroom-reset, deployed it, then diagnosed why it wasn't
showing on the kid's tablet.

## Timeline

- User asked what custom commands exist in `.claude/commands/` — answered from the file listing.
- User asked whether `D-2026-07-20-rename-code-commands` meant they'd already renamed these commands, and
  whether that rename had been passed on to another repo — read the decision entry and clarified: the
  rename happened here in homelife, and it mirrored PACT's existing `-code-` convention rather than
  originating it. No repo work in this exchange.
- User asked for a portable "AI script" (a prompt) to run the same rename in another repo — wrote a
  self-contained prompt generalizing the D-2026-07-20 precedent (mechanical `-code-` insertion by default,
  deliberate rewrite only when that reads worse, `git mv` to preserve history, update cross-references,
  leave historical docs alone). Delivered as chat text only, nothing committed.
- User asked to add an "Install as PWA" button to the bottom of bedroom-reset. Found no existing app had a
  working install button — only a static text hint ("open this site in Chrome or Edge…") — so this was new,
  not a fix. Implemented the standard `beforeinstallprompt`/`prompt()` flow: button starts hidden, appears
  when the event fires, calls `prompt()` on click, hides again after or on `appinstalled`. Bumped
  `bedroom-reset-pwa-v22` → `v23`. Verified live in headless Chromium via Playwright (had to serve
  `apps/` as the doc root, not just `apps/bedroom-reset/`, so the `../shared/*.js` imports resolved — a
  first attempt silently failed to load `app.js` at all because of this). Confirmed: button hidden by
  default, revealed on a simulated `beforeinstallprompt`, `prompt()` invoked and button re-hidden on click.
  Committed `bf7bde0` on the session's designated branch (`claude/custom-commands-available-1s3fri`), per
  the branch's own push rules — not `main` yet.
- User reported not seeing the button and asked which version to look for. Explained: `v23` is correct, but
  more importantly the branch commit hadn't reached `main` yet, and GitHub Pages only deploys from `main`.
- User said "yes, deploy." Confirmed `main` hadn't moved since branching (clean fast-forward, not a merge
  commit) and pushed the branch tip directly onto `main` (`bf7bde0`), matching the repo's normal
  commit-straight-to-main convention once explicit permission was given to leave the session branch.
- User reported the button showed on their laptop but not the kid's Android tablet. Used
  `AskUserQuestion` to narrow down the browser and history: tablet runs both Chrome and Firefox, already on
  `v23`, and previously had a home-screen icon that was removed. Diagnosed two independent causes:
  (a) Firefox for Android has never implemented `beforeinstallprompt` at all — no code fix is possible
  there, only Firefox's own menu-based manual install; (b) Chrome likely still holds a stale
  "already installed" signal (its WebAPK) from the icon that was removed, which suppresses the prompt event
  until cleared — walked the user through Chrome's Site settings → Clear & reset as the on-device fix.
- Fixed the existing install-hint text, which said "open this site in Chrome or Edge" — inaccurate, since
  Firefox/Safari support manual install too, just not via this button's API. Reworded to point Chrome/
  Edge/Samsung Internet users at the new button and everyone else at their own browser's menu. Bumped
  `v23` → `v24` (HTML change, cached asset). Committed `a894bc4` and pushed straight to `main`.
- The environment's stop-hook flagged `a894bc4` as likely to show "Unverified" on GitHub (missing
  signature). Author/committer email was already correct (`Claude <noreply@anthropic.com>`); the actual
  gap was that the commit had no SSH signature attached, not an email mismatch — `git log --show-signature`
  locally reported "no signature" (with an unrelated `allowedSignersFile` warning, since this machine isn't
  set up to *verify* signatures locally — that's separate from whether one exists). `git commit --amend
  --no-edit --reset-author` produced a real SSH signature this time (confirmed via `git cat-file commit`
  showing a `gpgsig` block signed through the environment's `/tmp/code-sign` helper). Force-pushed
  (`--force-with-lease`) the re-signed commit (`c5993a3`) to both the session branch and `main`, since it
  was only rewriting a tip commit created and pushed earlier in this same session.
- Ran `/close-code-session` to wrap up.

## Files touched

`apps/bedroom-reset/index.html`, `apps/bedroom-reset/app.js`, `apps/bedroom-reset/styles.css`,
`apps/bedroom-reset/service-worker.js` (`CACHE_NAME` v22 → v23 → v24), `CHANGELOG.md`. Plus this file.

## Related

- `CHANGELOG.md` "## 2026-07-26" — both entries (install button, hint-text fix)
- No `DECISIONS.md` entry: using `beforeinstallprompt` was the only real option for a working in-page
  install button (the alternative was staying with a text-only hint, which was the pre-existing state
  the user explicitly asked to move past) — not enough genuine option weight to warrant a full entry.

## Carried forward

- Whether the kid's tablet's Chrome actually shows the button now (after the Site-settings clear the user
  was walked through) hasn't been confirmed back — the fix was diagnosed and explained but not verified
  live on that specific device before session close.
- Possible cross-project lesson noticed this session (see close-session report): a Claude Code commit that
  already has the correct `noreply@anthropic.com` author/committer can still lack a signature, and
  `git log --show-signature`'s "no signature" output can be misleading when it's actually a local
  verification-config gap (`gpg.ssh.allowedSignersFile`) rather than proof nothing was signed — check the
  raw commit object (`git cat-file commit`) for a `gpgsig` block before assuming signing failed. Not yet
  pushed to `ai-lessons-learned`; needs the user's go-ahead per that skill's own draft-only rule.
