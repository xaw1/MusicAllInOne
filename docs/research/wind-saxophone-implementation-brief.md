# Wind / Saxophone Mode — Implementation Brief (for Claude Code)

Plain, self-contained spec. Goal: make DrumScore do for a melodic wind instrument
(saxophone first, then flute/clarinet/trumpet/etc.) what it already does for drums.

---

## 0. One-line summary

The app already **plays and notates** any instrument (full General MIDI SoundFont).
What's missing is the **practice layer** for pitched instruments: a falling-notes
view, on-screen fingering charts, a live tuner, and a mic-based "am I playing the
right note, in tune, in time?" follower. Build that, generalised behind an
`InstrumentProfile` abstraction, with saxophone as the first profile.

---

## 1. The repo today (read `CLAUDE.md` + `README.md` first)

**What it is:** DrumScore — a free, local, browser drum-practice app. Import a
Guitar Pro / MusicXML / Capella file, play along at adjustable speed with the whole
band synthesised underneath, plus drum aids (falling-notes highway, live drum-kit
cues, colour-coded notation, algorithmic/AI sticking). Stage 5 (planned) is an
acoustic-mic onset follower.

**Hard constraints — do not break these:**
- Free. No paid services, no paywalls.
- Fully local / client-side. No backend, no accounts, no hosting. (Optional LLM
  coaching uses an OpenRouter key stored locally; client-side exposure is fine.)
- Installable PWA.
- Built on **alphaTab** (`@coderline/alphatab` v1.8.3, MPL-2.0). The
  `@coderline/alphatab-vite` plugin is **mandatory** (wires the web worker, Bravura
  font, and SoundFont). SVG render engine (`core.engine = 'svg'`).
- **Architecture rule:** alphaTab's `Score` is the single source of truth.
  Everything flows through one pipeline: load/create → render (SVG) → MIDI → play →
  overlays. Don't invent a separate note model.

**Stack:** Vite + TypeScript, plain TS + a tiny reactive store (no framework).

**Current file layout (`src/`):**
```
core/
  store.ts          reactive store: AppState, TrackInfo, PlaybackSettings
  score-engine.ts   alphaTab wrapper (ScoreEngine): load/render/play, events,
                    onActiveBeats(), applyDrumColorsToScore(), isPercussionTrack()
  drums.ts          KitPiece, KIT_PIECE_ORDER, MIDI_TO_PIECE, midiToPiece(),
                    Limb/LIMB_COLOURS, noteDrumMidi(), QUARTER_TICKS (=960)
  colors.ts         DrumVoice, DEFAULT_DRUM_COLORS, midiToDrumVoice()
  timeline.ts       DrumEvent, buildDrumTimeline(), buildGrid(), binary searches
  viz.ts            VizSettings + pub/sub (getViz/setViz/subscribeViz)
  sticking-algo.ts  Viterbi DP hand-assignment (R/L) + greedy fallback
  persistence.ts    IndexedDB (songs) + localStorage (settings)
  score-commands.ts Stage-2 editing stub
ai/
  serialize.ts      de-dupes bars → patterns for the LLM prompt
  coach.ts, openrouter.ts, sticking.ts, autostick.ts, key-store.ts, log.ts
ui/
  highway.ts        falling-notes canvas — lanes come from KIT_PIECE_ORDER
  drum-kit.ts       floating panel: highway + live drum-kit SVG + approach rings
  track-list.ts     mixer (per-track volume/mute/solo, show/hide)
  transport.ts, settings-panel.ts, ai-panel.ts, ai-log.ts, toast.ts
input/keybinds.ts   drum keybinds (Stage 2)
data/demo.ts        bundled alphaTex demo (already has a piano "Keys" track)
main.ts             wiring
styles.css
```

---

## 2. alphaTab facts you need (verified against v1.8.3 type defs)

**Note** (`beat.notes[]`):
- `note.realValue` → **sounding (concert) MIDI pitch**. Use for intonation scoring.
- `note.octave`, `note.tone` → written-pitch components (for fingering / display).
- `note.string`, `note.fret` → fretted instruments only.
- `note.isPercussion`, `note.isGhost`, `note.accentuated`, `note.dynamics`.
- `note.percussionArticulation` → index into `track.percussionArticulations`.

**Beat:** `beat.absolutePlaybackStart` (tick), `beat.timer` (ms, after MIDI gen),
`beat.nextBeat`, `beat.notes`.

