# Phase 2a — Pitched Highway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make a pitched (non-drum) track's notes fall on the chromatic falling-notes highway, reusing the Phase-1 `Instrument` abstraction. No fingering chart yet (that's Phase 2b).

**Architecture:** Add `PitchedInstrument` (chromatic lanes from `note.displayValue`, pitch-class colours). Extend `Instrument.buildTimeline` to take the focused `track`. `detectInstrument` returns drums for percussion, else pitched. The practice panel follows a focused track and hides the drum-kit SVG for pitched instruments (highway only).

**Tech Stack:** TypeScript, Vite, alphaTab, Vitest. Working dir: `C:\Users\ahmed\Downloads\Compressed\MusicAllInOne-main\MusicAllInOne-main`. Not git-initialized (Checkpoints = run verification, continue).

**Global verification after every task:** `npm run typecheck` (0) · `npm test` (green) · `npm run build` (0).

---

### Task 1: Pitch helpers

**Files:** Create `src/core/pitch.ts`, Test `src/core/pitch.test.ts`

- [ ] **Step 1: Test (write `src/core/pitch.test.ts`)**
```ts
import { describe, it, expect } from 'vitest';
import { noteName, isAccidental, pitchClassColour } from './pitch';

describe('pitch helpers', () => {
  it('names MIDI notes in scientific pitch (C4 = 60)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(58)).toBe('A#3'); // written low Bb3 on sax
  });
  it('flags accidentals by pitch class', () => {
    expect(isAccidental(60)).toBe(false); // C
    expect(isAccidental(61)).toBe(true);  // C#
    expect(isAccidental(66)).toBe(true);  // F#
  });
  it('gives a stable colour per pitch class (octave-independent)', () => {
    expect(pitchClassColour(60)).toBe(pitchClassColour(72)); // C == C
    expect(pitchClassColour(60)).not.toBe(pitchClassColour(61));
  });
});
```
- [ ] **Step 2: Run → FAIL** (`npm test -- pitch.test`).
- [ ] **Step 3: Implement `src/core/pitch.ts`**
```ts
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ACCIDENTAL = new Set([1, 3, 6, 8, 10]);
const pc = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;

/** Scientific pitch name, MIDI 60 = C4. */
export function noteName(midi: number): string {
  return `${NAMES[pc(midi)]}${Math.floor(Math.round(midi) / 12) - 1}`;
}
export function isAccidental(midi: number): boolean {
  return ACCIDENTAL.has(pc(midi));
}
/** Stable hue per pitch class (same note = same colour across octaves). */
export function pitchClassColour(midi: number): string {
  return `hsl(${Math.round((pc(midi) / 12) * 360)} 70% 60%)`;
}
```
- [ ] **Step 4: Run → PASS**; `npm test` all green. **Checkpoint.**

---

### Task 2: buildTimeline takes the focused track

**Files:** Modify `src/core/instrument/types.ts`, `src/core/instrument/drums.ts`, `src/core/instrument/drums.test.ts`

- [ ] **Step 1:** In `types.ts`: change the `Instrument` method to `buildTimeline(score: any, track?: any): PlayEvent[];` and add an optional `color?: string;` field to `LaneDef` (after `colorVoice`):
```ts
export interface LaneDef {
  key: string;
  label: string;
  colorVoice?: DrumVoice;
  color?: string;       // explicit colour (pitched lanes); overrides colorVoice
  accidental?: boolean;
}
```
- [ ] **Step 2:** In `drums.ts`: change the signature to `buildTimeline(score: any, _track?: any): PlayEvent[]` (drums still walk ALL tracks via `buildDrumTimeline`; the param is ignored). No other change.
- [ ] **Step 3:** `drums.test.ts` already calls `buildTimeline(mockScore())` — still valid (track optional). Run `npm test` → green. **Checkpoint** (typecheck + build).

---

### Task 3: Highway honours an explicit lane colour

**Files:** Modify `src/ui/highway.ts`

- [ ] **Step 1:** Find the colour line in `draw()`:
```ts
const colour = laneDef.colorVoice ? colours[laneDef.colorVoice] : '#9aa1b1';
```
Replace with:
```ts
const colour = laneDef.color ?? (laneDef.colorVoice ? colours[laneDef.colorVoice] : '#9aa1b1');
```
(Drums set no `color`, so behaviour is unchanged; pitched lanes set `color`.)
- [ ] **Step 2:** `npm run typecheck && npm run build` → 0. **Checkpoint.**

---

### Task 4: PitchedInstrument

