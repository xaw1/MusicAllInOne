# DrumScore — Project Guide

> Working title: **DrumScore** (placeholder — rename freely).
> A free, local drum-learning app: import Guitar Pro files or write drum notation
> yourself, then play along at adjustable speed with the rest of the band
> synthesised underneath. In the spirit of Songsterr / Melodics, but free.

**Status:** Stages 0, 1, 1.5, **3** (AI sticking + tips via OpenRouter) shipped,
plus the falling-notes highway, **multi-instrument support** (drums + saxophone
fingering chart + a pitched piano-roll highway, auto-detected per track), an
installable **PWA**, a wind/melodic practice layer (**chromatic tuner + cents
meter + drone + real-time monophonic pitch detection**, `src/audio/`), and
**Stage 5 v1 (Microphone follow)** — a live mic **score-follower**
(`src/core/follower.ts` + `follow-engine.ts`) that grades pitch + onset against
the focused melodic line and flashes the highway. The
follower's no-instrument validation strategy is researched in
`docs/research/stage5/`. Stage 2 (notation editor) is parked at the user's request.

---

## 1. Vision & goals

Max plays an **acoustic** kit and wants a practice tool that:

- Imports a Guitar Pro file when one exists, and lets him write the notation by
  hand when one doesn't (~70% import / ~30% authoring).
- Shows proper **standard drum-staff notation**.
- Plays the song back at **variable speed** with a metronome, so he can slow a
  part down and bring it up to tempo.
- Plays the **other instruments (guitar, bass, etc.) synthesised in the
  background** so he can hear and see where his drums line up with the music.
- Suggests **hand patterns (sticking, e.g. RLRR)** and **per-section tips** via
  an LLM call.
- Eventually swaps **drum sound packs** per genre, and uses the **microphone**
  to follow what he's playing.

### Non-goals / constraints

- **No MIDI input device.** The kit is acoustic; authoring is keyboard-only.
  (Note: alphaTab still uses MIDI *internally* to synthesise playback — that is
  unrelated and stays.)
- Personal use only. No accounts, no backend, no hosting. API keys may live in a
  local `.env` / browser storage; client-side exposure is acceptable.
- Free. No paid services or paywalls.

---

## 2. Tech stack

| Concern            | Choice                                             |
| ------------------ | -------------------------------------------------- |
| Build / dev server | **Vite**                                           |
| Language           | **TypeScript**                                     |
| UI                 | **Plain TS + a tiny reactive store** (no framework)|
| Notation + audio   | **alphaTab** (`@coderline/alphatab`, MPL-2.0, **pin ≥ v1.8.3**) |
| AI                 | **OpenRouter** chat-completions API, called client-side |
| Persistence        | **IndexedDB** (song files, soundfont packs) + **localStorage** (settings) |
| Delivery           | **Installable PWA** for Stages 0–4; Tauri later (see §5) |

### Why alphaTab (and not VexFlow / OSMD / Verovio / abcjs)

- Imports **Guitar Pro 3–8**, MusicXML and Capella natively — covers any file
  Max has without us writing a parser. (GP8 docs: ~96% feature coverage.)
- Ships a **SoundFont2 synthesiser** (alphaSynth, bundled Sonivox SF2) that plays
  **all tracks** with a live cursor, per-track volume/pan/mute, tempo control and
  looping — this is what makes "hear the guitar while I drum" essentially free.
  Quality is GM-decent, not sample-realistic, which is fine for a backing track.
- Native support for **triplets/tuplets, odd meters (3/4 etc.), ghost notes and
  accents** — all required.
- Exposes an **editable data model** (`Score → Track → Staff → Bar → Voice →
  Beat → Note`) we can mutate in code and re-render, so the Stage 2 editor builds
  on the same engine.
- Sound packs = just loading a different `.sf2`.

The external review confirmed no competitor meets even three of our five
load-bearing needs (GP import, drum-staff notation, multi-track synth, editable
model, SVG bounds for overlays) without bolting libraries together and writing a
GP parser. OSMD/VexFlow have no GP import and no synth; Verovio has no
interactive multi-track player; abcjs is wrong for full band scores. **alphaTab
is the only library-grade option. Rejected the rest.**

### Integration footguns (log these — they will bite otherwise)

