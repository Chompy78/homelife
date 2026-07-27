# D-2026-07-15-worker-token-auth

Date: 2026-07-15
Status: Done

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
