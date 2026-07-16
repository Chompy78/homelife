# Decisions

A record of real decisions made on this project — choices between
options, design directions, fixes for non-obvious problems. Newest
entry on top. See `AGENTS.md` for the format and when to add one.

---

## D-2026-07-16-governance-docs

**Context:** `CHANGELOG.md`, `DECISIONS.md`, and a task board weren't
being used consistently — open ideas, finished work, and the reasoning
behind non-obvious choices all lived only in conversation history,
which doesn't survive between sessions.

**Options:**
1. Keep relying on conversation history and the task board's own prose
   to carry this context.
2. Set up dedicated `AGENTS.md` (canonical instructions), `DECISIONS.md`
   (why), and `CHANGELOG.md` (what shipped) files, with `TASK_BOARD.md`
   trimmed to hold only open work.

**Decision:** Option 2.

**Why:** A task board that also tries to be a changelog and a decision
log ends up doing all three badly — finished work clutters the list of
what's actually next, and the reasoning behind a fix gets lost once the
task line is deleted. Splitting them keeps each file scannable for its
one job, and `AGENTS.md` gives a fresh session (human or AI) one place
to learn the rules instead of re-deriving them from history.

**Status:** Done.

---

## D-2026-07-16-task-board-restructure

**Context:** `docs/ROADMAP.md` was a flat list of scoped-but-unbuilt
ideas with no priority, status, or acceptance criteria — every entry
read the same regardless of urgency or how close to done it was.

**Options:**
1. Keep the flat prose-list format, just add new ideas to it.
2. Restructure by priority (NOW/NEXT/LATER) with tags, a status per
   task, and a concrete "done when" condition on every task, while
   keeping a "Design notes" block for tasks that need real technical
   depth to be picked up cold.

**Decision:** Option 2, and renamed the file (`ROADMAP.md` →
`TASK_BOARD.md`, via an intermediate `TASK-LIST.md`) to match its new
purpose.

**Why:** "Improve the AI prompt" never closes; "obviously messy test
photos consistently score below 5" does. The old format's real strength
— enough implementation detail that a cold pickup doesn't require
re-deriving the design — was worth keeping for big tasks, so that
became an optional nested section rather than being dropped for the
sake of scannability.

**Status:** Done. Superseded the "Also deferred" / flat-idea format.

---

## D-2026-07-15-worker-token-auth

**Context:** The AI photo-scoring worker (a script on the user's home
network) needs to call two edge-function actions
(`get_pending_photo_scores`, `submit_photo_score`), but it isn't a
parent or a kid — it has no session token, and Supabase Auth JWTs
aren't used anywhere in this project (see the RLS/session-token
pattern in `AGENTS.md`).

**Options:**
1. Force the worker into the existing parent/kid session-token model
   somehow (e.g. a synthetic "worker family").
2. A separate, simple static-secret scheme: a `WORKER_TOKEN` edge
   function secret, compared via equality, fails closed if unset.

**Decision:** Option 2.

**Why:** The worker is a single trusted process on the user's own
network, not a multi-tenant actor — it doesn't need per-family scoping
or rotation machinery, just a bar high enough to keep the two
worker-only actions from being callable by a browser. Reusing the
session-token model would have added complexity (fake family/kid rows)
for no real security benefit.

**Status:** Done.

---

## D-2026-07-15-ai-scoring-configurable-modes

**Context:** Initial scope for AI room-tidiness scoring was
informational-only (just show a score). While scoping the build, the
user's answer to "how should the score affect the app?" expanded this:
they wanted the option to tie it to the existing Parent Check flow.

**Options:**
1. Ship informational-only, revisit auto-approval later as a separate
   feature.
2. Build a per-family configurable mode from the start: `off` /
   `informational` / `nudge` / `auto_approve` (with a threshold),
   sharing the exact points/streak logic the PIN-confirmed Parent
   Check already uses.

**Decision:** Option 2.

**Why:** The user explicitly wanted control over how much to trust the
AI before it can act on its own — informational-only would have meant
rebuilding the mode system later anyway once someone wanted
auto-approval. Reusing the existing pass-award logic (extracted into
shared `awardBedroomPass`/`awardRoomPass` helpers) meant auto-approve
could reuse the same points/streak/idempotency guarantees as a human
check, rather than reimplementing them.

**Status:** Done. Auto-approve currently awards the same points as a
PIN-confirmed pass, on purpose, to keep the model simple — open to
revisit if that's judged to undervalue the human check (tracked as an
open question in `TASK_BOARD.md`).

---

## D-2026-07-15-ai-scoring-pull-architecture

