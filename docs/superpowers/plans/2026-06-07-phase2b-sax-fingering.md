# Phase 2b — Saxophone Fingering Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A live saxophone fingering chart that lights the keys for the current (and next) note as a sax part plays, plus a basic instrument switcher so a band file can focus the sax track. Drum code stays untouched.

**Architecture:** `SaxophoneInstrument extends PitchedInstrument` (same chromatic highway) and adds a `fingering(writtenMidi)` lookup over a fingering dataset. A self-contained `fingering-chart.ts` renders a light-up sax SVG, driven by its own rAF off the live tick + timeline (same pattern as the kit's approach rings). The practice panel hosts BOTH the drum kit and the sax chart in the DOM and shows the one matching `instrument.id`. A header `<select>` lets the user re-focus any track.

**DATA INTEGRITY:** `SAX_FINGERINGS` is an **UNVERIFIED SAMPLE** (clearly flagged in code + a visible caption on the chart). Completing + verifying the full table against a reference is a separate task (Task 8). The mechanism must render correctly for whatever entries exist and show "fingering not charted yet" for missing notes.

**Tech Stack:** TS, Vite, alphaTab, Vitest. Working dir: `C:\Users\ahmed\Downloads\Compressed\MusicAllInOne-main\MusicAllInOne-main`. Not git-initialized.

**Global verification after every task:** `npm run typecheck` (0) · `npm test` (green) · `npm run build` (0).

---

### Task 1: Fingering data model + sample dataset (flagged unverified)

**Files:** Create `src/core/instrument/sax-fingerings.ts`, Test `src/core/instrument/sax-fingerings.test.ts`

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from 'vitest';
import { SAX_KEYS, SAX_FINGERINGS, fingeringFor, FINGERINGS_VERIFIED } from './sax-fingerings';

describe('sax fingerings', () => {
  it('every key id used in the table is a known key', () => {
    const known = new Set(SAX_KEYS.map((k) => k.id));
    for (const [midi, keys] of Object.entries(SAX_FINGERINGS)) {
      for (const k of keys) expect(known.has(k), `note ${midi} uses unknown key ${k}`).toBe(true);
    }
  });
  it('fingeringFor returns the key list or null when not charted', () => {
    const charted = Number(Object.keys(SAX_FINGERINGS)[0]);
    expect(Array.isArray(fingeringFor(charted))).toBe(true);
    expect(fingeringFor(999)).toBeNull();
  });
  it('is flagged unverified until a reference check is done', () => {
    expect(FINGERINGS_VERIFIED).toBe(false);
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/core/instrument/sax-fingerings.ts`**
```ts
/* ----------------------------------------------------------------------------
   Saxophone fingering data.

   ⚠️ UNVERIFIED SAMPLE. These fingerings are a structural placeholder so the
   chart mechanism works; they have NOT been checked against a reference chart
   and MUST NOT be trusted for practice until FINGERINGS_VERIFIED === true.
   Fingerings are keyed by WRITTEN MIDI note (all saxes share fingerings).
---------------------------------------------------------------------------- */

export const FINGERINGS_VERIFIED = false; // flip to true only after a reference check

export interface SaxKey {
  id: string;
  label: string;        // short label for tooltips
  hand: 'L' | 'R' | 'thumb';
}

/** The lightable key set on the simplified diagram. */
export const SAX_KEYS: SaxKey[] = [
  { id: 'oct', label: 'Octave', hand: 'thumb' },
  { id: 'lh1', label: 'B (LH 1)', hand: 'L' },
  { id: 'lh2', label: 'A (LH 2)', hand: 'L' },
  { id: 'lh3', label: 'G (LH 3)', hand: 'L' },
  { id: 'bis', label: 'Bis Bb', hand: 'L' },
  { id: 'gsharp', label: 'G#', hand: 'L' },
  { id: 'palmD', label: 'Palm D', hand: 'L' },
  { id: 'palmEb', label: 'Palm Eb', hand: 'L' },
  { id: 'palmF', label: 'Palm F', hand: 'L' },
  { id: 'lowB', label: 'Low B', hand: 'L' },
  { id: 'lowBb', label: 'Low Bb', hand: 'L' },
  { id: 'lowCsharp', label: 'Low C#', hand: 'L' },
  { id: 'rh1', label: 'F (RH 1)', hand: 'R' },
  { id: 'rh2', label: 'E (RH 2)', hand: 'R' },
  { id: 'rh3', label: 'D (RH 3)', hand: 'R' },
  { id: 'fsharp', label: 'F#', hand: 'R' },
  { id: 'sideBb', label: 'Side Bb', hand: 'R' },
  { id: 'sideC', label: 'Side C', hand: 'R' },
  { id: 'sideE', label: 'High E', hand: 'R' },
  { id: 'lowC', label: 'Low C', hand: 'R' },
  { id: 'lowEb', label: 'Low Eb', hand: 'R' },
];

/** WRITTEN MIDI note -> pressed key ids. ⚠️ SAMPLE — see file header.
 *  Seeded with the low-register "stack" pattern + octave-key upper register.
 *  Many notes intentionally omitted; the chart shows "not charted" for those. */
export const SAX_FINGERINGS: Record<number, string[]> = {
  // --- low register (no octave key) — SAMPLE, VERIFY ---
  62: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3'],          // D4 (written)
  64: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2'],                  // E4
  65: ['lh1', 'lh2', 'lh3', 'rh1'],                         // F4
  67: ['lh1', 'lh2', 'lh3'],                                // G4
  69: ['lh1', 'lh2'],                                       // A4
  71: ['lh1'],                                              // B4
  72: ['lh1', 'lh2', 'rh1'],                                // C5 (one common fingering)
  // --- upper register = same fingering + octave key — SAMPLE, VERIFY ---
  74: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3'],    // D5
  76: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2'],           // E5
  77: ['oct', 'lh1', 'lh2', 'lh3', 'rh1'],                  // F5
  79: ['oct', 'lh1', 'lh2', 'lh3'],                         // G5
  81: ['oct', 'lh1', 'lh2'],                                // A5
  83: ['oct', 'lh1'],                                       // B5
};

export function fingeringFor(writtenMidi: number): string[] | null {
  return SAX_FINGERINGS[writtenMidi] ?? null;
}
```
- [ ] **Step 4: Run → PASS**; `npm test` green. **Checkpoint.**

---

### Task 2: SaxophoneInstrument

**Files:** Create `src/core/instrument/saxophone.ts`, Test `src/core/instrument/saxophone.test.ts`

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from 'vitest';
import { SaxophoneInstrument } from './saxophone';

describe('SaxophoneInstrument', () => {
  it('is a pitched instrument with a sax id and fingering lookup', () => {
    const sax = new SaxophoneInstrument();
    expect(sax.id).toBe('saxophone');
    // inherits the pitched highway:
    const events = sax.buildTimeline({ tempo: 120 }, {
      staves: [{ bars: [{ voices: [{ beats: [
        { absolutePlaybackStart: 0, timer: 0, notes: [{ isPercussion: false, displayValue: 67 }] },
      ] }] }] }],
    });
    expect(events[0].written).toBe(67);
    // fingering lookup (G4 is in the sample table):
    expect(sax.fingering(67)).toEqual(['lh1', 'lh2', 'lh3']);
    expect(sax.fingering(999)).toBeNull();
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/core/instrument/saxophone.ts`**
```ts
import { PitchedInstrument } from './pitched';
import { fingeringFor } from './sax-fingerings';

export class SaxophoneInstrument extends PitchedInstrument {
  override readonly id = 'saxophone';
  override readonly label = 'Saxophone';

  /** Pressed key ids for a WRITTEN MIDI note, or null if not charted. */
  fingering(writtenMidi: number): string[] | null {
    return fingeringFor(writtenMidi);
  }
}
```
- [ ] **Step 4: Run → PASS**; `npm test` green. **Checkpoint.**

---

### Task 3: detect saxophone

**Files:** Modify `src/core/instrument/detect.ts`, `src/core/instrument/detect.test.ts`

- [ ] **Step 1:** In `detect.ts`, add the sax branch BEFORE the generic pitched return. Add import `import { SaxophoneInstrument } from './saxophone';` and a helper:
```ts
function isSax(track: any): boolean {
  const program = track?.playbackInfo?.program;
  if (typeof program === 'number' && program >= 64 && program <= 67) return true; // GM sax family
  return /\bsax\b|saxophone|alto|tenor|soprano|baritone/i.test(track?.name ?? '');
}
```
and change `detectInstrument`:
```ts
export function detectInstrument(track: any): Instrument {
  if (isPercussionTrack(track)) return new DrumsInstrument();
  if (isSax(track)) return new SaxophoneInstrument();
  return new PitchedInstrument();
}
```
- [ ] **Step 2:** In `detect.test.ts` add:
```ts
  it('returns saxophone for a sax track (program 65 or name)', () => {
    expect(detectInstrument({ name: 'Trumpet', playbackInfo: { program: 65 } }).id).toBe('saxophone');
    expect(detectInstrument({ name: 'Tenor Sax', playbackInfo: { program: 56 } }).id).toBe('saxophone');
  });
  it('a generic melodic track stays pitched', () => {
    expect(detectInstrument({ name: 'Violin', playbackInfo: { program: 40 } }).id).toBe('pitched');
  });
```
- [ ] **Step 3: Run → PASS**; `npm test` green. **Checkpoint.**

---

### Task 4: Fingering chart UI (self-contained)

**Files:** Create `src/ui/fingering-chart.ts`

A self-contained module: builds a simplified sax SVG (~21 lightable key shapes by id), exposes `mount`, `setActive`, and a caption noting unverified data. Driven externally (the panel calls `setActive` from its rAF).

- [ ] **Step 1: Implement `src/ui/fingering-chart.ts`**
```ts
import { SAX_KEYS, FINGERINGS_VERIFIED } from '../core/instrument/sax-fingerings';

const SVGNS = 'http://www.w3.org/2000/svg';

// Simple vertical layout: x columns by hand, y rows. Each key id gets a shape.
// (Positions are schematic, not anatomically exact — enough to read which keys.)
const POS: Record<string, { x: number; y: number; r: number }> = {
  oct: { x: 30, y: 30, r: 9 },
  palmD: { x: 30, y: 52, r: 7 }, palmEb: { x: 30, y: 70, r: 7 }, palmF: { x: 30, y: 88, r: 7 },
  lh1: { x: 80, y: 50, r: 11 }, lh2: { x: 80, y: 78, r: 11 }, lh3: { x: 80, y: 106, r: 11 },
  bis: { x: 62, y: 64, r: 6 }, gsharp: { x: 102, y: 120, r: 6 },
  sideBb: { x: 124, y: 60, r: 6 }, sideC: { x: 124, y: 78, r: 6 }, sideE: { x: 124, y: 96, r: 6 },
  rh1: { x: 80, y: 150, r: 11 }, rh2: { x: 80, y: 178, r: 11 }, rh3: { x: 80, y: 206, r: 11 },
  fsharp: { x: 102, y: 164, r: 6 },
  lowB: { x: 60, y: 132, r: 6 }, lowBb: { x: 60, y: 146, r: 6 }, lowCsharp: { x: 60, y: 160, r: 6 },
  lowC: { x: 100, y: 226, r: 6 }, lowEb: { x: 100, y: 240, r: 6 },
};

export class FingeringChart {
  readonly el: HTMLElement;
  private shapes = new Map<string, SVGElement>();
  private caption: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fingering-chart';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 150 256');
    svg.setAttribute('class', 'fingering-svg');
    // body outline
    const body = document.createElementNS(SVGNS, 'rect');
    body.setAttribute('x', '64'); body.setAttribute('y', '20');
    body.setAttribute('width', '32'); body.setAttribute('height', '226');
    body.setAttribute('rx', '16'); body.setAttribute('class', 'fc-body');
    svg.appendChild(body);
    for (const key of SAX_KEYS) {
      const p = POS[key.id];
      if (!p) continue;
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', String(p.x)); c.setAttribute('cy', String(p.y));
      c.setAttribute('r', String(p.r)); c.setAttribute('class', 'fc-key');
      c.setAttribute('data-key', key.id);
      const title = document.createElementNS(SVGNS, 'title');
      title.textContent = key.label;
      c.appendChild(title);
      svg.appendChild(c);
      this.shapes.set(key.id, c);
    }
    this.el.appendChild(svg);
    this.caption = document.createElement('div');
    this.caption.className = 'fingering-caption';
    this.el.appendChild(this.caption);
  }

  /** Light the given key ids (current note) + ghost-light the next note's keys. */
  setActive(current: string[] | null, upcoming: string[] | null, noteLabel: string): void {
    const cur = new Set(current ?? []);
    const up = new Set(upcoming ?? []);
    for (const [id, shape] of this.shapes) {
      shape.classList.toggle('is-down', cur.has(id));
      shape.classList.toggle('is-next', !cur.has(id) && up.has(id));
    }
    if (!current) {
      this.caption.textContent = noteLabel ? `${noteLabel}: not charted yet` : '';
    } else {
      this.caption.textContent = FINGERINGS_VERIFIED
        ? noteLabel
        : `${noteLabel} — sample fingering (unverified)`;
    }
  }
}
```
- [ ] **Step 2:** Add styles to `src/styles.css` (append):
```css
/* ---------------------------------------------------------------- Fingering chart */
.fingering-chart { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; }
.fingering-svg { width: 100%; height: 100%; min-height: 0; }
.fc-body { fill: rgba(255,255,255,0.04); stroke: var(--border); stroke-width: 1.5; }
.fc-key { fill: #2b303b; stroke: #10131a; stroke-width: 1.5; transition: fill .08s ease; }
.fc-key.is-down { fill: var(--accent-2); stroke: var(--accent-2); }
.fc-key.is-next { fill: rgba(79,140,255,0.35); }
.fingering-caption { font-size: 11px; color: var(--text-dim); padding: 4px 0 2px; text-align: center; }
```
- [ ] **Step 3:** `npm run typecheck && npm run build` → 0. **Checkpoint.** (No unit test — DOM/SVG; covered by manual QA + the data tests.)

---

### Task 5: Host the chart in the panel + drive it; instrument switcher

**Files:** Modify `src/ui/drum-kit.ts`

- [ ] **Step 1:** Imports: add
```ts
import { FingeringChart } from './fingering-chart';
import { SaxophoneInstrument } from '../core/instrument/saxophone';
import type { Instrument } from '../core/instrument/types';
```
- [ ] **Step 2:** After `const stage = card.querySelector('.kit-stage') as HTMLElement;`, create the chart and a second stage container, and add an instrument `<select>` to the header. Insert:
```ts
  const fingering = new FingeringChart();
  fingering.el.style.display = 'none';
  stage.parentElement!.appendChild(fingering.el);

  let activeInstrument: Instrument | null = null;
  let allTracks: any[] = [];

  // instrument/track switcher in the header
  const switcher = document.createElement('select');
  switcher.className = 'kit-switcher';
  (card.querySelector('.kit-head-actions') as HTMLElement).prepend(switcher);
  switcher.onchange = () => {
    const idx = Number(switcher.value);
    const t = allTracks[idx];
    if (t) focusTrack(t);
  };
```
- [ ] **Step 3:** Replace the `engine.onScore(...)` block (the Phase-2a version) with a version that records tracks, populates the switcher, and delegates to a new `focusTrack`:
```ts
  function focusTrack(track: any): void {
    const score = engine.api.score;
    if (!score) return;
    const instrument = detectInstrument(track);
    activeInstrument = instrument;
    const tl = instrument.buildTimeline(score, track);
    timeline = tl;
    highway.setLanes(instrument.lanes(tl));
    highway.setTimeline(tl);
    highway.setGrid(buildGrid(score));
    const isDrums = instrument.id === 'drums';
    const isSax = instrument.id === 'saxophone';
    stage.style.display = isDrums ? 'flex' : 'none';
    fingering.el.style.display = isSax ? 'flex' : 'none';
    (card.querySelector('.kit-title') as HTMLElement).textContent = instrument.label;
  }

  engine.onScore((score) => {
    allTracks = score?.tracks ?? [];
    // populate switcher (skip empty tracks)
    switcher.innerHTML = allTracks
      .map((t, i) => `<option value="${i}">${(t?.name ?? `Track ${i + 1}`).replace(/[<>&]/g, '')}</option>`)
      .join('');
    const focus =
      allTracks.find((t) => {
        const pi = t?.playbackInfo;
        return (pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9)) ||
          /drum|perc|kit|schlag|bater/i.test(t?.name ?? '');
      }) ?? allTracks.find((t) => t?.playbackInfo) ?? allTracks[0];
    const focusIdx = allTracks.indexOf(focus);
    if (focusIdx >= 0) switcher.value = String(focusIdx);
    focusTrack(focus);
  });
```
- [ ] **Step 4:** Drive the fingering chart from the existing rings rAF. In `updateRings()`, after the drum-ring logic, add a sax branch at the top that returns early when the active instrument is sax (the rings are drum-only). Replace the start of `updateRings` body:
```ts
  function updateRings(): void {
    if (activeInstrument && activeInstrument.id === 'saxophone') { updateFingering(); return; }
    const show = viz.showKit && viz.approachRings && timeline.length > 0;
    // ... unchanged drum-ring code ...
```
and add `updateFingering` next to it:
```ts
  function updateFingering(): void {
    if (!viz.showKit || timeline.length === 0 || !(activeInstrument instanceof SaxophoneInstrument)) {
      fingering.setActive(null, null, '');
      return;
    }
    const now = engine.currentTick;
    // current = the latest note at/just before now; next = first note after now
    let curEv: PlayEvent | null = null;
    let nextEv: PlayEvent | null = null;
    for (const ev of timeline) {
      if (ev.tick <= now) curEv = ev;
      else { nextEv = ev; break; }
    }
    const sax = activeInstrument;
    const curKeys = curEv ? sax.fingering(curEv.written) : null;
    const nextKeys = nextEv ? sax.fingering(nextEv.written) : null;
    const label = curEv ? noteName(curEv.written) : '';
    fingering.setActive(curKeys, nextKeys, label);
  }
```
Add imports for `noteName` (`import { noteName } from '../core/pitch';`). The rAF gating (start/stop on showKit) already exists; the chart updates whenever rings run. NOTE: ensure the rAF runs for sax too — the existing `startRings()` is gated on `v.showKit && v.approachRings`. Change that gate in `subscribeViz` to also start when sax is active:
```ts
    if (v.showKit && (v.approachRings || activeInstrument?.id === 'saxophone')) startRings();
    else stopRings();
```
and also call the start/stop check at the end of `focusTrack` (re-evaluate when the instrument changes):
```ts
    if (viz.showKit && (viz.approachRings || isSax)) startRings(); else stopRings();
```
- [ ] **Step 5:** Add a tiny style for the switcher (`src/styles.css`):
```css
.kit-switcher { background: var(--bg-elev-2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 11px; padding: 2px 4px; max-width: 120px; }
```
- [ ] **Step 6: Verify:** `npm run typecheck && npm test && npm run build` → all green. Manual (`npm run dev`): drum song unchanged; switch to a sax/melody track → the highway shows pitched notes AND the fingering chart lights keys (sample data) with the "unverified" caption; switching back to drums restores the kit.
- [ ] **Step 7: Checkpoint.**

---

### Task 6: Regression + review

- [ ] Full gate green. Independent review: drums unchanged; sax chart + switcher correct; no rAF leak; the `instanceof SaxophoneInstrument` / `id` checks are consistent.

---

### Task 7: Manual QA pass (controller)

- [ ] Drum demo: kit + drum highway identical to before. Switcher lists all tracks. Selecting the keys/sax track shows the pitched highway; sax shows the fingering chart with the unverified caption; missing notes show "not charted yet". Switch back to drums → kit restored, rings work.

---

### Task 8 (FOLLOW-UP, separate): Verify + complete the fingering table

- [ ] Research the full standard saxophone fingering chart (written Bb3..F6) from a reliable reference, fill `SAX_FINGERINGS` for the whole range, pick one canonical fingering per note (document the alternates dropped), then set `FINGERINGS_VERIFIED = true`. Add a test asserting a handful of well-known fingerings (e.g., low C, middle G, high D) match the reference. **Do not flip the flag until this is done.**

---

## Self-review

- **Spec coverage:** Implements spec §4 (fingering chart + data model + written-note lookup + light-up SVG + transposition-by-written-note) and the §5 saxophone detection branch, plus the instrument switcher promised at the 2a checkpoint. The data-verification risk (§4, §8 of the spec) is handled by the `FINGERINGS_VERIFIED` flag + visible caption + Task 8.
- **Placeholders:** the fingering *data* is an intentional, clearly-flagged sample (not a plan placeholder); all code is complete.
- **Type consistency:** `SaxophoneInstrument.fingering`, `fingeringFor`, `SAX_KEYS`/`SAX_FINGERINGS`, `FingeringChart.setActive`, `focusTrack`, `activeInstrument`, `updateFingering`, `noteName` used consistently.
- **Drum safety:** the drum kit SVG + animations are untouched; the chart is a parallel element shown only for `id==='saxophone'`; `updateRings` early-returns to `updateFingering` only when sax is active.
