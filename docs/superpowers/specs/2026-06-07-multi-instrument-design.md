# Multi-instrument practice tool — design

**Status:** draft for approval · **Date:** 2026-06-07

## 1. Goal

Generalize the app from a drums-only trainer into a **multi-instrument practice tool**,
with **saxophone** as the first non-drum instrument inside a **general pitched-instrument
framework**, plus a **UX pass**. Bring the drum learning experience — the falling-notes
highway, the live diagram, the per-note cues — to pitched instruments.

Non-goals (this round): full per-instrument fingering libraries beyond saxophone; a
Stage-2 notation editor; mic follow. Generic pitched instruments (guitar, piano, voice)
get the pitched **highway** but not a bespoke fingering diagram yet.

## 2. Architecture — instrument strategy layer (Approach A)

One `Instrument` abstraction owns everything instrument-specific. Today's drum code
becomes the first implementation; the highway and practice panel become
instrument-agnostic shells that render whichever instrument is active.

```
src/core/instrument/
  types.ts        # Instrument, PlayEvent, LaneDef, InstrumentDiagram
  detect.ts       # detectInstrument(track) -> Instrument
  drums.ts        # DrumsInstrument  (wraps the existing drum logic, no behaviour change)
  pitched.ts      # PitchedInstrument (base: chromatic highway + pitch helpers)
  saxophone.ts    # SaxophoneInstrument (fingering chart + dataset) extends pitched
src/core/pitch.ts # midiToName, isAccidental, written/sounding pitch extraction
src/ui/fingering-chart.ts  # the saxophone SVG diagram (light-up keys)
```

### 2.1 Core types

```ts
export interface PlayEvent {           // generalizes today's DrumEvent
  tick: number;                        // beat.absolutePlaybackStart
  timeMs: number;                      // beat.timer (ms), constant-tempo fallback
  laneKey: string;                     // stable lane id: drum piece name OR written-MIDI string
  accent: boolean;
  ghost: boolean;
  velocity: number;                    // 0..1
  sounding: number;                    // note.realValue   (audio pitch; drums: GM number)
  written: number;                     // note.displayValue (staff pitch; drives sax lane + fingering)
  piece?: KitPiece;                    // drums only
}

export interface LaneDef {
  key: string;                         // matches PlayEvent.laneKey
  label: string;                       // 'SN' (drum) | 'C4' (pitch)
  colorVoice?: DrumVoice;              // drums
  accidental?: boolean;                // pitched: shade sharp/flat columns
}

export interface Instrument {
  id: 'drums' | 'saxophone' | 'pitched';
  label: string;
  matchesTrack(track: any): boolean;             // detection
  buildTimeline(score: any, track: any): PlayEvent[];
  lanes(events: PlayEvent[]): LaneDef[];          // ordered highway columns
  cue(events: PlayEvent[]): Map<string, string>;  // `${tick}:${laneKey}` -> overlay (R/L for drums; '' for sax)
  diagram: InstrumentDiagram | null;              // live kit / fingering chart (null = highway only)
}

export interface InstrumentDiagram {
  svg: string;                                    // inline SVG markup
  mount(rootSvg: SVGSVGElement): void;            // grab refs after insertion
  showActive(hits: PlayEvent[]): void;            // light current hits (per activeBeatsChanged)
  showUpcoming(next: PlayEvent[]): void;          // telegraph the next note (approach rings / ghost keys)
  setColors(colors: DrumColorMap): void;
}
```

The alphaTab API behind `sounding`/`written` (verified against
`node_modules/@coderline/alphatab/dist/alphaTab.d.ts`):
- `note.realValue` — sounding MIDI (transposition + harmonic applied).
- `note.displayValue` — **written/staff MIDI** (what the player reads). Used for the
  pitched lane and the fingering lookup, so both stay consistent with the notation;
  alphaTab handles transposed audio. `calculateRealValue(false, false)` is the explicit
  equivalent if needed.
- Percussion still detected via `note.isPercussion` / `track.percussionArticulations` /
  channel 9, exactly as today.

### 2.2 The shells

- **Highway** (`highway.ts`): today hard-codes `KIT_PIECE_ORDER`. Generalize to take
  `LaneDef[]` and `laneKey` from the active instrument. Everything else — vertical
  time-scroll, gridlines, look-ahead, note boxes, sub-beat markers, the left counts
  ruler — is unchanged. Column labels come from `LaneDef.label`. The R/L sticking
  overlay becomes the instrument's `cue` (drums only; empty for sax).
- **Practice panel** (`drum-kit.ts` → `practice-panel.ts`): instrument-agnostic card
  holding the highway + the active instrument's `diagram`. Picks the instrument from the
  focused track; a small switcher in the header lists playable tracks when there are
  several.

## 3. Pitched highway — chromatic columns

- Columns = **every semitone** from the track's min..max `written` pitch (+1 pad each
  side), so the range auto-fits the actual part. `LaneDef.accidental` shades sharp/flat
  columns; labels are note names (`C4`, `C#4`, …).
- Same falling-notes mechanic as drums (Y = time-to-hit-line). Note boxes reuse the
  existing renderer.
- Colour: pitched notes coloured by **pitch class** (12-hue wheel) so a given note is
  always the same colour — aids recognition. (Drums keep their voice colours.)
- ~30 columns over the sax range fit a ~360px panel at ~12px each; auto-ranging to the
  part usually narrows this. Horizontal scroll is a fallback if a part is very wide.

