---
description: Format a feature/change into this repo's house task format and add it to the roadmap
argument-hint: <task description>
allowed-tools: Read, Edit, Bash(git *)
---

# Homelife — add task

Format a feature/change into `docs/TASK_BOARD.md`'s existing house format and commit it directly to
`main` (no branch, no PR — this repo doesn't use either; see `AGENTS.md`'s "Project conventions").

**Do not** write a design essay. Format correctly and execute.

## Step 1 — read live context

Read `AGENTS.md`, `docs/TASK_BOARD.md`, and `DECISIONS.md` first (pull latest on `main` before reading —
another session may have pushed since you last looked). Reuse the board's existing tags (`ai-vision`,
`prompt`, `validation`, `feature`, `ux`, `infra`, `refactor`) rather than inventing near-duplicates.

## Step 2 — clarify if needed

Ask a short question (one or two at most) only if genuinely unclear: which bucket (NOW/NEXT/LATER), which
tag(s) apply, or whether a **Design notes** block is warranted (bigger tasks needing schema/file/endpoint
detail — see existing NOW/LATER entries for the pattern, including the collapsible `<details>` wrapper).
Take a sensible default and state it rather than asking when one is obvious.

## Step 3 — format the task and show it for approval

```
### <Short title>
- **Tags:** <tag, tag>
- **Status:** open
- <one paragraph: what + where + why it matters>
- **Done when:** <one objective, checkable condition>
```

Add a `<details><summary>Design notes</summary>...</details>` block after the description, before "Done
when", if the task needs schema/file/endpoint-level detail to be picked up cold.

### House rules to bake in (only where they apply)
- **Security boundary.** If the task touches family/kid data: *"enforce in the `family-api` edge function,
  never rely on a client-side UI restriction alone."*
- **Edge function redeploy.** If it edits `supabase/functions/family-api/index.ts`: *"redeploy the edge
  function explicitly — pushing to `main` alone won't update it."*
- **Cache bump.** If it changes any cached asset in an app: *"bump `CACHE_NAME` in that app's
  `service-worker.js`."*
- **POINTS sync.** If it touches point values: *"keep `POINTS` in sync between
  `supabase/functions/family-api/index.ts` and `apps/shared/config.js`."*
- **Test data.** If it needs live verification: *"test against a disposable Supabase family, not a real
  one — clean up afterward (note: `storage.objects` rows need the Storage API/dashboard, not raw SQL, to
  delete)."*
- **Decision ID.** If it warrants a `DECISIONS.md` entry: `D-<YYYY-MM-DD>-<slug>` (today's date + a short
  topic slug), matching the existing format exactly.
- **Bucket:** 🔴 NOW = urgent/in-progress · 🟡 NEXT = build work / default · 🟢 LATER = idea / low priority.

After formatting, **show the task block and ask for approval before doing anything else.** Wait for
confirmation. If changes are requested, revise and show again.

## Step 4 — execute

Only after approval:
1. Pull latest on `main`.
2. Append the formatted task to the correct bucket in `docs/TASK_BOARD.md`, matching the surrounding
   format exactly. Don't change anything else in the file.
3. Commit as `docs(roadmap): add <title> task` and push to `main`.

---

$ARGUMENTS