**Context:** The AI vision model runs on the user's home network
(Ollama), but Supabase's edge function runs in the cloud. The cloud
side has no way to reach into a home network without port forwarding,
a tunnel, or a public endpoint.

**Options:**
1. Push architecture — Supabase calls out to the home network when a
   photo is submitted, requiring the user to expose something inbound.
2. Pull/poll architecture — a script on the home network polls
   Supabase for pending work and posts results back; nothing inbound
   needed on the user's side.

**Decision:** Option 2.

**Why:** Home networks are asymmetric by default — outbound is easy,
inbound requires the user to actively expose their network, which is a
real security cost for a chore-tracking app. Pull/poll trades a small
amount of latency (poll interval) for zero exposure.

**Status:** Done.

---

## D-2026-07-15-reference-photos-parent-only

**Context:** Kids could add and remove their own "what done looks
like" reference photos. The user reported this as unwanted — kids
were removing photos from their own view — and asked for parent-only
control.

**Options:**
1. Keep kid photo management but fix whatever bug let them remove
   photos unexpectedly.
2. Remove kid photo-management entirely: client UI removed for kids,
   and — the part that actually matters — the edge function's
   `upload_reference_photo` / `delete_reference_photo` /
   `upload_family_room_photo` / `delete_family_room_photo` actions
   reject any session that isn't `role === "parent"`.

**Decision:** Option 2.

**Why:** This was a real permissions gap, not just a UI bug — a kid
session could call the same edge-function actions directly regardless
of what the UI showed. Removing the client-side controls alone
wouldn't have closed that; the server-side role check is the actual
fix, per the standing rule that the edge function is the only real
security boundary in this project.

**Status:** Done. Verified with real backend requests proving a kid
session is rejected while a parent session still succeeds.

---

## D-2026-07-13-photo-delete-dashboard-x

**Context:** Reported bug: removing a reference photo appeared to do
nothing — the screen "flashed," and the photo was still there after
closing the dialog. Root cause: `.confirmModal` rendered behind the
open `.lightbox` (lower z-index), so the confirm dialog was invisible
and unclickable.

**Options:**
1. Fix the z-index bug only, keep the existing
  lightbox-then-confirm-modal delete flow.
2. Remove that flow entirely and add a direct ✕ button on each photo
   tile on the dashboard itself, per the user's own stated preference
   ("ideally it would just be a x on the dashboard instead").

**Decision:** Option 2 — plus defensively bumped `.confirmModal`'s
z-index above `.lightbox`/`.pinModal` in both apps anyway, to prevent
the same class of bug recurring elsewhere.

**Why:** The user's explicit preference was for a simpler, more
discoverable interaction, not just a working version of the old one.
Fixing only the z-index would have solved the report but ignored the
better UX that was asked for directly.

**Status:** Done.

---

## D-2026-07-13-android-keyboard-autofocus

**Context:** Reported bug: on Android, the on-screen keyboard never
appeared on the code-entry screen, so the code couldn't be typed at
all.

**Options:**
1. Detect Android via user-agent sniffing and special-case the focus
   timing.
2. Remove the programmatic `.focus()` call on page load entirely and
   rely on the user's own tap to focus the field.

**Decision:** Option 2.

**Why:** Root cause was that Android Chrome doesn't summon the
on-screen keyboard for a script-triggered `.focus()`, and having the
field already-focused on load also blocked a subsequent real tap from
re-triggering focus — so removing the auto-focus fixes it everywhere,
with no browser-sniffing and no risk of missing some other affected
device/browser combination.

**Status:** Done. Verified via Playwright that no element is focused
immediately after page load.

---

## D-2026-07-13-parent-agnostic-wording

**Context:** The app referred to the checking parent as "Mum"
throughout — DB columns, edge function action names, UI text, CSS
class names — which doesn't fit every family.

**Options:**
1. Add a configurable label per family (e.g. "Mum," "Dad," "Nana")
   stored as a setting.
2. Rename everything to a neutral "Parent" — DB columns, action names,
   event types, UI copy, CSS classes — with a data migration for
   historical rows.

**Decision:** Option 2.

**Why:** The user's own framing was "not bad but just a parent or
something" — a configurable label was more machinery than the request
called for, and "Parent" already reads naturally in every context the
old "Mum" wording appeared in. A full rename (not just UI copy) keeps
the codebase itself consistent instead of leaving `mum_check` etc. as
an internal name mismatched with what's shown to users.

**Status:** Done. Verified with a full-repo grep confirming zero
remaining "mum" references, and a regression test proving behavior is
unchanged post-rename.