- **Use the official `@coderline/alphatab` Vite plugin.** It copies the bundled
  Bravura font and Sonivox SoundFont to `/font/` and `/soundfont/` and wires the
  Web Worker + Audio Worklet entry points. This is the #1 integration mistake.
- **Pin alphaTab ≥ v1.8.3.** Drum/percussion is a *young* feature (first-class
  only since v1.4, 2023) with a track record of drum-specific bugs (e.g. broken
  GP5 percussion articulations fixed in the v1.8 line). **Test real `.gp` drum
  files early** to surface articulation bugs before building on top.
- **Licensing is benign:** alphaTab is MPL-2.0 (file-level copyleft) consumed as
  an npm dependency, so a personal/non-distributed app has zero obligations.

---

## 3. Architecture — the rule that protects every stage

**alphaTab's `Score` object is the single source of truth.** Everything flows
through ONE pipeline:

```
load/create Score  →  render (SVG)  →  generate MIDI  →  play (AlphaSynth)  →  draw overlays
```

- **Stage 1** populates the Score by *importing* a GP file.
- **Stage 2** populates the *same* Score via *keypresses*.

Because both feed the identical render/play pipeline, the editor cannot break
play-along — it's just another way of filling the model. **Do NOT** invent a
separate custom note model for the editor.

### The Stage 2 editing layer (revised per review)

All edits go through a thin **command layer** — a stable *interface*
(`addBeat`, `setNoteOnBeat`, `removeNote`, `setDuration`, `toggleGhost`,
`toggleAccent`, `setTuplet`, `setTimeSignature`, …) created in Stage 0/1 so
Stage 2 slots straight in.

But its **implementation is an open question to prototype two ways**, because
alphaTab's docs explicitly warn that *direct* mutation of the Score graph "might
fully break the rendering pipeline due to inconsistencies":

1. **Direct mutation** of the live Score + consistency/`finish()` steps + `api.render()`. Fine-grained, fast, but fragile — expect to discover undocumented invariants by trial.
2. **Emit alphaTex and re-parse.** Since v1.4 alphaTex fully supports percussion, voices, tuplets, time signatures, ghost notes and accents. More robust (no graph surgery), at the cost of edit-latency on long songs.

Build the command-layer interface first; pick the implementation that keeps the
rendering pipeline stable. Benchmark edit latency on a long song before
committing.

### Overlay layer (sticking letters, edit caret, mic cursor)

- **Render with the SVG engine** (`settings.core.engine = 'svg'`) and position
  overlays from `api.renderer.boundsLookup.findBeat(beat)` — absolutely-positioned
  DOM/SVG over `.at-viewport`.
- **Bounds are invalidated on every re-render/resize**, so recompute all overlays
  on the `renderFinished` event.
- There is **no bounds API for non-note glyphs** (tempo/time-sig) and **bar-level
  snapping is unreliable** (open upstream issue) — don't depend on it; per-beat
  bounds are enough for our three use cases.
- This one layer serves AI sticking letters (Stage 3), the edit cursor (Stage 2)
  and the mic follow cursor (Stage 5).

### Other early decisions

