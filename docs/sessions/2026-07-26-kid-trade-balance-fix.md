# 2026-07-26 — Kid-trade balance fix, deployed live

**Focus:** Fixed a `my-rewards` bug letting a kid propose trading away a reward category they didn't have
enough (or any) balance in, then deployed the edge function fix to production.

## Timeline

- User reported that when kids load `my-rewards`, they can trade away something they don't have — the
  give-category picker should be restricted to what they actually hold. Also asked to add a related but
  separate idea (per-kid reward weighting overrides for the spin wheel) to the roadmap - confirmed via
  "do both" partway through.
- Fixed client-side: `apps/my-rewards/app.js`'s `openProposeView()` now restricts the "you give" category
  picker to categories with a positive balance (`myGiveableCategories()`), clamps the quantity input to
  what's available (`updateGiveQtyMax()`), and disables the propose flow with a "You don't have any rewards
  to trade yet" message if the kid holds nothing tradeable.
- Fixed server-side in `supabase/functions/family-api/index.ts` (a client-side restriction alone isn't a
  real boundary per `AGENTS.md`): `propose_trade` now checks the proposing kid's actual balance
  (`getKidCategoryBalance`) before inserting a trade; `respond_to_trade`'s accept path re-checks both
  sides' balances at the moment of acceptance (balances can shift between propose and accept) and
  auto-cancels a trade that no longer checks out instead of allowing balances to go negative. See
  `D-2026-07-26-kid-trade-balance-enforcement` for the full reasoning.
- Bumped `my-rewards`' `service-worker.js` `CACHE_NAME` to v5 (JS changed).
- Added "Per-kid reward weighting overrides for the spin wheel" to `docs/TASK_BOARD.md`'s NEXT bucket, with
  schema/wheel-math/UI design notes, per the user's "do both."
- Committed and pushed both changes to this session's designated branch,
  `claude/reward-waiting-customization-czief8` (this session runs under a GitHub PR-style branch policy,
  not the repo's usual straight-to-`main` convention — see Carried forward).
- User then asked to "commit and make live" - the code was already committed; "make live" meant deploying
  the edge function, since `AGENTS.md` is explicit that pushing alone doesn't redeploy it. No Supabase CLI
  or cached access token was available in this environment, so used the `mcp__Supabase__deploy_edge_function`
  tool directly, which requires the full file content inline (no file-path/reference option) - reconstructed
  the 2,229-line `index.ts` via chunked `sed` reads to avoid the Read tool's line-number prefixes corrupting
  the source, then deployed to the `homelife` Supabase project (`wumlrhswsyazbvmajhxg`) as `family-api`
  version 35, preserving `verify_jwt: false`. Verified byte-for-byte correctness afterward by fetching the
  deployed function back and diffing it against the local file (`diff` reported no differences) - this
  step matters because the deploy tool has no path-based option, so a transcription slip in the middle of a
  100KB+ manual reconstruction could otherwise ship silently broken.

## Files touched

`apps/my-rewards/app.js`, `apps/my-rewards/service-worker.js`, `supabase/functions/family-api/index.ts`,
`CHANGELOG.md`, `docs/TASK_BOARD.md`, `DECISIONS.md` (this session's close-out).

## Related

- `D-2026-07-26-kid-trade-balance-enforcement`
- `CHANGELOG.md` "## 2026-07-26" - the trade-bug-fix entry
- `docs/TASK_BOARD.md` NEXT - "Per-kid reward weighting overrides for the spin wheel" (newly added, not
  started)

## Carried forward

- This session worked on `claude/reward-waiting-customization-czief8`, not `main` - the repo's normal
  documented convention (`AGENTS.md`: "Commit and push straight to `main`") didn't apply here because the
  session was set up under a GitHub PR-style branch policy from outside this conversation. Whoever picks
  this up next should confirm whether a PR against `main` is still wanted for this branch, since the fix is
  deployed live (edge function) but the branch itself isn't merged.
- No live end-to-end trade test was run against a disposable Supabase family this session (propose →
  balance-shifts-in-between → accept-gets-auto-cancelled) - only a byte-for-byte deploy-content diff, which
  confirms the *shipped* code matches the intended source but not that the new behavior is bug-free in
  practice. Worth a real test pass before fully trusting this in production.
- The new "Per-kid reward weighting overrides" task is open on the board, not started.
