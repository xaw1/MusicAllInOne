# Instrument Abstraction (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the existing drum behaviour through a new `Instrument` abstraction with **zero behaviour change**, so Phase 2 can add saxophone as a second instrument without forking the highway.

**Architecture:** Introduce a minimal `Instrument` interface (`buildTimeline` + `lanes`). Today's drum logic becomes `DrumsInstrument`. The highway becomes lane-driven (reads `LaneDef[]` + `PlayEvent.laneKey` instead of hard-coded `KIT_PIECE_ORDER`/`ev.piece`). The practice panel selects the instrument via `detectInstrument(track)` (returns `DrumsInstrument` in Phase 1). The drum-kit SVG and sticking overlay are unchanged — their generalization is Phase 2.

**Tech Stack:** TypeScript, Vite, alphaTab, Vitest.

**Repo note:** This project is **not** git-initialized. Treat each "Checkpoint" as: run the listed verification and continue. (Run `git init` first if you want commit history — optional.)

**Global verification (run after every task):**
```
npm run typecheck   # tsc --noEmit → exit 0
npm test            # vitest run → all green
npm run build       # vite build → exit 0
```
Working dir: `C:\Users\ahmed\Downloads\Compressed\MusicAllInOne-main\MusicAllInOne-main`

---

### Task 1: Define the Instrument types

**Files:**
- Create: `src/core/instrument/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type { KitPiece } from '../drums';
import type { DrumVoice } from '../colors';

/** A single playable event on the highway — generalizes the drum-only DrumEvent. */
export interface PlayEvent {
  tick: number;        // beat.absolutePlaybackStart
  timeMs: number;      // beat.timer (ms), constant-tempo fallback
  laneKey: string;     // stable lane id: drum piece name (drums) | written-MIDI string (pitched)
  accent: boolean;
  ghost: boolean;
  velocity: number;    // 0..1
  sounding: number;    // note.realValue   (pitched audio pitch; drums: 0, unused in Phase 1)
  written: number;     // note.displayValue (pitched staff pitch; drums: 0, unused in Phase 1)
  piece?: KitPiece;    // drums only
}

/** One highway column. */
export interface LaneDef {
  key: string;             // matches PlayEvent.laneKey
  label: string;           // 'SN' (drum) | 'C4' (pitch)
  colorVoice?: DrumVoice;  // drums: which colour-voice paints this lane
  accidental?: boolean;    // pitched: shade sharp/flat columns (Phase 2)
}

/** Strategy for one instrument family. Phase 1 keeps this minimal; the live
 *  diagram + per-note cue generalize in Phase 2. */
export interface Instrument {
  id: string;     // 'drums' | 'saxophone' | 'pitched'
  label: string;
  buildTimeline(score: any): PlayEvent[];
  lanes(events: PlayEvent[]): LaneDef[];
}
```

- [ ] **Step 2: Checkpoint** — `npm run typecheck` → exit 0 (types compile; nothing imports them yet).

---

### Task 2: DrumsInstrument + equivalence test

