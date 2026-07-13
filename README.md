# Homelife

Family apps, deployed as static sites on GitHub Pages. Multiple families can
use the same deployment - each family is isolated by a parent code and per-kid
codes, and can optionally share their stats on a public leaderboard.

## Apps

- [`apps/bedroom-reset`](apps/bedroom-reset) - kids' bedroom checklist PWA. A kid enters their code once (a parent gives it to them), then the tablet remembers them. PIN-gated Mum Check, streaks, points/levels/badges.
- [`apps/parent-dashboard`](apps/parent-dashboard) - a parent enters their family's parent code once, then can see every kid's progress, manage kids (add/rename/remove, get their codes), change the family's Mum PIN, and opt in to the public leaderboard.
- [`apps/leaderboard`](apps/leaderboard) - public, no code needed. Shows aggregate stats (total points, best streak, rooms passed) for families that have opted in. Never shows individual kids' names or checklist details, even for opted-in families.

## Shared

- [`apps/shared/config.js`](apps/shared/config.js) - the family-api URL, the shared checklist item definitions, and the points/levels/badges rules. No family or kid identity lives here anymore.
- [`apps/shared/api.js`](apps/shared/api.js) - a small `callApi(action, payload)` helper every app uses to talk to the backend, with a hard timeout so a bad connection fails fast instead of hanging.

## Backend

Data lives in a dedicated Supabase project ("homelife", `ap-southeast-2`).
Every family-data table (`families`, `kids`, `kid_checklist_state`,
`kid_streaks`, `kid_progress_log`, `sessions`) has Row Level Security enabled
with **zero policies** - meaning nothing is reachable through the public
API key at all, from any family. The only thing that can read or write this
data is the `family-api` Supabase Edge Function
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

- `families` - name, public display name, parent_code, mum_pin, is_public (leaderboard opt-in)
- `kids` - name, avatar, kid_code, belongs to a family
- `kid_checklist_state` - today's checkbox state per kid
- `kid_streaks` - current streak, best streak, total points, total passes, last Mum result
- `kid_progress_log` - append-only history of resets and Mum checks, used by the parent dashboard and leaderboard
- `sessions` - opaque tokens issued on code redemption, mapping a device to a family (and a kid, for kid sessions)

## Onboarding a new family

There's no public sign-up page by design - you create each family so you
control who's on the platform. To add one, run this in the Supabase SQL
editor (or ask Claude to run it), then send the parent their `parent_code`:

```sql
insert into families (name, display_name, parent_code, mum_pin)
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
