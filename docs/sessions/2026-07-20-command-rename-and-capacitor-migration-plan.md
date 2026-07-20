# 2026-07-20 — Renamed AI-agent commands, then planned the PWA→Capacitor migration

**Focus:** Renamed all 8 `.claude/commands/*.md` slash commands to carry `-code-`, then produced a full
PWA-to-React/Vite/Capacitor migration assessment and turned it into a linked, sequenced task-board plan
(including an iOS track added after a mid-session correction). No app code touched - a planning/docs
session start to finish.

## Timeline

- User asked to rename the 8 `.claude/commands/*.md` files to carry `-code-`, mirroring an identical
  convention already applied in a sibling repo (PACT), to distinguish these git/PR-workflow engineering
  commands from a separate family of lighter "-chat-" Claude.ai Skills used elsewhere. Explicitly asked for
  the full old→new mapping to be shown for approval before renaming anything, and for the diff to be shown
  before committing.
- Read all 8 command files in full to ground each rename in what the command actually does, not just a
  mechanical string edit. Proposed: 6 straightforward `-code-` insertions (`add-task`→`add-code-task`,
  etc.) plus 2 deliberate overrides matching PACT's own precedent exactly, since these two commands'
  descriptions are identical in substance to PACT's originals of the same name
  (`log-ai-lessons`→`log-code-lesson`, `plan-for-review`→`make-code-cold-plan-review`).
- User asked for "straightforward insertion" to be explained, then asked whether this was a new command or
  something different - clarified in plain English: pure filename renames (Claude Code derives a slash
  command's name from its filename), zero change to any command's actual instructions/behavior.
- User approved ("ok, do the rename"). Renamed all 8 via `git mv` (history preserved), updated every
  cross-reference between the command files themselves (6 edits across `sweep-code-tasks.md`,
  `close-code-session.md`, `pick-code-task.md`, `run-code-task.md`, `log-code-lesson.md`) and in
  `AGENTS.md`'s "AI agent workflow shortcuts" section, added a `CHANGELOG.md` entry and a `DECISIONS.md`
  entry (`D-2026-07-20-rename-code-commands`) with the full mapping. Deliberately left `CHANGELOG.md`'s own
  prior text, `DECISIONS.md`'s own prior text, and `docs/sessions/*.md` referencing the old names, per the
  user's explicit instruction that history isn't retroactively rewritten. Committed and pushed (`40a894d`).
- A stop-hook fired asking to commit/push; checked and confirmed the tree was already clean (another
  session had pushed 4 commits in between, pulled cleanly via fast-forward) - no action needed beyond
  syncing.
- User pasted a long structured prompt asking for a practical migration assessment: installed PWAs on the
  kids' Android tablets can stop opening once Google Family Link's daily screen-time limit hits, and
  marking Chrome "Unlimited" isn't acceptable (it would also unlock YouTube/general browsing). Inspected
  the actual repo rather than answering generically: confirmed no `package.json`/build tooling anywhere, 5
  independent vanilla-ES-module-JS PWAs under `apps/*` (each with an already-solid `manifest.json` and a
  hand-rolled, manually-version-bumped `service-worker.js`), a real `apps/shared/` `import`/`export` layer,
  GitHub Pages hosting via a build-less deploy workflow, and a fully framework-agnostic Supabase
  edge-function backend. Produced the full requested report: current-state findings, a Family Link
  mechanism explanation (WebAPK wrapping's inconsistent behavior vs. a Capacitor-built APK's real,
  independent Android package identity), a 4-option comparison (keep vanilla / React+Vite only /
  +Capacitor / Bubblewrap-TWA), cost/effort ranges, a risk/mitigation table, a staged recommendation, an
  8-milestone plan, and Claude Code workflow guidance.
- User accepted the recommendation and asked to turn the milestones into linked, trackable tasks, and asked
  where Milestone 2 should physically live (this repo vs. a separate throwaway app/repo). Recommended
  keeping it in this repo as a new `migration/hello-world/` folder rather than a separate repo - the
  isolation a separate repo would buy is already free via a disposable new folder, while a separate repo
  would cost real governance-doc duplication for no benefit. Restructured the original 8 milestones into a
  sequenced chain, inserting a Family-Link proof-of-concept pair (Migration M2b/M2c) on the trivial scaffold
  *before* any real app porting, since that's the one assumption everything else depends on and is cheap to
  test wrong early, expensive late. Asked two clarifying questions via `AskUserQuestion` (add a new
  `migration` tag? sequencing/bucket placement as drafted?) - both confirmed as recommended. Added Migration
  M2 through M8 plus a `LATER` "port remaining apps" task to `docs/TASK_BOARD.md`, and a new
  `D-2026-07-20-pwa-to-capacitor-migration-assessment` entry to `DECISIONS.md`. Committed and pushed
  (`a392d08`).
- User then remembered some family members are Apple/iOS users. Assessed the impact rather than assuming
  it changed the recommendation: Capacitor's recommendation actually strengthens (Bubblewrap/TWA has no iOS
  equivalent at all, ruling it out definitively rather than just weakening it), but flagged real new costs -
  a cloud Mac CI dependency (no local Mac available), a recurring $99/year Apple Developer Program cost for
  any real daily-use distribution (free-tier signing certs expire every 7 days), and a second, separate
  unverified assumption: whether Apple's Screen Time (App Limits / Always Allowed) treats a
  Capacitor-wrapped app independently of Safari - doesn't inherit from the Android Family Link result and
  needs its own proof. Asked three clarifying questions: Mac access (none - will use cloud CI), iOS
  proof-of-concept timing relative to Android's (after Android is fully proven, not in parallel, to avoid
  splitting focus/cost across two unverified platforms at once), and how many Apple devices (1-2 known
  ones, so free-tier device registration first rather than committing to the paid account immediately).
  Added Migration iOS-1/iOS-2/iOS-3 to `docs/TASK_BOARD.md` (gated behind Migration M7), updated Migration
  M8 and the "port remaining apps" task to flag Android-only until iOS clears, and added a
  `D-2026-07-20-ios-support-sequencing` entry to `DECISIONS.md`. Committed and pushed (`1c57505`).
