# D-2026-07-19-bonus-spin-category-flag

Date: 2026-07-19
Status: Done

**Context:** A code-review finding on the Reward Tracker spin wheel: the
double-spin bonus mechanic was keyed off `cat.label.trim().toLowerCase() ===
"spin twice"` - a plain string match against the category's freely-editable
label, with nothing marking it as protected (unlike a `trigger_key`-linked
spin reason, which already gets a lock icon). Renaming that category would
silently break the mechanic; renaming any other category to that exact
string would silently hijack it.

**Options:**
1. Leave it as a label match, just warn parents in the UI not to rename it.
2. Add a stable `is_bonus_spin` boolean column on `family_reward_categories`,
   identify the mechanic by that instead of the label, and protect it from
   deletion the same way a linked spin reason is protected.

**Decision:** Option 2 - added `is_bonus_spin` (migration
`add_is_bonus_spin_flag_to_reward_categories`), backfilled every existing
family's "Spin twice" row (6 families had one), and updated the
`seed_default_reward_categories()` trigger so newly-created families get the
flag set from the start instead of relying on the label ever matching.

**Why:** A UI warning doesn't stop an accidental rename, and the codebase
already has a working precedent for exactly this problem (`trigger_key` on
spin reasons) - reusing that pattern here means a parent can now freely
rename "Spin twice" to anything without breaking it, and the edge function
blocks deleting the flagged category outright (`category_linked_to_spin_
mechanic`) instead of silently losing the mechanic.

**Status:** Done.
