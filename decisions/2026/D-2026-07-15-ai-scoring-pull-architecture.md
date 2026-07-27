# D-2026-07-15-ai-scoring-pull-architecture

Date: 2026-07-15
Status: Done

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