- **Framework-agnostic state store** so the UI stays decoupled from alphaTab's
  self-managed DOM (never let UI code reach inside alphaTab's container).
- **Settings are data**, including keybinds and the AI model — editable at
  runtime, persisted, never hard-coded in logic.
- **Isolate API-key access behind one small module** so storage can later swap
  from localStorage to an OS keychain (under Tauri) without touching callers.

### Proposed structure

```
src/
  core/
    store.ts            # tiny reactive store (app state)
    score-engine.ts     # AlphaTabApi wrapper: load, render, play, events
    score-commands.ts   # command layer over the Score model (Stage 2)
    persistence.ts      # IndexedDB (songs, packs) + localStorage (settings)
  audio/
    soundfonts.ts       # pack registry + runtime SoundFont swapping (Stage 4)
  overlay/
    overlay-layer.ts    # SVG overlay: cursor, sticking, section highlights
  ai/
    openrouter.ts       # client, model list, sticking/tips request + parse
    serialize.ts        # Score → compact text prompt input
    key-store.ts        # isolated key access (localStorage now, keychain later)
  ui/
    transport.ts        # play/pause/stop/loop/speed/metronome/count-in
    track-list.ts       # per-track volume/mute/solo
    settings-panel.ts   # keybinds, model, soundfont/pack
    editor.ts           # keypress authoring (Stage 2)
  input/
    keybinds.ts         # default map + remapping
    mic.ts              # Stage 5
  main.ts
public/
  soundfonts/           # .sf2 packs
  font/                 # alphaTab Bravura music font
```

---

## 4. Staged roadmap

### Stage 0 — Scaffold

Vite + TS project; alphaTab installed via the **official Vite plugin** (web
worker + Bravura font + Sonivox SoundFont wired automatically); pin **≥ v1.8.3**.
A bundled sample score renders (SVG) and plays through AlphaSynth. Basic
transport. The store, engine wrapper, command-layer stubs and key-store stub
exist.

### Stage 1 — Play-along (the 70%)

- Drag-drop / file-picker import of **GP3–8, MusicXML**.
- Render the **drum track prominently** with other tracks stacked so alignment
  is visible.
- Play **all tracks together**; **per-track volume / mute / solo** (solo drums,
  or balance guitar underneath).
- Transport: play / pause / stop, **loop a selection**, **count-in**,
  **playback-speed slider**, click-a-bar to seek, **metronome toggle**, moving
  cursor.
- Persist imported songs locally (IndexedDB) so they reload; remember settings.

### Stage 1.5 — Visualisation, colour-coding & settings

A cluster of tightly-related display features that share one **drum-voice →
colour map** (`src/core/colors.ts`) and a **Settings page**.

- **Colour-coded notes** *(done)*: every drum voice has a colour (snare =
  yellow, etc.); noteheads are coloured via alphaTab's per-note `style`
  (`NoteSubElement.StandardNotationNoteHead`). Re-applied on every score load.
  Toggle + editable palette live in Settings.
- **Settings page** *(done)*: modal (`src/ui/settings-panel.ts`) with Appearance
  (colour toggle + palette) and an editable **Keybinds** editor (persisted now so
  the Stage 2 editor just reads it). AI model/key (Stage 3) and sound-pack
  selection (Stage 4) get added to this same panel when those stages land.
- **Floating practice panel** *(done)*: a draggable/resizable floating card
  (`src/ui/drum-kit.ts`) containing a **falling-notes highway** on top and the
  **live kit** below — or **pinned to the right edge** (the ⇥ button) so the
  sheet reshapes and isn't covered. Shared drum mapping lives in
  `src/core/drums.ts`.
- **Live kit cues** *(done)*, driven by alphaTab's **`activeBeatsChanged`**
  (engine emits a rich `ActiveDrums` stream — per-hit midi/ghost/accent/velocity):
  each hit is a **collapsing coloured ellipse** (shrinks to a point so the moment
  of contact is readable); accent = bigger, ghost = smaller; **connecting lines**
  between simultaneous hits, **limb-coloured** (heuristic, refined by Stage 3); a
  **beat-pulse hub**; articulation marks (open hi-hat, cross-stick, ride bell);
  and **osu-style approach rings** that shrink onto each piece, reaching it at
  hit time. When a sticking exists, a **diagonal stick** overlays each struck
  drum (tip top-right = left hand, tip top-left = right hand), looked up by the
  hit's `tick:piece`. A per-hand **ghost "ready" stick** (toggle) travels to and
  hovers (half-visible) over each hand's *next* target from the sticking
  schedule, so you see where each hand is heading (e.g. it parks on an upcoming
  crash). It **hides while that hand is striking** (so the bright contact stick
  never stacks on top of it); opacity + colour-by-hand are adjustable.
- **Falling-notes highway** *(done)*: `src/ui/highway.ts`, a `<canvas>` with one
  lane per drum, notes falling to a hit line. Both the highway and the approach
  rings read a tick-keyed **timeline** (`src/core/timeline.ts`, from
  `beat.absolutePlaybackStart`) and position notes against the live
  **`api.tickPosition`** — synced through tempo changes and the speed slider.
  **Beat/bar gridlines** (faint beats, clearer bars) + a **counts ruler**
  (`1 e & a`) down the left edge. Note **shape encodes the 16th position in the
  beat**: on-beat = bar, `e` = ▲, `&` = ◆, `a` = ▼ (accent bigger, ghost hollow).
  Notes are **uniform rounded boxes** (vertical fill + side-margin adjustable in
  Settings). Off-beats carry an **inner marker in a darker shade** of the note
  colour, filling the box edge-to-edge (`e` = ▲, `&` = ◆, `a` = ▼); the down-beat
  is a plain box. Accent = white border, ghost = hollow. Adjustable height +
  look-ahead (beats). Purely visual for now; the same timeline + hit line feeds
  the Stage 5 mic follower.
- **Visualisation settings** *(done)*: `src/core/viz.ts` (pub/sub) holds lit/hold
  duration, show-kit, connecting-lines, limb-colours, approach-rings, ghost
  ready-sticks, show-highway, highway height and look-ahead, plus the floating
  panel geometry — all in the Settings panel, applied live.

### Stage 2 — Notation editor (the 30%)

- Keypress entry through the command layer (prototype direct-mutation vs
  alphaTex-reparse — see §3), then re-render + regenerate MIDI.
- **Editable keybinds** (default map below).
- Cursor navigation, note durations, **triplets/tuplets**, **time signatures
  (3/4 etc.)**, **ghost notes** and **accents**.
- New blank songs *and* editing of imported files.

### Stage 3 — Sticking + tips — v1 shipped

- **Algorithmic sticking is the instant default** (`src/core/sticking-algo.ts`),
  no network, recomputed on load via `src/ai/autostick.ts`. Two modes
  (Settings → Sticking):
  - **Precise** *(default)* — `computePreciseSticking`: a global cost-minimising
    DP (Viterbi) over hand assignments — tempo-aware feasibility (a hand can't
    beat ~`MIN_SAME_HAND_MS`, so alternation is forced only when truly too fast),
    spatial movement + crossover from a kit-geometry table, an alternation bias,
    and lead-hand bias on hi-hat/ride/crash + accents. Uses real ms timing
    (`DrumEvent.timeMs` from `beat.timer`, constant-tempo fallback).
  - **Simple** — `computeAutoSticking`, the original greedy heuristic (fallback).
  Golden cases in `src/core/sticking-algo.test.ts` (`npm test`, vitest) lock the
  behaviour. The OpenRouter pass below is an optional **refine + tips** that
  overrides the algorithmic result.
- TODO/next for precise: accent→rudiment layer (paradiddles), handedness /
  open-handed config, click-to-override + pin.
- `src/ai/serialize.ts` **de-duplicates repeated bars** into unique one-bar
  **patterns** (fingerprinted on hand hits; kick excluded), sends each pattern
  once plus a compact bar→pattern **form map**, and records every occurrence so
  the per-pattern R/L maps back onto all repeats. Big token saving on repetitive
  songs.
- `src/ai/openrouter.ts` (client: `listModels`, `chatCompletion`, `extractJson`)
  + `src/ai/coach.ts` (`runStickingAnalysis`) send it to OpenRouter and expect
  JSON `{patterns:[{id,hands:[...]}], sections:[{fromBar,toBar,tip}], overall}`.
- Result lives in `src/ai/sticking.ts` (pub/sub). The **R/L renders on the
  highway note boxes**; **tips show in a coach modal** (`src/ui/ai-panel.ts`,
  auto-opens after analysis). Trigger = the **AI** button in the transport.
- Key + model in Settings → AI (`src/ai/key-store.ts`; model is a text field
  with a live datalist from `/models`; default `~anthropic/claude-sonnet-latest`,
  a latest-alias that auto-tracks the newest Sonnet).
- An **AI log** (`src/ai/log.ts` + `src/ui/ai-log.ts`) records the prompt, the
  raw model response and any HTTP/parse errors; open it from Settings → AI →
  "View log" or the coach panel's "View log".
- TODO/next: R/L under the sheet notation too (overlay via `boundsLookup`);
  range/selection-scoped analysis; cache results per song.

### Stage 4 — Sound packs

- Swap SoundFonts at runtime (acoustic / electronic / jazz …) via
  `api.loadSoundFont(data, append)`.
- Constraint: alphaTab's SF2 path needs **uncompressed PCM** samples (SF3/Ogg is
  experimental). A good GM-quality SF2 is rarely < ~10 MB, so **packs are the
  largest assets we ship — cache them in IndexedDB.**
