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
