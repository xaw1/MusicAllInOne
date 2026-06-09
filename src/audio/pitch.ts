/* ----------------------------------------------------------------------------
   Pitch math — Hz ⇄ MIDI ⇄ cents. Pure and dependency-free so it can be unit
   tested and reused by the detector, the tuner UI and (later) the score follower.

   Convention: MIDI 69 = A4 = 440 Hz; cents is the signed deviation (±50) from the
   nearest equal-tempered semitone.
---------------------------------------------------------------------------- */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface NoteReading {
  /** Nearest equal-tempered MIDI note. */
  midi: number;
  /** Signed deviation from that note, in cents (−50..+50). */
  cents: number;
  /** Pitch-class name, e.g. "A" or "F#". */
  name: string;
  /** Scientific-pitch octave (A4 → 4). */
  octave: number;
}

/** Fractional MIDI number for a frequency (no rounding). */
export function hzToMidiFloat(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Frequency of an (equal-tempered) MIDI note. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pitch-class + octave label for a MIDI note, e.g. 69 → "A4". */
export function midiToLabel(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

/** Nearest note + cents deviation for a frequency, or null if non-finite/≤0. */
export function hzToReading(hz: number): NoteReading | null {
  if (!(hz > 0) || !Number.isFinite(hz)) return null;
  const f = hzToMidiFloat(hz);
  const midi = Math.round(f);
  return {
    midi,
    cents: Math.round((f - midi) * 100),
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
  };
}

/** Full label for a reading, e.g. "A4". */
export function noteLabel(r: NoteReading): string {
  return `${r.name}${r.octave}`;
}

/**
 * Shift a detected frequency by whole octaves to the octave nearest an expected
 * frequency (in log-frequency). The score follower feeds the expected note here
 * to collapse OCTAVE ERRORS — the saxophone's dominant detection failure, where a
 * strong 2nd harmonic makes the detector report 2×f. With the expected note
 * known, 2×f is 1200 cents away while f is ~0, so we snap back to the right octave.
 * Non-octave (e.g. a genuine wrong note) inputs still land on their nearest octave
 * and grade as wrong downstream — this never manufactures a correct reading.
 */
export function snapToExpectedOctave(hz: number, expectedHz: number): number {
  if (!(hz > 0) || !(expectedHz > 0) || !Number.isFinite(hz) || !Number.isFinite(expectedHz)) {
    return hz;
  }
  let best = hz;
  let bestErr = Math.abs(Math.log2(hz / expectedHz));
  for (const factor of [0.25, 0.5, 2, 4]) {
    const cand = hz * factor;
    const err = Math.abs(Math.log2(cand / expectedHz));
    if (err < bestErr) {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}