- Stretch: curated per-genre sample packs.

### Stage 5 — Microphone follow (later)

- Capture the acoustic kit via Web Audio (`getUserMedia` + AudioWorklet). On
  Windows/WebView2 the browser mic path is clean.
- **Ship: onset-only score follower.** Onset detection on solo drums is mature
  (>85% F-measure at ±50 ms). Use **Essentia.js** (`SuperFluxExtractor` /
  `OnsetDetection`, runs in an AudioWorklet — heavier, AGPL/dual-licensed, check
  terms) **or Meyda** (`spectralFlux`, MIT, lighter, write your own peak-picker)
  → adaptive-threshold peak-picker → advance/highlight the next note when a hit
  lands inside an **expected-onset tolerance window** (à la Yousician). This
  sidesteps classification entirely — "did *a* hit land near where one was
  expected?"
- **Do NOT use aubiojs** — its WASM port exposes only Tempo/Pitch/FFT, no onset
  detector. Common trap.
- **Explicitly out of scope: full "which drum did I hit" transcription.**
  Single-room-mic drum ADT is research-grade (no working client-side model in
  2026; hi-hat/cymbal confusion dominates). Optional: coarse 3-band energy hint
  (kick=low, snare=mid+noise, cymbals=high) **labelled approximate**, never
  treated as reliable.

