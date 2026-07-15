# Homelife

Family apps, deployed as static sites on GitHub Pages. Multiple families can
use the same deployment - each family is isolated by a parent code and per-kid
codes, and can optionally share their stats on a public leaderboard.

## Apps

- [`apps/bedroom-reset`](apps/bedroom-reset) - kids' bedroom checklist PWA. A kid enters their code once (a parent gives it to them), then the tablet remembers them. PIN-gated Parent Check, streaks, points/levels/badges. A room switcher at the top also gives access to the family's shared rooms (kitchen, etc.) - any kid can open and help finish one.
- [`apps/parent-dashboard`](apps/parent-dashboard) - a parent enters their family's parent code once, then can see every kid's progress, manage kids (add/rename/remove, get their codes), add/remove shared rooms and edit their checklist items, change the family's confirmation PIN, and opt in to the public leaderboard.
- [`apps/leaderboard`](apps/leaderboard) - public, no code needed. Shows aggregate stats (total points, best streak, rooms passed) for families that have opted in. Never shows individual kids' names or checklist details, even for opted-in families.

## Shared

- [`apps/shared/config.js`](apps/shared/config.js) - the family-api URL and the levels/badges rules. No family or kid identity, checklist items, or point values live here anymore - those come from the backend so every family can customize them.
- [`apps/shared/api.js`](apps/shared/api.js) - a small `callApi(action, payload)` helper every app uses to talk to the backend, with a hard timeout so a bad connection fails fast instead of hanging.

## Backend

Data lives in a dedicated Supabase project ("homelife", `ap-southeast-2`).
Every family-data table (`families`, `kids`, `kid_checklist_state`,
`kid_streaks`, `kid_progress_log`, `sessions`, `kid_reference_photos`) has
Row Level Security enabled with **zero policies** - meaning nothing is
reachable through the public API key at all, from any family. Reference
photos live in a private Storage bucket (`reference-photos`) with the same
"nobody but the edge function touches this" posture - every photo is served
through a short-lived signed URL, never a public link. The only thing that
can read or write any of this is the `family-api` Supabase Edge Function
([`supabase/functions/family-api`](supabase/functions/family-api)), which
uses the service role key (server-side only) and enforces per-family and
per-kid scoping in code, based on an opaque session token issued when a
parent code or kid code is redeemed.

This is what makes it safe for unrelated families to share the same
deployment: there's no shared secret whose leak would expose everyone, and no
RLS policy to get subtly wrong. Points, streaks and PIN checks are also
computed server-side now (not just displayed client-side), so a kid can't
open dev tools and fake their own progress - which matters once a leaderboard
is comparing families against each other.

Tables:

- `families` - name, public display name, parent_code, parent_pin, icon, is_public (leaderboard opt-in), ai_score_mode (`off`/`informational`/`nudge`/`auto_approve`), ai_score_auto_threshold (1-10)
- `kids` - name, avatar, kid_code, belongs to a family
- `family_bedroom_items` - the family's own bedroom checklist (category + label per item), fully editable by a parent from the dashboard. Seeded with a 17-item default checklist automatically when a family is created (a database trigger, so it works even though families themselves are created by raw SQL - see "Onboarding a new family" below); a kid's checklist total is however many items their family currently has, not a fixed number
- `kid_checklist_state` - today's checkbox state per kid (bedroom only - personal), keyed against the family's current `family_bedroom_items`
- `kid_streaks` - current streak, best streak, total points, total passes, last parent-check result (bedroom only)
- `kid_progress_log` - append-only history of resets and parent checks, used by the parent dashboard and leaderboard
- `sessions` - opaque tokens issued on code redemption, mapping a device to a family (and a kid, for kid sessions)
- `kid_reference_photos` - metadata for each kid's up-to-3 "what done looks like" bedroom photos
- `family_rooms` / `family_room_items` - shared rooms (kitchen, etc.) belonging to a family, not one kid, and their checklist items - both fully editable by a parent from the dashboard
- `family_room_state` / `family_room_progress` / `family_room_log` / `family_room_photos` - the shared-room equivalents of the kid_* tables above. Progress here is a single row per room (the whole family's, not any one kid's) - deliberately parallel to, not merged with, the kid_* tables, so bedrooms keep working exactly as before
- `photo_score_requests` - a kid's "score my room" submission for the self-hosted AI photo-scoring feature: family_id, kid_id or room_id, storage_path, status (`pending`/`scored`/`failed`), score (1-10), comment, timestamps. A partial unique index caps it at one pending request per kid/room at a time. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full design

The actual reference photo images (both kids' and shared rooms') live in one private Storage bucket, `reference-photos`.

## Onboarding a new family

There's no public sign-up page by design - you create each family so you
control who's on the platform. To add one, run this in the Supabase SQL
editor (or ask Claude to run it), then send the parent their `parent_code`:

```sql
insert into families (name, display_name, parent_code, parent_pin)
values ('The Smiths', 'The Smiths', '<generate an 8-char code>', '<a 4-digit PIN of their choosing>')
returning id, parent_code;
```

They redeem that code once in the parent dashboard, then use "Add a kid"
there to create each kid's own code - no further SQL needed.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which
publishes the whole repo to GitHub Pages. Once live:

- Kids' app: `https://<your-username>.github.io/homelife/apps/bedroom-reset/`
- Parent dashboard: `https://<your-username>.github.io/homelife/apps/parent-dashboard/`
- Leaderboard: `https://<your-username>.github.io/homelife/apps/leaderboard/`

The edge function deploys separately (via the Supabase MCP tool or `supabase
functions deploy family-api`), not through the GitHub Pages workflow -
redeploy it after editing `supabase/functions/family-api/index.ts`.

## Roadmap

Scoped-but-not-built ideas, including a full architecture for AI photo
scoring once the home AI setup is ready, live in
[`docs/ROADMAP.md`](docs/ROADMAP.md).
