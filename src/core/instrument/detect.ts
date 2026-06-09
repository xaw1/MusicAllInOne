import { DrumsInstrument } from './drums';
import { PitchedInstrument } from './pitched';
import { SaxophoneInstrument } from './saxophone';
import type { Instrument } from './types';

function isPercussionTrack(track: any): boolean {
  const pi = track?.playbackInfo;
  if (pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9)) return true;
  return /drum|perc|kit|schlag|bater/i.test(track?.name ?? '');
}

function isSax(track: any): boolean {
  const program = track?.playbackInfo?.program;
  if (typeof program === 'number' && program >= 64 && program <= 67) return true; // GM sax family
  return /\bsax\b|saxophone|alto|tenor|soprano|baritone/i.test(track?.name ?? '');
}

/** Phase 2a: percussion -> drums, everything else -> pitched.
 *  (Phase 2b adds a saxophone branch with a fingering chart.) */
export function detectInstrument(track: any): Instrument {
  if (isPercussionTrack(track)) return new DrumsInstrument();
  if (isSax(track)) return new SaxophoneInstrument();
  return new PitchedInstrument();
}
