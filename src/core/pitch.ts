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
