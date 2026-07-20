---
description: Turn a task/idea into a self-contained plan formatted for a cold AI/human reviewer
argument-hint: [task or idea — omit to use this session's existing plan]
allowed-tools: Read, Grep, Glob, Edit, Bash(git add *), Bash(git commit *)
disallowed-tools: Bash(git push *)
---

# Homelife — draft a plan for cross-AI review

Turn a task or idea into a written plan, saved as a self-contained markdown file formatted for a
*different* AI (a separate session, a different model, or a human reviewer with no shared context) to read
cold and critique. This is a planning/drafting aid — it never implements anything itself.

Stages: **draft → approval → write → optional commit → optional push.** Only the first three are ever
required.

## Step 1 — figure out what needs a plan

`$ARGUMENTS` is the task/idea. If empty, check whether this session already worked out a plan earlier. If
neither gives enough to go on, ask the user directly.

**Trigger rule — only run this when external review would pay for itself:** use it only if a wrong
approach would cost more than one implementation cycle to undo — and remember this repo has **no PR gate**
(pushes to `main` go live immediately), which raises the value of catching a bad approach before writing
any code, not just before merging it. Reach for this skill when a task touches the `family-api` edge
function or RLS boundary, a DB schema/migration, the AI-vision pipeline's gate/scorer logic, or has
genuinely contested scope. Skip it for one-line, single-file, or mechanical changes — tell the user to
proceed directly. For a genuinely large effort, split into linked plans rather than one mega-doc.

## Step 2 — check for an existing plan on the same topic

Look in `docs/plans/` for a prior overlapping plan. If found, ask whether this is a revision (add
`Supersedes: docs/plans/<old-file>.md` near the top) or genuinely new.

## Step 3 — do the actual planning

Research whatever the plan touches (read the relevant code; check `AGENTS.md`/`docs/TASK_BOARD.md`/
`DECISIONS.md` for constraints) and work out a real plan:
- the concrete goal, and how you'd know it's done
- the proposed approach, ordered steps, naming concrete files/functions/endpoints (they don't rot like
  line numbers)
- alternatives considered and why not chosen
- what's explicitly out of scope
- risks and open questions
- which files/areas it touches

Assume the reviewer has **no access to this repo** — quote or paraphrase any constraint inline (the
security model, the edge-function boundary, the AI-vision pipeline's layered design); "see AGENTS.md" is
useless to them. Distinguish facts you verified from things you're assuming.

**Never inline secrets/credentials/tokens** (service-role keys, session tokens) — paraphrase the existence
of a constraint, not its value.

## Step 4 — package it for a cold reviewer

```markdown
# Plan: <short title>

<Supersedes: docs/plans/<old-file>.md — only if Step 2 found a prior version>

## Goal
<what this achieves and why, assuming the reader has never heard of this task>

## Context
<constraints/background a reviewer needs, quoted or paraphrased inline>

## Assumptions vs. verified facts
- **Verified:** <facts you confirmed>
- **Assumed:** <guesses the plan rests on>

## Proposed approach
1. <step>
...

## Files involved
- <path — what changes and why, named by function/endpoint, not line number>

## Out of scope
- <deliberately excluded>

## Alternatives considered
- <alternative> — rejected because <reason>

## Risks / open questions
- <genuinely uncertain items>

## Verification
<how you'll prove the goal was met — for this repo that's live verification (a disposable Supabase
family for backend changes, a real-photo run for AI-vision-pipeline changes, a manual reload for
frontend/cache changes) since there's no automated suite and no PR gate to catch a miss.>

## Done when
<objective, checkable condition(s) for the plan's own deliverable — not "committed"/"pushed">

---

## Reviewer instructions
**Before anything else, state which AI model and settings you are** — e.g. "GPT-5 (default)", "Claude
Opus (extended thinking)", "human reviewer" — as the first line of your response.

You are reviewing this **cold, with no access to the codebase** — judge logic, clarity, scope, and risk,
not code correctness you cannot verify. Find gaps, unstated risks, and better alternatives:
1. Does the approach actually achieve the goal?
2. Which assumptions look shaky, and what happens if one is wrong?
3. Is anything in "Alternatives considered" actually better, or is this overcomplicated for the goal?
4. What's missing — an edge case, a risk, a verification step?
5. Are "Verification" and "Done when" objectively checkable?
6. Should this be split? Is anything in "Out of scope" actually load-bearing?

Write findings as a plain list — don't rewrite the plan yourself unless asked. If a section is genuinely
solid, say so briefly rather than inventing concerns.

**Deliver your review as a Markdown file**, led by your model/settings line, named
`<plan-topic>-review-<your-model>.md`. If you can't emit a file, give the review as one copy-pasteable
Markdown block, still led by the model line.

---

## Review outcome (fill in after the review + implementation)
- Reviewers (models): <...>
- Reviewer findings: <N> → accept <A> / reject <R> / defer+convert <C>
- Materially changed the plan? <yes/no — one line>
- Without the review, what would have happened: <one line>
```

## Step 5 — show it before writing anything

Show the drafted content and ask for approval before writing to disk. Revise and re-show if changes are
requested.

**Present the plan as one clean copy-paste block** using a **four-backtick fence** (the plan body contains
three-backtick blocks internally, which would close a three-backtick outer wrapper early).

## Step 6 — write the file

Once approved: `docs/plans/<date>-<slug>.md` (create `docs/plans/` if needed; `<date>` = today,
`YYYY-MM-DD`). If the filename exists and isn't the same plan being revised, append `-2`, `-3`, etc.

Then, as a separate question, ask whether to commit it (docs-only, straight to `main` per this repo's
convention — fine to leave uncommitted if it's just being pasted elsewhere). Pushing is a further,
separate ask.

## Step 7 — handle returned review feedback

Expect loosely-formatted feedback, possibly from more than one reviewer — ask "any other review responses
before I go through this, or is that everything?" before triaging. Once complete:
- Note where multiple reviews agree vs. disagree — agreement across independent reviewers is a stronger
  signal than one opinion.
- Apply a finding directly only when low-risk and clearly correct against this repo's stated conventions.
- Stop and ask the user before acting on anything touching secrets, the security boundary, or reflecting
  reviewer disagreement.
- Summarize what you applied, what you skipped (and why), and what's waiting on the user.
- Categorise each finding: accept / reject / defer / →test / →doc-note / →roadmap item — treat each as a
  hypothesis to verify against the actual code, not an instruction.
- If the plan file exists on disk, fill in its "Review outcome" stub.

---

$ARGUMENTS
