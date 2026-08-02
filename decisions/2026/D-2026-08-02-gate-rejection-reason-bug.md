# D-2026-08-02-gate-rejection-reason-bug

Date: 2026-08-02
Status: Done

**Context:** While speed-testing the pipeline against Eira's real submission
history, a rejected photo's `rejection_reason` read: "This is an indoor
bedroom-type room as evidenced by the presence of a bed, chair, desk,
shelves, window with curtains, and door." - an affirmative description of
a *valid* room, shown as the reason a photo was *rejected*. The same exact
text appeared on an earlier historical rejection for the same kid too, so
this wasn't a one-off fluke.

Traced it to `llava_gate()`'s room-validity gate. `GATE_SCHEMA`'s
`reject_reason_if_invalid` field is a plain `{"type": "string"}`, required
on every call - the model has no way to represent "not applicable," so it
must write *something* into that field even when it privately judges the
photo as a clearly valid room. Separately, `valid` is computed in code as
`setting == "indoor_room" AND confidence == "high" AND len(room_evidence)
>= 2 AND len(invalid_evidence) == 0` - a stricter, multi-part check the
model was never asked to reason about as a single question. When any one
sub-condition fails for a reason unrelated to "is this a room" (most
likely: `confidence` came back `"medium"` instead of `"high"`), `valid`
is `False` even though the model's own `setting` judgment was
`"indoor_room"` - and its freeform reason field, written from that
belief, describes the room affirmatively. The code then surfaces that
text to the kid as their rejection reason, which reads like a compliment
and gives no indication of what to actually fix.

Notably, `SCORER_SCHEMA`'s analogous `mismatch_reason` field is already
`{"type": ["string", "null"]}` (nullable), and `SCORER_PROMPT`'s own
worked example explicitly shows `"mismatch_reason": null` for the
room-match-true case - the scorer already handles this correctly. The
gate just never got the same treatment when it was written.

**Options:**
1. Leave `reject_reason_if_invalid` as a trusted freeform pass-through -
   rejected, since it's the actual bug and doing nothing leaves confusing,
   sometimes actively misleading messages reaching real kids.
2. Make `reject_reason_if_invalid` nullable in the schema and prompt
   (mirroring `mismatch_reason`'s existing pattern exactly - told the
   model to write `null` when `setting` is `"indoor_room"`), and have
   `llava_gate()` build the human-facing reason from whichever specific
   criterion actually failed, only falling back to the model's own text
   when `setting != "indoor_room"` (the one case where that field is
   actually coherent).
3. Same as 2, but without the more specific per-criterion messages - just
   fix the schema/prompt and fall back to one generic message whenever
   `setting == "indoor_room"` but some stricter check still failed.

**Decision:** Option 2.

**Why:** Root-causing the schema (option 2/3) is better than papering
over symptoms - a required, non-nullable string field forcing the model
to always produce content is a known JSON-schema-constrained-generation
pitfall, and this project already has the correct fix pattern sitting
right next to the bug (`SCORER_SCHEMA`). Doing the specific per-criterion
messages (full option 2, not the plainer option 3) costs nothing extra
in code and gives a kid actually actionable feedback ("try a brighter,
steadier photo" vs. "try again") instead of a generic retry prompt,
now that the code knows exactly which check failed.

**Status:** Done. `GATE_SCHEMA.reject_reason_if_invalid` is now
`{"type": ["string", "null"]}`; `GATE_PROMPT` adds a fourth worked
example (a valid indoor room, with `reject_reason_if_invalid: null`) and
updates the trailing JSON-shape instruction to say "or null if this IS a
clear indoor room photo." `llava_gate()` now computes `valid` from the
four named fields explicitly, and on rejection builds the reason from
whichever check actually failed (setting, confidence, room_evidence
count, invalid_evidence) - only using the model's own freeform text when
`setting != "indoor_room"`, the one case where it's coherent. Also added
a `print()` of the raw gate result whenever a rejection happens, so a
future case like this doesn't have to be diagnosed by vocabulary-matching
the rejection text against the prompt's wording alone.

Verified without live Ollama access (not reachable from this session) via
three monkeypatched-`ollama_generate` unit tests against the real
function: (1) the exact real-world scenario reproduced - `setting:
indoor_room`, `confidence: medium`, model writes the same affirmative
text seen in production - now returns a specific, non-contradictory
message instead ("That photo wasn't clear enough to confirm it's your
room..."); (2) a genuinely invalid photo (shoes on pavement) still
surfaces the model's real reason unchanged; (3) a genuinely valid photo
still returns `valid=True, reason=None`. Diffed the edited file to
confirm the change is scoped to `GATE_SCHEMA`/`GATE_PROMPT`/`llava_gate()`
only, verified it compiles, and delivered it back to the user via
`SendUserFile` - not yet confirmed against a real live rejection.
