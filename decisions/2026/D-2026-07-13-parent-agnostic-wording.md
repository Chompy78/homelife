# D-2026-07-13-parent-agnostic-wording

Date: 2026-07-13
Status: Done

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