- User asked to close the session out completely, planning to start Milestone 2's actual implementation in
  a fresh AI session. Verified the tree was clean and `origin/main` matched local `HEAD` exactly before
  writing this file.

## Files touched

- `.claude/commands/` - 8 files renamed via `git mv` (`add-task`→`add-code-task`,
  `pick-task`→`pick-code-task`, `run-task`→`run-code-task`, `sweep-tasks`→`sweep-code-tasks`,
  `cleanup-branches`→`cleanup-code-branches`, `close-session`→`close-code-session`,
  `log-ai-lessons`→`log-code-lesson`, `plan-for-review`→`make-code-cold-plan-review`), plus 6 cross-reference
  edits inside them
- `AGENTS.md` - updated the "AI agent workflow shortcuts" list to the new command names
- `docs/TASK_BOARD.md` - added Migration M2 through M8, Migration iOS-1/iOS-2/iOS-3, and a `LATER`
  "port remaining apps" task
- `CHANGELOG.md`, `DECISIONS.md` - see Related below
- No application code (`apps/*`, `supabase/*`) touched at all this session

## Related

- `D-2026-07-20-rename-code-commands`
- `D-2026-07-20-pwa-to-capacitor-migration-assessment`
- `D-2026-07-20-ios-support-sequencing`
- `CHANGELOG.md` "## 2026-07-20" - the command-rename entry (the migration-planning work has no
  `CHANGELOG.md` line of its own, correctly - nothing shipped yet, only planned; `CHANGELOG.md` is for
  finished work per `AGENTS.md`)

## Carried forward

- **Migration M2** (Vite/React/TS hello-world scaffold at `migration/hello-world/`) is the next piece of
  work, picked up fresh in a new AI session per the user's request. Everything it needs is already on
  `docs/TASK_BOARD.md`: the folder location, the GH-Pages-subpath `base` config gotcha, the need to insert
  a build step into `.github/workflows/deploy-pages.yml` without breaking the 5 existing apps' deploys, and
  the done-when condition.
- Migration M2b/M2c (Capacitor Android wrap + the real Family Link decision-gate test on the actual child
  tablet) follow M2, then M3 onward only if M2c passes.
- The iOS track (Migration iOS-1/iOS-2/iOS-3) is deliberately not started - gated behind Migration M7
  (Android fully proven) per this session's explicit sequencing decision.
- Nothing else open from this session - both decisions are fully written up, the task board reflects the
  agreed sequencing, and the working tree is clean.