**Track:** `track.playbackInfo.program` (General MIDI program, settable),
`track.playbackInfo.primaryChannel/secondaryChannel` (drums = channel 9).

**Staff:** `staff.isPercussion`, `staff.showStandardNotation`,
`staff.showTablature`, `staff.stringTuning`.

**AlphaTabApi:** `api.loadSoundFont(data, append)`, `api.renderTracks([...])`,
`api.render()`, `api.tex(str)`, `api.load(bytes)`, transport methods, and
`api.renderer.boundsLookup.findBeat(beat)` for positioning overlays. Event
`activeBeatsChanged` fires which beats sound right now (across all tracks).
`QUARTER_TICKS = 960`.

**Already works:** importing a file with a sax/flute/etc. part renders the notation
and plays it through the bundled Sonivox GM SoundFont. No work needed for that.

---

## 3. The two pitch rules (architectural keystone)

A saxophone is a transposing instrument. Keep these strictly separate:

- **Fingering follows the WRITTEN note.** All saxes share fingerings — written C is
  the same fingering on every size. The fingering panel uses the written pitch only;
  transposition logic must never touch it.
- **Intonation scoring follows the SOUNDING (concert) pitch.** The mic hears concert
  pitch; compare it to the score's sounding pitch.

In alphaTab, `note.realValue` is already the **sounding** pitch → use it directly for
scoring. Derive the **written** pitch for fingering from `note.octave`/`note.tone`
(or `realValue` minus the staff's display transposition). **Verify empirically with a
real alto-sax (Eb) test file early** — this is exactly the kind of quirk the repo's
"test real files early" rule is about.

Sounding = written + offset (semitones), if you ever need it manually:
`soprano Bb −2, alto Eb −9, tenor Bb −14, baritone Eb −21`.

**GM program detection:** sax family is GM **soprano/alto/tenor/baritone**. As
0-based program-change bytes (what `playbackInfo.program` usually returns) that's
**64/65/66/67**; as 1-based GM names it's 65/66/67/68. Verify which your file
reports during Stage 1. Broader wind/brass profiles ≈ programs 56–79.

---

## 4. Decisions already made (from research — don't re-litigate)

**Pitch detection (real-time, monophonic):**
- Use **Pitchy** (`npm i pitchy`, v4, **MIT**) — McLeod Pitch Method; returns
  `[hz, clarity]`. Run it in an **AudioWorklet**. It's quietly maintained → **vendor
  the source** into the repo.
- Optional alternate: **pitchfinder** (MIT, multiple algorithms) as a selectable
  fallback.
- **Do NOT use Essentia.js** (AGPLv3 — copyleft, conflicts with the app).
- **Do NOT put CREPE / ml5.js / TF.js on the live audio path** (heavy; only as an
  optional capability-gated upgrade if Pitchy octave errors prove unacceptable).
- Params: ~2048-sample frame, ~512–1024 hop; accumulate the worklet's 128-sample
  blocks into a ring buffer. Gate on `clarity` + a min RMS. Median-smooth a few
  frames and bias toward the expected pitch to kill **octave errors** (the main sax
  failure, worst in the low register/subtones/altissimo).
- Hz → note + cents: `midi = round(69 + 12*log2(hz/440))`,
  `ref = 440*2^((midi-69)/12)`, `cents = 1200*log2(hz/ref)` (±50).

**Score follower (pitch + timing):**
- Use an **expected-note / expected-onset tolerance-window** follower keyed to
  alphaTab's live tick. **NOT** online DTW / the Matchmaker library (overkill,
  Python-shaped, no gain for one known monophonic line).
- Per note: pitch match (detected MIDI == expected sounding MIDI), intonation band
  (|cents| ≤ configurable, e.g. 15–25), onset within ± a ms window → hit/miss/quality
  (green = right + in time, yellow = right pitch but late / slightly out, red =
  wrong/missed). Advance the highway as notes are satisfied.
- Tolerance **presets** (cents for pitch, ms for onset), à la SmartMusic
  Easy/Lenient/Average/Strict. Keep default **forgiving** — don't punish expressive
  phrasing or vibrato.
- Drive everything off alphaTab's tick so the speed slider, repeats and loops scale
  automatically; reset the expected-pointer on cursor jumps.

**Fingering charts:**
- **Author your own data-driven SVG renderer** (key facts aren't copyrightable; only
  specific drawn artwork is). Pattern after **svguitar** (MIT): geometry + a per-note
  "keys down" array.
- **Seed saxophone data from `Eolu/sax-fingering-chart` `cfg.ron` (MIT)** →
  convert RON to JSON. It's a note→supported-keys table with transposition presets.
