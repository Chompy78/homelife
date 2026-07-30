# D-2026-07-19-spin-credit-system

Date: 2026-07-19
Status: Done

**Context:** The user asked for six things at once: a sticky-header scroll glitch, a broken History
Undo button, letting other apps (e.g. Bedroom Reset) grant a kid a spin, a bigger wheel with wedge
labels and a centered/hideable SPIN button, customizable spin sound, and named "reasons" that grant a
bonus spin with per-period limits. The last three (spin-granting, reasons, per-period limits) are one
underlying feature - designing them separately would have meant redoing the schema twice.

**Options considered (with the user's answers):**
1. Does earning a bonus spin gate spinning itself (no spin without a credit), or stay purely additive
   on top of the existing always-free SPIN button? **Chosen: additive** - a bonus credit just chains
   one extra automatic spin onto the next SPIN tap (reusing the exact mechanic the "Spin twice"
   category already has), rather than restricting spinning itself.
2. Per-reason limit shape: one cadence per reason (daily/weekly/monthly) vs. a count+period pair
   (e.g. "3 times per month"). **Chosen: one cadence per reason** - simpler to configure and to show
   ("once a week") than a two-part number+period combination.
3. Cross-app trigger: hardcode a specific Bedroom Reset event, or build one generic action any app can
   call. **Chosen: generic** (`grant_spin_credit`, usable by a parent session for any kid, or a kid
   session for themselves only) - the user deliberately didn't pick a specific Bedroom Reset event
   when offered the choice, so the mechanism itself is the deliverable; it's wired to Bedroom Reset's
   AI room-score auto-approve as the first real caller (matching the user's own example), not as the
   only possible one.
4. Sound customization: preset styles vs. an uploaded custom audio file. **Chosen: presets** (Chimes/
   Arcade/Retro/Off) - keeps it a Settings dropdown, no storage/upload plumbing needed.

**Why one shared `grantSpinCredit` helper for both manual and automated grants:** a parent ticking a
reason "yes" in Reward Tracker and Bedroom Reset's AI auto-approve path both need the *same*
per-reason-per-period cap enforced - if they used separate code paths, the cap could be bypassed by
whichever path didn't check it. Both now call one function; `grant_spin_credit` (the action) and the
`submit_photo_score` auto-approve branch (the automated caller) are just two callers of it.

**Why `trigger_key`, not label matching:** an automated caller needs a stable way to find "the reason
Bedroom Reset's AI score maps to" without breaking if a parent renames the human-readable label later.
`family_spin_reasons.trigger_key` (e.g. `'bedroom_ai_score'`) is looked up directly; the label is free
to edit without touching the link.

**Why the grant is per-kid only, not shared rooms:** `bonus_spins` is a column on `kids`, and a shared
room's AI auto-approval (`awardRoomPass`) has no single kid to attribute it to. The Bedroom Reset hook
only fires on the `updated.kid_id` branch of `submit_photo_score`, not the `updated.room_id` one.

**Known verification gap:** `submit_photo_score` (and so the Bedroom Reset auto-approve hook) is
gated by a worker-only secret (`WORKER_TOKEN`) that lives only in the Supabase project's own secret
store and the self-hosted AI-scoring worker machine - neither accessible from this session. Every
other new action (`grant_spin_credit`, `manage_spin_reasons`, `consume_bonus_spins`, the per-period
cap, the kid-can-only-grant-to-self boundary) was verified live against a disposable test family; the
`submit_photo_score` hook itself was verified by code review only, calling the same already-verified
`grantSpinCredit` helper. Worth a real end-to-end check next time the AI-scoring worker is run
against a live `auto_approve` family.

**Status:** Done, with the verification gap above noted.