**Files:** Create `src/core/instrument/pitched.ts`, Test `src/core/instrument/pitched.test.ts`

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from 'vitest';
import { PitchedInstrument } from './pitched';

function saxBeat(tick: number, displayValue: number): any {
  return { absolutePlaybackStart: tick, timer: tick, notes: [
    { isPercussion: false, displayValue, realValue: displayValue + 3, dynamics: 5 },
  ] };
}
function mockTrack(): any {
  return { name: 'Alto Sax', staves: [{ bars: [{ voices: [{ beats: [
    saxBeat(0, 60),    // C4
    saxBeat(480, 62),  // D4
    saxBeat(960, 67),  // G4
  ] }] }] }] };
}

describe('PitchedInstrument', () => {
  it('builds a timeline from written pitch (displayValue), skipping percussion', () => {
    const inst = new PitchedInstrument();
    const events = inst.buildTimeline({ tempo: 120 }, mockTrack());
    expect(events.map((e) => e.written)).toEqual([60, 62, 67]);
    expect(events.map((e) => e.laneKey)).toEqual(['60', '62', '67']);
    expect(events[0].sounding).toBe(63); // realValue passed through
  });
  it('lanes are chromatic across the part range (+/-1 pad) with note-name labels', () => {
    const inst = new PitchedInstrument();
    const events = inst.buildTimeline({ tempo: 120 }, mockTrack());
    const lanes = inst.lanes(events);
    expect(lanes[0].key).toBe('59');                 // 60 - 1 pad
    expect(lanes[lanes.length - 1].key).toBe('68');  // 67 + 1 pad
    expect(lanes.find((l) => l.key === '60')?.label).toBe('C4');
    expect(lanes.find((l) => l.key === '61')?.accidental).toBe(true);
    expect(lanes.find((l) => l.key === '60')?.color).toBeTruthy();
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/core/instrument/pitched.ts`**
```ts
import type { Instrument, PlayEvent, LaneDef } from './types';
import { QUARTER_TICKS } from '../drums';
import { noteName, isAccidental, pitchClassColour } from '../pitch';

/** Any melodic (non-percussion) instrument: chromatic falling-notes highway. */
export class PitchedInstrument implements Instrument {
  readonly id: string = 'pitched';
  readonly label: string = 'Pitched';

  buildTimeline(score: any, track?: any): PlayEvent[] {
    const events: PlayEvent[] = [];
    if (!track?.staves) return events;
    const bpm = typeof score?.tempo === 'number' && score.tempo > 0 ? score.tempo : 120;
    const msPerTick = 60000 / bpm / QUARTER_TICKS;
    for (const staff of track.staves ?? []) {
      for (const bar of staff.bars ?? []) {
        for (const voice of bar.voices ?? []) {
          for (const beat of voice.beats ?? []) {
            const tick = beat.absolutePlaybackStart;
            const timer = beat.timer;
            const timeMs =
              typeof timer === 'number' && isFinite(timer) ? timer : tick * msPerTick;
            for (const note of beat.notes ?? []) {
              if (note?.isPercussion) continue;
              const written =
                typeof note?.displayValue === 'number' ? note.displayValue : note?.realValue;
              if (typeof written !== 'number') continue;
              events.push({
                tick,
                timeMs,
                laneKey: String(written),
                written,
                sounding: typeof note?.realValue === 'number' ? note.realValue : written,
                accent: !!note?.accentuated,
                ghost: !!note?.isGhost,
                velocity:
                  typeof note?.dynamics === 'number'
                    ? Math.max(0, Math.min(1, note.dynamics / 7))
                    : 0.6,
              });
            }
          }
        }
      }
    }
    events.sort((a, b) => a.tick - b.tick);
    return events;
  }

  lanes(events: PlayEvent[]): LaneDef[] {
    if (events.length === 0) return [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of events) {
      if (e.written < lo) lo = e.written;
      if (e.written > hi) hi = e.written;
    }
    lo -= 1;
    hi += 1;
    const lanes: LaneDef[] = [];
    for (let m = lo; m <= hi; m++) {
      lanes.push({
        key: String(m),
        label: noteName(m),
        color: pitchClassColour(m),
        accidental: isAccidental(m),
      });
    }
    return lanes;
  }
}
```
- [ ] **Step 4: Run → PASS**; `npm test` all green. **Checkpoint.**

---

### Task 5: detectInstrument — drums vs pitched

**Files:** Modify `src/core/instrument/detect.ts`, `src/core/instrument/detect.test.ts`

- [ ] **Step 1:** Replace `detect.ts`:
```ts
import { DrumsInstrument } from './drums';
import { PitchedInstrument } from './pitched';
import type { Instrument } from './types';

function isPercussionTrack(track: any): boolean {
  const pi = track?.playbackInfo;
  if (pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9)) return true;
  return /drum|perc|kit|schlag|bater/i.test(track?.name ?? '');
}

/** Phase 2a: percussion -> drums, everything else -> pitched.
 *  (Phase 2b adds a saxophone branch with a fingering chart.) */
export function detectInstrument(track: any): Instrument {
  return isPercussionTrack(track) ? new DrumsInstrument() : new PitchedInstrument();
}
```
- [ ] **Step 2:** Replace `detect.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectInstrument } from './detect';

describe('detectInstrument', () => {
  it('returns drums for a percussion track (channel 9 or name)', () => {
    expect(detectInstrument({ playbackInfo: { primaryChannel: 9 } }).id).toBe('drums');
    expect(detectInstrument({ name: 'Drums' }).id).toBe('drums');
  });
  it('returns pitched for a melodic track', () => {
    expect(detectInstrument({ name: 'Alto Sax', playbackInfo: { primaryChannel: 2 } }).id).toBe('pitched');
  });
});
```
- [ ] **Step 3: Run → PASS**; `npm test` all green. **Checkpoint.**

---

### Task 6: Panel follows a focused track; hide the kit for pitched

**Files:** Modify `src/ui/drum-kit.ts`

- [ ] **Step 1:** Replace the `engine.onScore(...)` body (added in Phase 1) with focused-track selection + kit show/hide:
```ts
engine.onScore((score) => {
  const tracks: any[] = score?.tracks ?? [];
  // Prefer a percussion track (keeps drum songs on the kit); else the first track.
  const focus =
    tracks.find((t) => {
      const pi = t?.playbackInfo;
      return (pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9)) ||
        /drum|perc|kit|schlag|bater/i.test(t?.name ?? '');
    }) ?? tracks.find((t) => t?.playbackInfo) ?? tracks[0];
  const instrument = detectInstrument(focus);
  timeline = instrument.buildTimeline(score, focus);
  highway.setLanes(instrument.lanes(timeline));
  highway.setTimeline(timeline);
  highway.setGrid(buildGrid(score));
  // The drum-kit SVG only makes sense for drums; pitched shows the highway only.
  stage.style.display = instrument.id === 'drums' ? 'flex' : 'none';
  (card.querySelector('.kit-title') as HTMLElement).textContent = instrument.label;
});
```
Note: `stage` is already defined (`card.querySelector('.kit-stage')`); ensure this runs after `stage` is assigned (it is — `stage` is declared just above the `new Highway(...)` call). `card` is in scope.
- [ ] **Step 2:** No change needed to `updateRings` (its `if (!ev.piece) continue;` already skips every pitched event, so no rings draw for pitched — correct, since the kit is hidden).
- [ ] **Step 3: Verify:** `npm run typecheck && npm test && npm run build` → all green. Manual (`npm run dev`): a drum song still shows the kit + drum highway exactly as before; loading a sax/pitched part (or soloing-to-load one) shows the chromatic note highway with the kit hidden.
- [ ] **Step 4: Checkpoint.**

---

### Task 7: Regression + review

- [ ] **Step 1:** Full gate green (typecheck 0, all tests pass incl. pitch/pitched/detect, build 0).
- [ ] **Step 2:** Independent code review of the diff: confirm drums unchanged + pitched highway correct.
- [ ] **Step 3:** Manual QA: drum demo unchanged; a pitched part falls on the chromatic highway with note-name columns + pitch-class colours.

---

## Self-review

- **Spec coverage:** Implements spec §3 (chromatic highway off `displayValue`, pitch-class colour, auto-range) and §5 detection (drums vs pitched; the saxophone branch + fingering chart §4 are Phase 2b). `LaneDef.color` is the minimal extension enabling pitched colours.
- **Placeholders:** none — complete code for all new files/tests; exact edits for changes.
- **Type consistency:** `buildTimeline(score, track?)`, `LaneDef.color`, `PitchedInstrument`, `detectInstrument`, `noteName/isAccidental/pitchClassColour` used consistently across tasks.
- **Behaviour preservation:** drums set no `LaneDef.color` and ignore the `track` param, so drum rendering/timeline are unchanged; the kit hides only when `instrument.id !== 'drums'`.