---

## 5. Packaging path — web now, Tauri later

- **Stages 0–4: browser-local, shipped as an installable PWA** (manifest +
  service worker). Lowest friction, fastest iteration, songs/settings in
  IndexedDB/localStorage. This is the default.
- **Adopt Tauri (NOT Electron) only when Stage 5 begins**, and only if a concrete
  win is wanted: a real on-disk library of `.gp` files and `.sf2` packs
  (vs IndexedDB), **OS-keychain key storage** (`keyring` crate — *not* the
  deprecated Stronghold plugin), or a double-click desktop icon. alphaTab runs
  fine in WebView2; mic latency is identical (both use Web Audio).
- Electron is rejected: 80–200 MB / 120 MB+ RAM vs Tauri's 2–10 MB / ~50 MB, with
  no benefit for a single-dev Windows app.

---

## 6. Settings

All editable at runtime and persisted (localStorage).

### Default keybinds (remappable)

| Key       | Hit                         |
| --------- | --------------------------- |
| `K`       | Kick (bass drum)            |
| `S`       | Snare                       |
| `H`       | Hi-hat (closed)             |
| `O`       | Hi-hat (open)               |
| `P`       | Hi-hat (foot / pedal)       |
| `C`       | Crash                       |
| `R`       | Ride                        |
| `1`       | High tom                    |
| `2`       | Mid tom                     |
| `3`       | Floor tom                   |
| `X`       | Cross-stick / rimshot       |
| `Shift` + hit | Accent the note         |
| `G` + hit | Ghost note                  |
| `Space`   | Play / pause                |
| `← / →`   | Move cursor                 |

### Other settings

- AI model (dropdown from OpenRouter list) + OpenRouter API key.
- Sound pack (SoundFont) selection.
- Default tempo / speed, metronome on-off and volume, count-in bars.

---

## 7. Dev commands (intended)

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build
npm run preview  # preview the build
```

API key for OpenRouter: local `.env` (e.g. `VITE_OPENROUTER_API_KEY`) and/or a
field in the settings panel.

---

## 8. Risks to verify early (from external review)

- **Test your real `.gp` drum tracks immediately** — percussion is young; pin
  ≥ v1.8.3 and confirm articulations render before building on top.
- **Prototype Stage 2 editing both ways** (direct mutation vs alphaTex-reparse);
  the docs' warning about direct mutation is real. Benchmark on a long song.
- **Overlay bookkeeping:** recompute on every `renderFinished`; don't rely on
  bar-level snapping.
- **Soundfont size** is a genuine design constraint (PCM-only, ~10 MB+ per pack).
- **Vite plugin** is mandatory — worker/font/soundfont wiring fails without it.

## 9. Assumptions to confirm / open questions

- App name "DrumScore" is a placeholder.
- Default AI model slug to be confirmed against OpenRouter's live list at build
  time (model names change).
- Onset library for Stage 5: Essentia.js (capable, AGPL — check) vs Meyda (MIT,
  lighter). Decide at Stage 5.
- Which exact GP test files Max has (any version supported, but useful for
  testing Stage 1's import + drum rendering).
