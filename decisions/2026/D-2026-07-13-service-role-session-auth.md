# D-2026-07-13-service-role-session-auth

Date: 2026-07-13
Status: Done

**Context:** The app needs to keep each family's data completely
separate from every other family's, and keep kids from accessing
anything beyond their own account, without requiring parents to go
through a full signup flow (email, password, verification) for what's
essentially "type in a code your parent sent you."

**Options:**
1. Use Supabase's built-in Auth (email/password or magic-link
   signup), with RLS policies written per table to scope access by
   the logged-in user's ID.
2. Enable RLS on every family/kid table with zero policies defined
   (so the public/anon key can't touch them at all), and route every
   read/write through a single edge function (`family-api`) that
   holds the service-role key and enforces per-family/per-kid access
   itself, authenticating callers via a simple opaque session token
   issued when a parent code or kid code is redeemed — not a Supabase
   Auth JWT.

**Decision:** Option 2.

**Why:** The whole point of this app is that a parent hands a kid a
short code and a device remembers it — there's no email, no password,
nothing to "sign up" for. Building that on top of Supabase Auth would
mean either forcing a real account system onto a use case that
doesn't need one, or fighting Auth's session model to fake code-based
login on top of it. Locking every table down completely and putting a
single, fully-controlled function in front of all of them is simpler
to reason about than writing and auditing a separate RLS policy per
table — there's exactly one place permission logic lives.

**Status:** Done — this has been the architecture since the project's
first commit. Documented in `supabase/functions/family-api/index.ts`'s
header comment; backfilled here because it predates this session's
decision log and had never been written down anywhere else. Caveat
worth keeping in mind going forward: because this one function is the
*only* line of defense (no RLS policies backing it up), a missed
permission check in a new edge-function action is a real hole, not
just a redundant safeguard failing — the parent-only-photos fix
earlier this session (D-2026-07-15-reference-photos-parent-only) was
exactly that shape of bug. Every new action added to `family-api`
needs its access check reviewed as carefully as the rest of the
function.
