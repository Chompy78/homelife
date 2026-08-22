# D-2026-08-22-spin-sound-redesign

Date: 2026-08-22
Status: Done

**Context:** The user asked for better spinner sounds, "a choice where possible", and named drum beats
specifically. This is the `TASK_BOARD_NOW.md` task "Better spinning sounds for the reward wheel": the
three existing presets (`chimes`/`arcade`/`retro`) were single square/sine beeps repeated at eased
intervals, with a two-note chime on landing.

**Options:**
1. Ship real audio files (mp3/ogg) for a genuinely produced set of sounds - rejected: every asset has to
   be cached by the service worker and bumped with `CACHE_NAME`, and the whole app is currently
   file-free. A handful of drum samples would also dwarf the app's own payload.
2. Keep the existing tone-table shape and just pick nicer numbers - rejected: the shape itself is the
   ceiling. A preset is `{tick: {freq, type, gain}, landing: [...]}`, which can only ever repeat one
   blip, so a drum groove (different voice per beat) is not expressible in it.
3. Rebuild the synthesis: small voice library (kick/snare/hat/tom/crash/wood/bell) over shared
   oscillator+noise+envelope primitives, and make a preset a pair of *functions* (`tick`, `landing`)
   rather than a data table. **Chosen.**

**Why:** Option 3 keeps the no-files property that made the original choice right, while removing the
expressive ceiling that made it sound cheap. Two things beyond "more voices" do most of the perceived
quality:

- **Ticks follow the wheel's real deceleration.** The old code spread ticks with `1 - (1-t)²`, an eased
  guess unrelated to the wheel's actual motion. The wheel's CSS transition is
  `cubic-bezier(0.15, 0.85, 0.35, 1)`, so inverting that curve (`wheelTimeForRotation`, bisection on the
  bezier) gives the moment the wheel passes each of 72 imaginary pegs. The rhythm now decelerates
  *exactly* as the wheel visibly does, and the final click lands on the same instant the wheel stops.
  Cost of the coupling: `WHEEL_EASING` in `app.js` duplicates the CSS curve, so both carry a comment
  pointing at the other.
- **A per-preset `minGap` instead of a fixed tick count.** Early in a spin the wheel is turning far too
  fast for a kick drum per peg. Each preset declares how close its voice can fire before hits smear;
  pegs closer than that are dropped. One number turns the same peg schedule into 29 wooden clicks
  (Prize wheel) or 16 drum hits (Drum kit) over the same spin.

**Loudness was measured, not guessed.** Rendering each preset through an `OfflineAudioContext` in
headless Chromium (slicing the audio section out of the shipped `app.js`, so the measurement is of the
real code) showed peak amplitude ranging 0.16 (arcade) to 0.69 (drums) - a preset switch would have been
a jarring volume jump, and drums was close enough to clipping to matter once layered. Each preset now
carries a measured `level` applied to the master gain, bringing all five to peak 0.30-0.41. Re-measure
if a preset's voices change.

Five presets ship (plus Off): **Chimes** (default), **Drum kit**, **Big drums** (taiko), **Arcade**,
**Prize wheel**. `chimes` and `retro` keep their original keys so existing stored preferences still
resolve - `retro` is relabelled "Prize wheel" in Settings but its key is untouched. `chimes` also stays
the migration default, so no device silently changes sound; every preset simply sounds better than the
version it replaces.

Settings gained a ▶ preview button, and picking from the dropdown plays that preset immediately -
otherwise comparing six options means spinning the wheel six times, and each real spin costs a kid an
actual reward entry.

**Status:** Done.
