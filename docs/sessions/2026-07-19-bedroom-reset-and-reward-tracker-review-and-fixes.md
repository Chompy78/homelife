# 2026-07-19 — Multi-app code review, simplify, and fix-everything pass

**Focus:** High-effort code-review + `/simplify` passes over `bedroom-reset`, then `reward-tracker`/
`my-rewards`, followed by fixing all 20 correctness findings from both reviews.

## Timeline

- User asked for a `/code-review` + `/simplify` pass on `bedroom-reset`. Code-review (6 finder angles,
  12 candidates, all independently verified) surfaced 10 confirmed/plausible correctness bugs: cross-kid
  localStorage cache leakage on a shared tablet, room-switch races in `fetchAndReconcile`/`syncItem`/the
  AI photo-submit flow, offline checklist edits silently reverted on next sync, `session_expired` never
  distinguished from a generic network failure, a missing `photo_url` on a fresh AI photo submission, an
  incomplete AI-score error-message map, a missing `updateFocus()` call in `bootRoom()`'s shared-room
  branch, and a deleted-shared-room dead end. Reported via `ReportFindings`, not fixed at the time.
- `/simplify` then applied reuse/simplification/efficiency/altitude cleanup to `bedroom-reset`: extracted
  the confirm-modal and lightbox logic (duplicated verbatim from `parent-dashboard`) into
  `apps/shared/confirm.js`/`apps/shared/lightbox.js`; collapsed `fetchAndReconcile()`'s duplicated
  bedroom/shared-room branches and the six room-dispatch wrappers into one `callRoomApi()`; merged the
  copy-pasted Pass/Great-Job handlers; removed dead CSS; made the 20s AI-score poll a lightweight
  status-only fetch instead of a full checklist rebuild; moved per-tap category-badge updates to an
  in-memory list. Verified live via Playwright, committed, pushed - hit a real merge conflict with another
  session's concurrent icon-picker-auth feature (`d51734c`), resolved by combining both sides' logic in
  `roomParentCheck`/`callRoomApi`, re-verified, pushed.
- User asked "can you run a simplify command/skill and code-review for the whole rewards pwa app? if so,
  is there any point?" - answered yes given how much churn `reward-tracker` had seen that day, user chose
  both `reward-tracker` and `my-rewards`.
- Ran the same high-effort review process on `reward-tracker` (7 finder angles) + `my-rewards`. This batch
  was notably more serious: a genuine stored-HTML-injection gap (`my-rewards` interpolated a sibling's
  `avatar_emoji` unescaped, with no server-side allowlist either), Settings' PIN-protection copy claiming
  it gated Spend when the 2026-07-18 instant-tap redesign had already removed that and the copy was never
  corrected, a stale trade-verify response able to hijack a different open trade, the Spin wheel hanging
  forever if a parent switched tabs mid-animation, `tapReward()` having no rollback/error-toast on
  failure, five category/note-management call sites silently ignoring failures, an unawaited/out-of-order
  `loadState()` race, and the "Spin twice" bonus mechanic being keyed off a fragile label-string match.
  10 findings reported via `ReportFindings`.
- `/simplify` applied to both apps: migrated `reward-tracker`'s confirm-modal to the shared module;
  extracted `escapeHtml` (duplicated in both apps, plus a pointless `escapeAttr` alias) into
  `apps/shared/escape.js`; made `renderAll()` skip rebuilding the Spin wheel/Table view while their tab
  isn't active; optimized `renderHistory()`'s per-row lookups; added a `visibilitychange` pause to
  `my-rewards`' 30s poll; corrected a stale PIN-lock comment. Explicitly skipped (noted, not fixed): the
  "Spin twice" string-match fix (needs a migration), deduplicating the 3-of-9 parent-icon-picker logic now
  triplicated across three apps (cross-app scope), and removing an apparently-orphaned "Reward Reasons"
  notes feature (still reachable via its own menu button - a product decision, not dead code). Verified
  live via Playwright, committed, pushed - hit another merge conflict (unrelated concurrent work), resolved
  cleanly, pushed.
