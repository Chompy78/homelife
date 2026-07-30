# D-2026-07-30-reading-tracker-fk-cascade-fix

Date: 2026-07-30
Status: Done

**Context:** While verifying the reading tracker's expanded feature set against a disposable test family
(per `AGENTS.md`'s testing convention), deleting the test family after adding a book failed with a
foreign-key violation on `kid_reading_books`. Checking `information_schema.referential_constraints`
confirmed every other family/kid table in this project (`kids.family_id`, `kid_reward_log.family_id`,
`kid_big_rewards.kid_id`, etc.) cascades on delete - `kid_reading_books`, `kid_reading_log`, and
`kid_reading_holidays` were the only three that didn't, because their original migration
(`create_reading_tracker_schema`/`add_reading_bonus_spin_trigger`) declared plain `references` without
`on delete cascade`.

**Options considered:**
1. Leave it as `NO ACTION` and document that a reading-tracker family must have its books/logs/holidays
   manually deleted before the family row itself can be removed.
2. Add `on delete cascade` to all three tables' `family_id`/`kid_id` foreign keys, matching the
   established convention everywhere else in the schema.

**Decision:** Option 2 - dropped and recreated the six foreign key constraints
(`kid_reading_books`/`kid_reading_log`/`kid_reading_holidays` × `family_id`/`kid_id`) with
`on delete cascade`.

**Why:** Every other family-scoped table already cascades, so a parent (or an admin doing SQL cleanup)
deleting a family or a kid expects everything belonging to them to go with it, with no special-cased
exception for reading data. Leaving it as `NO ACTION` would silently orphan-block a delete the moment a
family had ever used the reading tracker - the kind of surprise that only shows up once, in production,
long after the feature shipped. Matching the existing convention removes a footgun and keeps the schema's
behavior uniform across every family/kid table, which is also what the project's own disposable-test-data
workflow already assumes.

**Status:** Done - verified by deleting a disposable test family with active reading data (book + log
entries + a holiday) in one statement, no errors.
