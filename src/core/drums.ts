/* ----------------------------------------------------------------------------
   Shared drum mapping: GM percussion number ⇄ kit piece ⇄ colour voice ⇄ limb.
   Used by the colouring (engine), the live kit, the approach rings and the
   highway so they all agree on what each note is.
---------------------------------------------------------------------------- */

import { midiToDrumVoice, type DrumVoice } from './colors';

export type KitPiece =
  | 'kick' | 'snare' | 'hihat' | 'hiTom' | 'midTom' | 'floorTom' | 'ride' | 'crash';

/** Left→right lane order for the highway, and the order rings are keyed by. */
export const KIT_PIECE_ORDER: KitPiece[] = [
  'crash', 'hihat', 'snare', 'kick', 'hiTom', 'midTom', 'floorTom', 'ride',
];

export const PIECE_LABEL: Record<KitPiece, string> = {
  kick: 'K', snare: 'SN', hihat: 'HH', hiTom: 'T1', midTom: 'T2',
  floorTom: 'FT', ride: 'RD', crash: 'CR',
};

export const PIECE_VOICE: Record<KitPiece, DrumVoice> = {
  kick: 'kick', snare: 'snare', hihat: 'hihat',
  hiTom: 'hiTom', midTom: 'midTom', floorTom: 'tom',
  ride: 'ride', crash: 'crash',
};

const MIDI_TO_PIECE: Record<number, KitPiece> = {
  35: 'kick', 36: 'kick',
  37: 'snare', 31: 'snare', 33: 'snare', // cross-stick → snare lane
  38: 'snare', 40: 'snare', 91: 'snare', 39: 'snare',
  42: 'hihat', 44: 'hihat', 46: 'hihat', 92: 'hihat',
  50: 'hiTom', 48: 'hiTom',
  47: 'midTom', 45: 'midTom',
  43: 'floorTom', 41: 'floorTom',
  49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash', 95: 'crash', 96: 'crash', 97: 'crash', 98: 'crash',
  51: 'ride', 53: 'ride', 59: 'ride', 93: 'ride', 94: 'ride', 126: 'ride', 127: 'ride',
};

export function midiToPiece(midi: number): KitPiece | null {
  return MIDI_TO_PIECE[midi] ?? null;
}

export type Limb = 'RH' | 'LH' | 'RF' | 'LF';
export const LIMB_COLOURS: Record<Limb, string> = {
  RH: '#54c8ff', LH: '#ff9d5c', RF: '#73e08a', LF: '#c98cff',
};
export function midiToLimb(midi: number): Limb {
  if (midi === 35 || midi === 36) return 'RF';
  if (midi === 44) return 'LF';
  if ([38, 40, 91, 39, 37, 31, 33, 45, 47, 41, 43].includes(midi)) return 'LH';
  return 'RH'; // hats, ride, crash, high toms
}

/** Resolve a percussion note to its General-MIDI drum number. */
export function noteDrumMidi(note: any, track: any): number {
  const arts = track?.percussionArticulations;
  const idx = note?.percussionArticulation;
  // Guard: a missing/non-numeric articulation must not leak `undefined` into
  // the MIDI maps (it would silently drop the hit from the highway/rings/kit).
  if (typeof idx !== 'number') return -1; // unknown drum → maps to null/"other"
  if (Array.isArray(arts) && idx >= 0 && idx < arts.length && arts[idx]) {
    return arts[idx].outputMidiNumber;
  }
  return idx; // alphaTab default GP7 numbering: index == drum number
}

/** Resolve a percussion note's drum number, then bucket it into a colour voice. */
export function noteDrumVoice(note: any, track: any): DrumVoice {
  return midiToDrumVoice(noteDrumMidi(note, track));
}

/** MIDI ticks per quarter note in alphaTab. */
export const QUARTER_TICKS = 960;
