# 2026-08-22 — Reward spinner: rebuilt the spin sounds

**Focus:** The `TASK_BOARD_NOW.md` task "Better spinning sounds for the reward wheel", picked up
directly from the user asking for better spinner sounds, "a choice where possible", and drum beats
specifically.

## Timeline

- Read the existing audio layer: three presets (`chimes`/`arcade`/`retro`) as a table of
  `{tick: {freq, type, gain}, landing: [tones]}`, played by `playTone`/`playSpinTicks`/
  `playLandingChime`, with ticks spread by `1 - (1-t)²`.
- Identified the shape itself as the ceiling: a preset that is one tone repeated can't express a
  drum groove (different voice per beat), which is what the user asked for. Rebuilt the section as
  primitives (`playTone`/`playNoise`/`envelope` over a shared master gain and one reused noise
  buffer) plus a voice library (`hitKick`/`hitSnare`/`hitHat`/`hitTom`/`hitCrash`/`hitWood`/
  `hitBell`), with each preset now a `tick(ctx, at, i, progress)` / `landing(ctx, at)` pair.
- Replaced the eased tick spread with a real inversion of the wheel's CSS easing
  (`cubic-bezier(0.15, 0.85, 0.35, 1)`): `wheelTimeForRotation()` bisects the bezier to find when the
  wheel passes each of 72 imaginary pegs, so the rhythm decelerates exactly as the wheel does and
  the final click coincides with the wheel stopping. Added a per-preset `minGap` that drops pegs
  arriving too fast for that preset's voice — the same schedule becomes 29 wooden clicks or 16 drum
  hits.
- Five presets ship (plus Off): Chimes (default), Drum kit, Big drums (taiko), Arcade, Prize wheel.
  `chimes` and `retro` deliberately keep their original preset keys so stored per-device preferences
  still resolve; `retro` is only relabelled in the Settings dropdown.
- Added a ▶ preview button in Settings, and made picking from the dropdown play that preset — six
  options are not comparable if hearing each one costs a real spin (and a real reward entry).
- **Verified by rendering, not by reading.** Built a throwaway harness (in the scratchpad, not the
  repo) that slices the audio section out of the shipped `app.js`, runs it under an
  `OfflineAudioContext` in headless Chromium, and writes a WAV per preset. That surfaced two things
  code review would not have: peak amplitude ranged 0.16 (arcade) to 0.69 (drums), so switching
  preset meant a jarring volume jump; and `getAudioCtx()`'s `resume()` produced an unhandled
  rejection. Added a measured per-preset `level` on the master gain (all five now peak 0.30-0.41)
  and a `.catch()` on the resume.
- Checked the duration extremes (2s and 8s slider ends) as well as the 2.6s default: tick counts and
  gaps stay sane, though at 8s the wheel's final creep leaves a ~2.2s gap before the landing — real
  wheel behaviour, and only at the far end of the slider.
- Sent the five rendered WAVs to the user so the subjective half of the task's "done when" can
  actually be judged before deploying.

## Files touched

- `apps/reward-tracker/app.js` — audio section rebuilt (primitives, voices, presets, peg schedule,
  preview); `spinSoundPreviewBtn` wiring; `playLandingChime` → `playLandingSound`
- `apps/reward-tracker/index.html` — Settings preset list (six options) + ▶ preview button
- `apps/reward-tracker/styles.css` — `.spinSoundControls`/`.spinSoundPreviewBtn`; note on `.wheel`'s
  easing being duplicated in `app.js`
- `apps/reward-tracker/service-worker.js` — `CACHE_NAME` v22 → v23
- `apps/reward-tracker/README.md` — Spin sound paragraph
- `CHANGELOG.md`, `DECISIONS.md`, `decisions/2026/D-2026-08-22-spin-sound-redesign.md`,
  `docs/TASK_BOARD_NOW.md` (task graduated)

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-22-spin-sound-redesign.md`
- Graduates the `TASK_BOARD_NOW.md` task "Better spinning sounds for the reward wheel"
- Follows the same day's spin-flow work (`D-2026-08-18-spin-kid-picker-before-spin`)

## Carried forward

- The subjective half of the task's "done when" is the user's call — the WAVs were sent for exactly
  that. If a preset needs rebalancing, the render harness approach is written up in the decision
  record and is quick to redo.
- `WHEEL_EASING` in `app.js` now duplicates `.wheel`'s `transition-timing-function` in `styles.css`.
  Both carry a comment pointing at the other; changing one without the other silently desynchronises
  the ticks from the wheel.
- Still open from the previous session: the ghost-click lesson isn't logged to `ai-lessons-learned`,
  and `claude/rewards-app-spin-flow-dqdlbe` is still a merged stray branch.
