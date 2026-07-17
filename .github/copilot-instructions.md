<!-- Destination: .github/copilot-instructions.md -->
# Homelife — instructions for AI coding agents

**Full instructions live in [`/AGENTS.md`](../AGENTS.md) at the repo root — read it before making any
change.** This stub repeats only the safety-critical rules so they are always in front of you.

Homelife is a family chore-tracking PWA (Supabase-backed), deployed to GitHub Pages.

## Hard rules (the non-negotiables — `AGENTS.md` has the rest)
- **Security boundary is server-side, always.** Every family/kid table has RLS enabled with zero
  policies — the `family-api` edge function (service-role key) is the only reader/writer, and it enforces
  per-family/per-kid scoping itself. A client-side UI restriction alone is never sufficient.
- **The edge function deploys separately** from the GitHub Pages workflow — redeploy it explicitly after
  editing `supabase/functions/family-api/index.ts`.
- **Bump `CACHE_NAME`** in each app's `service-worker.js` whenever any cached asset changes.
- **Keep `POINTS` in sync** between `supabase/functions/family-api/index.ts` and `apps/shared/config.js`.
- **Test against disposable Supabase data**, never production families.
- **Commit and push straight to `main`** — no feature-branch workflow is in use for this repo.
- Update `CHANGELOG.md`/`DECISIONS.md`/`docs/TASK_BOARD.md` as part of finishing a task, not a separate
  cleanup step.

→ For the governance-doc formats, concurrent-editing rules, and full project conventions, **read
[`/AGENTS.md`](../AGENTS.md).**