- **Do NOT use** Bret Pimentel diagrams (CC BY-NC-SA, non-commercial) or
  `mpho-dev/clarinet_app` data (unlicensed) — structural reference only.
- Schema sketch:
  ```ts
  fingeringLayout = { keys: [{ id:'octave', cx, cy, shape }, { id:'LH1', ... }] }
  fingeringData[writtenMidi] = { down:['LH1','LH2','octave'], alternates:[ ['LH1',...] ] }
  ```
  Renderer draws all keys outlined, fills the `down` set, re-fills as the highway
  advances. Swap layout+data files for other instruments → renderer is reused.

**Highway for melodic instruments:**
- Replace the fixed drum lanes with a **pitch-roll** (piano-roll): compute the
  piece's min/max written pitch (+margin), map pitch → y, semitone-spaced rows
  (optionally labelled). Reuse the existing falling-notes engine + tick sync.

**Pedagogy features that fit the vision (build the cheap high-value ones early):**
- **Live cents meter / tuner** (the #1 wind-specific need; winds control pitch).
- **Drone / pedal-tone generator** (Web Audio oscillator or held SoundFont note;
  equal-tempered + just) for intonation/long-tone practice.
- Tempo laddering (auto-raise BPM on success), isolate-a-bar loop, long-tone /
  overtone target with a cents trace, tendency-note hints. All reuse alphaTab's
  loop/tempo/count-in/metronome.

---

## 5. The abstraction to introduce

`InstrumentProfile` (strategy interface). Drums becomes one implementation with **no
behaviour change**; Sax/Wind is another.

```ts
interface InstrumentProfile {
  id: 'drums' | 'sax' | 'flute' | 'clarinet' | 'trumpet' | string;
  matches(track, staff): boolean;                 // auto-detection predicate
  highway: 'discrete-lanes' | 'pitch-roll';
  noteToLane(note, pieceRange): LaneSpec;          // drums: KitPiece lane; wind: pitch→y
  noteToColour(note): string;                      // drums: voice map; wind: pitch-class
  techniqueHint(note): StickingHint | FingeringSpec | null;  // R/L vs key-set
  liveGraphic: 'drumkit' | 'fingering-panel' | 'keyboard';
  transposition: { soundingOffsetSemitones: number };        // 0 for drums/flute
  pitchDetection?: {
    enabled: boolean; frameSize: number; hopSize: number;
    clarityThreshold: number; centsGoodBand: number; onsetWindowMs: number;
  };
}
```

**Auto-detect:** `staff.isPercussion` → drums; else `track.playbackInfo.program` in
the sax range (64–67) → sax; wider wind/brass ranges → their profiles; fall back to a
user picker (add a small instrument dropdown in `ui/track-list.ts`, also lets the
user override and assign instruments by setting `playbackInfo.program`).

---

## 6. What changes in each file

- `core/drums.ts`, `core/colors.ts` → keep as the **drums** profile's data; move
  behind the profile interface (don't delete).
- **new** `core/instrument-profile.ts` → the interface + registry + auto-detect.
- **new** `core/profiles/drums.ts` and `core/profiles/sax.ts` → implementations.
- `core/timeline.ts` → generalise `buildDrumTimeline` → `buildTimeline(score, profile)`
  (stop hard-filtering `isPercussion`; emit `{tick, timeMs, lane, colour, hint, ...}`).
- `core/score-engine.ts` → `onActiveBeats` should emit pitched notes too when the focus
  track is melodic; `applyDrumColorsToScore` → generalise or no-op for melodic (colour
  the highway, not necessarily the sheet).
- `ui/highway.ts` → take `lanes` + `noteToLane` + an optional per-note label instead of
  importing `KIT_PIECE_ORDER`; add pitch-roll mode. Keep drum look identical.
- `ui/drum-kit.ts` → behind `liveGraphic`, mount drum-kit (existing) **or** a new
  fingering panel / keyboard.
- **new** `ui/fingering-panel.ts` + `core/fingering/sax.json` (from Eolu) → the SVG
  fingering renderer + data.
- **new** `input/pitch-worklet.ts` (+ vendored Pitchy) and `core/tuner.ts` → mic capture,
  detection, Hz→note+cents.
- **new** `core/follower.ts` → expected-window scoring; emits per-note hit/miss/quality.
- **new** `core/drone.ts` → oscillator drone generator.
- `core/viz.ts` / `ui/settings-panel.ts` → add wind settings (tolerance preset, cents
  band, onset window, show-fingering, show-tuner, drone).
- `main.ts` → resolve the profile on `engine.onScore(...)`, wire the new panels.
- `data/demo.ts` → optionally add a short sax demo (or reuse the brass MusicXML test).
- `package.json` → add `pitchy` (and optionally `pitchfinder`).

---

## 7. Build order (ship saxophone first)

1. **Profile refactor.** Add `InstrumentProfile`, make drums the reference impl,
   add auto-detect. No visible change; existing drum behaviour identical. Add the
   per-track instrument picker in the mixer (sets `playbackInfo.program`).
2. **Wind visuals (no mic).** Add the sax profile + transposition; generalise the
   highway to pitch-roll; confirm sax import renders + plays. Verify written-vs-
   sounding pitch handling on a real alto-sax file.
3. **Fingering panel.** SVG renderer + sax JSON (from Eolu). Drive off the **written**
   note; show alternates. Generalise schema for the next instruments.
4. **Tuner + detection (no scoring).** Pitchy in an AudioWorklet; cents meter; standalone
   tuner + drone modes. Tune octave-error gating on real sax input.
5. **Follower + feedback.** Expected-note/onset window keyed to the tick; combine
   pitch+timing+intonation into green/yellow/red on the highway and notation; honour
   speed slider, loops, repeats, tolerance presets.
6. **Pedagogy polish.** Tempo laddering, isolate-a-bar loop, long-tone/overtone drill,
   tendency-note hints; optional LLM coaching reusing the existing OpenRouter path.
7. **Generalise.** flute (offset 0), clarinet (Bb), trumpet (Bb, valve "fingerings"),
   oboe — each = a new profile + data file, no engine changes.

---

## 8. Dependencies & licenses

| Thing | Package / source | License | Use |
|---|---|---|---|
| Notation + synth | `@coderline/alphatab` 1.8.3 (+ `-vite`) | MPL-2.0 | already in |
| Pitch detection | `pitchy` v4 (**vendor it**) | MIT | primary |
| Pitch detection (alt) | `pitchfinder` | MIT | optional fallback |
| Sax fingering data | `Eolu/sax-fingering-chart` `cfg.ron` → JSON | MIT | seed data |
| Fingering render pattern | `svguitar` (reference only) | MIT | pattern |
| Mic / drone / DSP | Web Audio API, AudioWorklet, getUserMedia, OscillatorNode | — | platform |

**Avoid:** Essentia.js (AGPLv3), Bret Pimentel diagrams (CC BY-NC-SA),
`mpho-dev/clarinet_app` data (unlicensed), CREPE/ml5/TF.js on the live path.

---

## 9. Gotchas

- **Echo/bleed:** with speakers, the backing track leaks into the mic and confuses the
  follower → recommend headphones, and/or gate detection to the expected register/onset
  windows.
- **Three real-time consumers in one tab** (alphaTab synth worklet, pitch worklet, rAF
  canvas): keep decoupled; the pitch worklet posts only `{hz, clarity, rms}` (small
  messages), never audio. One shared AudioContext.
- **Sax detection is genuinely hard** in low register / subtones / altissimo — set
  expectations; the tuner is a practice aid, not lab-grade.
- **Don't over-smooth** cents (hides real drift) and **don't grade rigidly** (punishes
  musical phrasing). Forgiving defaults + presets.
- **Verify GM program indexing** (64–67 vs 65–68) and **written-vs-sounding** behaviour
  against real files before building on top — per the repo's existing "test real files
  early" rule.

---

## Reconciliation note (added by Claude, 2026-06-08)

A chunk of the build order above is **already implemented** in the current repo, which
has moved past the file layout in §1. See `src/core/instrument/` (the `Instrument`
strategy interface, `detectInstrument`, `DrumsInstrument`, `PitchedInstrument`,
`SaxophoneInstrument`), `src/ui/fingering-chart.ts` (data-driven sax SVG) and
`src/core/instrument/sax-fingerings.ts` (written-note-keyed table, verified vs the
Woodwind Fingering Guide). Already done: the profile abstraction (Stage 1), the
pitch-roll highway + sax detection + transposition-aware written/sounding split
(Stage 2), and the fingering panel (Stage 3). **The genuinely new work is the mic/
audio layer: Pitchy AudioWorklet + tuner/cents meter (Stage 4), the drone generator,
and the expected-window score follower (Stage 5), plus the pedagogy polish (Stage 6).**
