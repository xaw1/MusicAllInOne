/* ----------------------------------------------------------------------------
   Drum timeline: a flat, tick-sorted list of upcoming drum hits extracted from
   the score once on load. Both the approach rings and the falling-notes highway
   read from this and position notes relative to the live tick position.
---------------------------------------------------------------------------- */

import { midiToPiece, noteDrumMidi, QUARTER_TICKS, type KitPiece } from './drums';

export interface DrumEvent {
  tick: number; // absolute playback tick of the beat
  timeMs: number; // absolute time in ms (tempo-aware), for sticking feasibility
  piece: KitPiece;
  accent: boolean;
  ghost: boolean;
  velocity: number; // 0..1
}

export function buildDrumTimeline(score: any): DrumEvent[] {
  const events: DrumEvent[] = [];
  if (!score?.tracks) return events;

  // Fallback ms-per-tick if the MIDI timer isn't available (constant tempo).
  const bpm = typeof score.tempo === 'number' && score.tempo > 0 ? score.tempo : 120;
  const msPerTick = 60000 / bpm / QUARTER_TICKS;

  for (const track of score.tracks) {
    for (const staff of track.staves ?? []) {
      for (const bar of staff.bars ?? []) {
        for (const voice of bar.voices ?? []) {
          for (const beat of voice.beats ?? []) {
            const tick = beat.absolutePlaybackStart;
            // alphaTab fills beat.timer (ms) once MIDI is generated; otherwise
            // approximate from ticks at constant tempo.
            const timer = beat.timer;
            const timeMs =
              typeof timer === 'number' && isFinite(timer) ? timer : tick * msPerTick;
            for (const note of beat.notes ?? []) {
              if (!note?.isPercussion) continue;
              const piece = midiToPiece(noteDrumMidi(note, track));
              if (!piece) continue;
              events.push({
                tick,
                timeMs,
                piece,
                accent: !!note.accentuated,
                ghost: !!note.isGhost,
                velocity:
                  typeof note.dynamics === 'number'
                    ? Math.max(0, Math.min(1, note.dynamics / 7))
                    : 0.6,
              });
            }
          }
        }
      }
    }
  }

  events.sort((a, b) => a.tick - b.tick);
  return events;
}

/** Index of the first event whose tick >= the given tick (binary search). */
export function firstIndexAtOrAfter(events: { tick: number }[], tick: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Binary search into a sorted number[] (bar/beat tick lists). */
export function firstNumAtOrAfter(ticks: number[], tick: number): number {
  let lo = 0;
  let hi = ticks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid] < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Gridline tick positions for the highway, in three tiers of prominence. */
export interface DrumGrid {
  bars: number[]; // bar starts (clearest)
  quarters: number[]; // numbered beats / quarter pulses (clearer)
  eighths: number[]; // the "&" off-beats (faint)
}

export function buildGrid(score: any): DrumGrid {
  const bars: number[] = [];
  const quarters: number[] = [];
  const eighths: number[] = [];
  const refBars = score?.tracks?.[0]?.staves?.[0]?.bars;
  if (!refBars) return { bars, quarters, eighths };

  const EIGHTH = QUARTER_TICKS / 2;
  for (const bar of refBars) {
    const firstBeat = bar?.voices?.[0]?.beats?.[0];
    if (!firstBeat) continue;
    const start = firstBeat.absolutePlaybackStart; // real bar-start tick
    bars.push(start);
    const mb = score.masterBars?.[bar.index];
    const num = mb?.timeSignatureNumerator ?? 4;
    const den = mb?.timeSignatureDenominator ?? 4;
    const barLen = num * ((QUARTER_TICKS * 4) / den);
    for (let q = 0; q * QUARTER_TICKS < barLen; q++) {
      quarters.push(start + q * QUARTER_TICKS);
    }
    for (let e = 0; e * EIGHTH < barLen; e++) {
      const off = e * EIGHTH;
      if (off % QUARTER_TICKS !== 0) eighths.push(start + off); // the "&"s only
    }
  }
  return { bars, quarters, eighths };
}