**Files:**
- Create: `src/core/instrument/drums.ts`
- Test: `src/core/instrument/drums.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { DrumsInstrument } from './drums';
import type { DrumEvent } from '../timeline';

// Minimal mock score: one track/staff/bar/voice/beat with two percussion notes.
function mockScore(): any {
  const note = (artic: number, ghost = false, accent = false) => ({
    isPercussion: true, percussionArticulation: artic, isGhost: ghost,
    accentuated: accent, dynamics: 5,
  });
  const beat = (tick: number, notes: any[]) => ({
    absolutePlaybackStart: tick, timer: tick, notes,
  });
  return {
    tempo: 120,
    tracks: [{
      index: 0, name: 'Drums',
      percussionArticulations: [{ outputMidiNumber: 36 }, { outputMidiNumber: 38 }],
      staves: [{ bars: [{ index: 0, voices: [{ beats: [
        beat(0, [note(0)]),      // kick (36)
        beat(480, [note(1)]),    // snare (38)
      ] }] }] }],
    }],
    masterBars: [{ timeSignatureNumerator: 4, timeSignatureDenominator: 4 }],
  };
}

describe('DrumsInstrument', () => {
  it('maps the drum timeline into PlayEvents preserving tick/laneKey/flags', () => {
    const inst = new DrumsInstrument();
    const events = inst.buildTimeline(mockScore());
    expect(events.length).toBe(2);
    expect(events[0].laneKey).toBe('kick');
    expect(events[0].piece).toBe('kick');
    expect(events[0].tick).toBe(0);
    expect(events[1].laneKey).toBe('snare');
    expect(events[1].tick).toBe(480);
    // laneKey must equal piece so the existing sticking overlay (`${tick}:${piece}`) still resolves
    for (const e of events) expect(e.laneKey).toBe(e.piece);
  });

  it('exposes lanes in the canonical kit order with labels + colour voices', () => {
    const inst = new DrumsInstrument();
    const lanes = inst.lanes([]);
    expect(lanes.map((l) => l.key)).toEqual(
      ['crash', 'hihat', 'snare', 'kick', 'hiTom', 'midTom', 'floorTom', 'ride'],
    );
    expect(lanes.find((l) => l.key === 'snare')?.label).toBe('SN');
    expect(lanes.find((l) => l.key === 'snare')?.colorVoice).toBe('snare');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- drums.test` — Expected: FAIL (`DrumsInstrument` not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import { buildDrumTimeline } from '../timeline';
import { KIT_PIECE_ORDER, PIECE_LABEL, PIECE_VOICE } from '../drums';
import type { Instrument, PlayEvent, LaneDef } from './types';

export class DrumsInstrument implements Instrument {
  readonly id = 'drums';
  readonly label = 'Drums';

  buildTimeline(score: any): PlayEvent[] {
    return buildDrumTimeline(score).map((d) => ({
      tick: d.tick,
      timeMs: d.timeMs,
      laneKey: d.piece,        // piece name == lane key (keeps sticking keys stable)
      accent: d.accent,
      ghost: d.ghost,
      velocity: d.velocity,
      sounding: 0,
      written: 0,
      piece: d.piece,
    }));
  }

  lanes(_events: PlayEvent[]): LaneDef[] {
    return KIT_PIECE_ORDER.map((p) => ({
      key: p,
      label: PIECE_LABEL[p],
      colorVoice: PIECE_VOICE[p],
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- drums.test` — Expected: PASS (2 tests). Then `npm test` — Expected: all prior tests still green.

- [ ] **Step 5: Checkpoint** — `npm run typecheck && npm run build` → both exit 0.

---

### Task 3: detectInstrument

**Files:**
- Create: `src/core/instrument/detect.ts`
- Test: `src/core/instrument/detect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectInstrument } from './detect';

describe('detectInstrument', () => {
  it('returns the drums instrument for any track in Phase 1', () => {
    expect(detectInstrument({ name: 'Drums' }).id).toBe('drums');
    expect(detectInstrument({ name: 'Alto Sax' }).id).toBe('drums'); // until Phase 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- detect.test` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { DrumsInstrument } from './drums';
import type { Instrument } from './types';

const drums = new DrumsInstrument();

/** Phase 1: only drums exist. Phase 2 adds saxophone/pitched branches here. */
export function detectInstrument(_track: any): Instrument {
  return drums;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm test -- detect.test` → PASS; `npm test` → all green.

- [ ] **Step 5: Checkpoint** — typecheck + build → exit 0.

---

### Task 4: Make the highway lane-driven

**Files:**
- Modify: `src/ui/highway.ts`

The highway currently hard-codes `KIT_PIECE_ORDER`, `PIECE_LABEL`, `PIECE_VOICE`, and reads `ev.piece`/`DrumEvent`. Generalize it to a `LaneDef[]` + `PlayEvent[]` without changing rendering for drums (the drum lanes are passed in identical order, so output is pixel-identical).

- [ ] **Step 1: Change the data the highway holds**

Replace the `events: DrumEvent[]` field and the `LANE_INDEX` const with instance state:
```ts
import type { PlayEvent, LaneDef } from '../core/instrument/types';
// ...
  private events: PlayEvent[] = [];
  private lanes: LaneDef[] = [];
  private laneIndex = new Map<string, number>();

  setLanes(lanes: LaneDef[]): void {
    this.lanes = lanes;
    this.laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  }
  setTimeline(events: PlayEvent[]): void { this.events = events; }
```
Delete the module-level `const LANE_INDEX = new Map(...KIT_PIECE_ORDER...)`.

- [ ] **Step 2: Update `draw()` lane math**

- Replace `const lanes = KIT_PIECE_ORDER.length;` with `const lanes = this.lanes.length; if (lanes === 0) return;`
- Replace the per-lane label loop to read `this.lanes[i].label` instead of `PIECE_LABEL[KIT_PIECE_ORDER[i]]`.
- Replace `const lane = LANE_INDEX.get(ev.piece);` with `const lane = this.laneIndex.get(ev.laneKey);`
- Replace the colour lookup `colours[PIECE_VOICE[ev.piece]]` with a lane-aware lookup:
```ts
const laneDef = this.lanes[lane];
const colour = laneDef.colorVoice ? colours[laneDef.colorVoice] : '#9aa1b1';
```
- The sticking lookup stays `sticking.hands.get(`${ev.tick}:${ev.laneKey}`)` (drums: laneKey === piece, so identical behaviour).

- [ ] **Step 3: Verify build + manual**

Run: `npm run build` → exit 0. Run `npm run dev`, open the app, load the demo, press play: the highway must render and scroll exactly as before (8 drum lanes, same labels/colours). Expected: identical to pre-refactor.

- [ ] **Step 4: Checkpoint** — typecheck + build + the manual check above.

---

### Task 5: Feed the highway/panel from the Instrument

**Files:**
- Modify: `src/ui/drum-kit.ts`

`drum-kit.ts` currently calls `buildDrumTimeline(score)` and feeds the highway directly. Route it through the instrument so the lane source is the abstraction.

- [ ] **Step 1: Select the instrument on score load**

At the top, import:
```ts
import { detectInstrument } from '../core/instrument/detect';
```
Replace the `engine.onScore(...)` body that builds the timeline:
```ts
engine.onScore((score) => {
  const track = score?.tracks?.find((t: any) => t?.playbackInfo) ?? score?.tracks?.[0];
  const instrument = detectInstrument(track);
  timeline = instrument.buildTimeline(score);        // PlayEvent[]
  highway.setLanes(instrument.lanes(timeline));
  highway.setTimeline(timeline);
  highway.setGrid(buildGrid(score));
});
```
Update the module's `timeline` variable type from `DrumEvent[]` to `PlayEvent[]` (import the type). The approach-rings loop reads `ev.tick` / `ev.piece` — `PlayEvent` still has both (`piece` is set for drums), so `updateRings()` needs no change beyond the type.

- [ ] **Step 2: Confirm the rings still key by piece**

In `updateRings()`, `found.set(ev.piece, ...)` and `firstIndexAtOrAfter(timeline, now)` — `ev.piece` is defined for drum PlayEvents, so behaviour is unchanged. (If TS complains `piece` is optional, guard: `if (!ev.piece) continue;`.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build` → exit 0. Run `npm run dev`: load demo, play — highway, approach rings, live kit, and sticking letters all behave exactly as before. The drum experience is unchanged; it is now routed through `DrumsInstrument`.

- [ ] **Step 4: Checkpoint** — full global verification (typecheck + test + build all green) + the manual QA above.

---

### Task 6: Phase-1 regression sweep

- [ ] **Step 1:** Run the full suite: `npm run typecheck` (0), `npm test` (all green, incl. the 2 new instrument tests), `npm run build` (0).
- [ ] **Step 2:** Manual QA on `npm run dev`: import a real `.gp` drum file (or the demo), play, toggle metronome/loop/speed, open the AI panel, drag/dock the practice panel — confirm **no behavioural difference** from before the refactor.
- [ ] **Step 3: Checkpoint** — Phase 1 complete: drums fully routed through the `Instrument` abstraction with zero behaviour change. Ready to author the Phase 2 plan (pitched highway + saxophone) against this resulting code.

---

## Self-review

- **Spec coverage:** Implements spec §2 (instrument strategy layer: `types.ts`, `drums.ts`, `detect.ts`), §2.2 (lane-driven highway), and the §7 Phase-1 acceptance (behaviour-preserving + equivalence test). Pitched highway (§3), fingering chart (§4), detection of non-drum instruments (§5), and UX (§6) are explicitly deferred to Phase 2/3 plans.
- **Placeholder scan:** none — every new file and test has complete code; modify-tasks give exact symbols and snippets.
- **Type consistency:** `PlayEvent`/`LaneDef`/`Instrument` defined in Task 1 are used unchanged in Tasks 2–5; `laneKey`, `setLanes`, `setTimeline`, `detectInstrument` names are consistent across tasks.
