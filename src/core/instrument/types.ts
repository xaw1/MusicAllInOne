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
  color?: string;       // explicit colour (pitched lanes); overrides colorVoice
  accidental?: boolean;    // pitched: shade sharp/flat columns (Phase 2)
}

/** Strategy for one instrument family. Phase 1 keeps this minimal; the live
 *  diagram + per-note cue generalize in Phase 2. */
export interface Instrument {
  id: string;     // 'drums' | 'saxophone' | 'pitched'
  label: string;
  buildTimeline(score: any, track?: any): PlayEvent[];
  lanes(events: PlayEvent[]): LaneDef[];
}
