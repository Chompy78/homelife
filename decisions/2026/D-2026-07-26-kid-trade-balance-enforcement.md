# D-2026-07-26-kid-trade-balance-enforcement

Date: 2026-07-26
Status: Done

**Context:** A kid could use `my-rewards`' propose-trade flow to offer a reward category they had zero (or
fewer than the offered quantity of) balance in — the "you give" picker listed every family reward category
regardless of the kid's actual holdings, and neither `propose_trade` nor `respond_to_trade` validated
balance server-side at all. Needed to decide where in the trade lifecycle to enforce "can't give away what
you don't have," given a trade has two distinct moments (propose, accept) separated by unbounded time
during which either kid's balance can change.

**Options considered:**
1. Client-side picker restriction only (hide categories with insufficient balance).
2. Server-side check at propose time only.
3. Server-side check at accept time only.
4. Both: propose-time check (fail fast, good UX) plus an authoritative accept-time re-check that
   auto-cancels a trade whose balances no longer hold up.

**Decision:** Option 4.

**Why:** Option 1 alone violates this project's standing rule that a client-side UI restriction is never a
real security boundary (see `AGENTS.md`'s "Project conventions") — a kid could still hit the edge function
directly. Option 2 alone leaves a real gap: balances are a live sum over `kid_reward_log`, and either kid's
balance can shift between propose and accept (spent elsewhere, traded away in a different pending trade,
etc.), so a trade valid at propose time can still push a balance negative at accept time. Option 3 alone
means a kid sees a trade offer that looks valid in the UI but silently fails (or worse, isn't checked at
all currently) — worse UX with no fail-fast feedback. Option 4 gives immediate feedback when a trade
obviously can't be proposed, while keeping the actual boundary at the point balances are mutated (accept).
A trade that no longer checks out at accept time is auto-cancelled (`status: "cancelled"`) rather than left
pending forever or silently rejected with no state change, so it disappears from both kids' pending lists
instead of becoming a permanently-stuck ghost offer.

**Status:** Done.