## 4. Saxophone fingering chart (live diagram)

The pitched analog of the drum kit: a simplified saxophone SVG whose keys light up for
the current note (and ghost-light the next, mirroring the kit's approach rings).

- **Key set** (`SAX_KEYS`, stable ids): `octave`, front-`F`; left stack `B`, `bis`,
  `A`, `G`, `Gsharp`; left palm `palmD`, `palmEb`, `palmF`; right stack `F`, `E`, `D`;
  right side `sideC`, `sideBb`, `highE`; right pinky `lowEb`, `lowC`; low spatula
  `lowCsharp`, `lowB`, `lowBb`. (~20 lightable shapes.)
- **Fingering table** `SAX_FINGERINGS: Record<number, string[]>` keyed by **written
  MIDI** (Bb3=58 … F6=89, ~31 notes). One table serves all saxes (alto/tenor/…); only
  the sounding pitch differs. A canonical fingering is chosen per note; alternate
  fingerings (palm-key high register, bis vs side Bb, F# fork) are out of scope —
  documented default policy picks the common one.
- **SVG**: a vertical instrument body, main tone-key stack down the centre, octave +
  palm keys upper-left, side keys upper-right, pinky clusters at the bottom; each shape
  `id="sk-<keyid>"`, lit by toggling a class/opacity when its id is in the active note's
  set. Driven by the same `activeBeatsChanged` + timeline look-ahead as the kit.
- **Verification:** the full fingering table is authored from standard saxophone
  fingerings and **must be spot-checked against a reference chart before ship** (tracked
  as a Phase-2 acceptance item).

## 5. Instrument detection & selection

`detectInstrument(track)`:
1. percussion (`isPercussion`/channel 9) → **Drums**
2. MIDI program 64–67 or name matches `/sax/i` → **Saxophone**
3. otherwise → **Pitched** (chromatic highway, `diagram = null`)

The practice panel follows the **focused track** (soloed, else the first
rendered/percussion track). Settings → **Instruments** tab adds a per-track instrument
override (persisted), so a user can force "treat this track as alto sax".

## 6. UX pass (Phase 3 — full P1–P7)

| P | Effort | Change |
|---|---|---|
| 1 | M | Generalize the **visible** branding away from "🥁 DrumScore" to a neutral wordmark (codebase name kept as the working title); panel title + content instrument-driven. |
| 2 | S | Per-track instrument badge/icon in the mixer; indicate which track the panel follows. |
| 3 | M | Regroup the transport into clusters (playback · loop/speed · view · tools); overflow rare controls (zoom/layout/print) into a "View" menu. |
| 4 | S | Rename the floating "Kit" panel to **Practice**; clearer recall affordance. |
| 5 | S | Settings modal → tabbed/left-nav sections (+ new Instruments tab). |
| 6 | S | A11y: `:focus-visible` rings on sliders/icon buttons; raise `--text-dim` contrast; include buttons in the Space-to-play typing guard; aria-labels on icon buttons. |
| 7 | S | Friendlier first-run/empty state: import CTA + one-line "what this is". |

## 7. Phasing & verification

Each phase ends green: `tsc --noEmit` + `vitest run` + `vite build` + dev-server smoke +
manual QA.

- **Phase 1 — abstraction refactor, zero behaviour change.** Extract drum logic into
  `DrumsInstrument` behind the `Instrument` interface; make highway + panel lane/diagram
  driven; app instantiates Drums exactly as today. Guarded by the existing 17 tests + a
  new **equivalence test** asserting `DrumsInstrument.buildTimeline` matches the old
  `buildDrumTimeline` output on a sample score. No new features.
- **Phase 2 — pitched instrument + saxophone.** `PitchedInstrument` (chromatic highway,
  pitch-class colours), `SaxophoneInstrument` (fingering chart + table), detection +
  per-track override. New unit tests: written-pitch extraction (`displayValue` → lane),
  fingering lookup (written MIDI → keys), `detectInstrument`. Manual QA with a real sax
  part (GP/MusicXML).
- **Phase 3 — UX pass (P1–P7).** Independent UI work; verify no regression to playback,
  highway, or the new sax view.

## 8. Risks

- **Phase 1 must not change drum behaviour** — mitigated by the equivalence test + the
  existing suite + manual QA before any Phase-2 work.
- **Fingering correctness** — seed from standard fingerings, spot-check against a
  reference before ship; single canonical fingering per note.
- **Transposed parts** — `displayValue` is the verified written pitch; add a test with a
  transposing track if a sample is available.
- **Wide chromatic highway** — auto-range to the part's actual span; horizontal-scroll
  fallback.
- **Diagram abstraction fit** — the drum kit's rich animation (flash/rings/sticks/hub)
  vs the sax chart's simpler key-lighting: the `InstrumentDiagram` contract is kept
  minimal (`showActive`/`showUpcoming`/`setColors`) so neither instrument forces its
  internals on the other.

## 9. Open questions

- **App name.** *Decided:* keep the codebase name (`drumscore`) as the working title for
  now; during the UX pass, soften the **visible** brand to a neutral wordmark (drop the
  drum-specific identity). A real rename can happen later.
- **Generic pitched diagram.** Guitar/piano get the highway only this round; a piano
  keyboard diagram is a possible later addition.
- **Git.** The project is not a git repository, so this spec is written but not committed.
  Offer to `git init` if version control is wanted.