- User said "Fix then all" - all 20 findings from both reviews. Worked through them systematically via a
  tracked task list (#60-78):
  - **bedroom-reset:** scoped local caches by kid token; centralized `session_expired` handling in
    `callRoomApi()`; added room-switch race guards (capture-the-requested-room, bail if it's since
    changed) to `fetchAndReconcile`/`syncItem`/the AI poll/the AI photo-submit handler; added a
    per-room, localStorage-persisted "dirty item" set so an offline checklist edit that fails to sync
    survives a page reload and gets retried instead of being silently reverted by the next reconcile
    (first Playwright run of this exact fix failed - the dirty tracking was in-memory only and didn't
    survive the reload the bug actually needs to reproduce; redesigned as a `Map` of per-room persisted
    sets, re-verified, passed); fixed reset-day/deleted-room-recovery/Focus-Mode gaps; covered all 12
    AI-score error codes.
  - **reward-tracker:** rollback + error toast on a failed `tapReward`; `res.ok` checks on all 5
    category/note management call sites; a `loadState()` sequence-number guard plus a generic-failure
    toast; a `setTimeout` fallback so the spin-completion promise can't hang forever if `transitionend`
    never fires; corrected the misleading PIN-protection Settings copy (in both the HTML comment and the
    user-facing description).
  - **my-rewards:** escaped `avatar_emoji` client-side; added a `verifyBusy` flag plus a
    `pendingVerify`-identity check so a stale trade-verify response can't hijack a different open trade or
    let a double-tap fire two concurrent accepts (also relaxed the busy-flag on Cancel after a first
    Playwright pass showed it otherwise blocked the *next* trade's picker for the length of the abandoned
    request).
  - **Edge function + DB:** `submit_photo_for_scoring` now returns an enriched `photo_url` (matching
    `getLatestPhotoScore()`'s pattern); `avatar_emoji` capped at 16 chars server-side on kid add/rename
    (defense in depth per AGENTS.md's server-side-enforcement rule); added a migration
    (`add_is_bonus_spin_flag_to_reward_categories`) giving `family_reward_categories` a stable
    `is_bonus_spin` boolean, backfilled for all 6 existing families with a "Spin twice" category, the seed
    trigger updated to set it on new families, deletion blocked server-side
    (`category_linked_to_spin_mechanic`), a lock icon shown client-side - see
    `D-2026-07-19-bonus-spin-category-flag`.
  - Deployed the edge function twice (once for photo_url/avatar_emoji, once for is_bonus_spin), both
    delegated to a subagent for the read-full-file-and-deploy cycle to keep the ~2200-line file's content
    out of the main context window; both deploys verified live against disposable test families
    (`deploytest-fixes`, `zztest_deploy_verify`), fully cleaned up afterward (one orphaned test image left
    in the `reference-photos` storage bucket - can't be deleted via SQL, noted, not urgent).
  - Committed and pushed as `e94e638`.

## Files touched

`apps/bedroom-reset/app.js`, `apps/shared/confirm.js` (new), `apps/shared/lightbox.js` (new),
`apps/reward-tracker/app.js`, `apps/reward-tracker/index.html`, `apps/my-rewards/app.js`,
`apps/shared/escape.js` (new), `apps/*/service-worker.js` (cache version bumps: bedroom-reset v20→v21,
reward-tracker v14→v15, my-rewards v2→v3), `supabase/functions/family-api/index.ts`, `CHANGELOG.md`,
`DECISIONS.md`.

## Related

- `D-2026-07-19-bonus-spin-category-flag`
- `CHANGELOG.md` "## 2026-07-19" - three entries (bedroom-reset review/simplify, reward-tracker/my-rewards
  review/simplify, the fix-all-20-findings pass)

## Carried forward

- Three cleanup items explicitly skipped during `/simplify` and not since revisited: the 3-of-9
  parent-icon-picker logic is still triplicated across `reward-tracker`, `parent-dashboard`, and
  `bedroom-reset`; an apparently-orphaned "Reward Reasons" notes feature in `reward-tracker` is still
  reachable via its own menu button with no live consumer passing it a note; deleting the leftover orphaned
  test image in the `reference-photos` storage bucket from the second edge-function verification run needs
  the Storage API/dashboard, not SQL.
- The pre-existing 🔴 NOW task on `docs/TASK_BOARD.md` ("Confirm the fingerprint-based pipeline on the real
  worker") is unrelated to this session's work and was left untouched.
