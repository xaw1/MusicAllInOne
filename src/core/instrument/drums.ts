import { buildDrumTimeline } from '../timeline';
import { KIT_PIECE_ORDER, PIECE_LABEL, PIECE_VOICE } from '../drums';
import type { Instrument, PlayEvent, LaneDef } from './types';

export class DrumsInstrument implements Instrument {
  readonly id = 'drums';
  readonly label = 'Drums';

  buildTimeline(score: any, _track?: any): PlayEvent[] {
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
